/**
 * Test for ProactiveCompactionController
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ProactiveCompactionController,
  DEFAULT_COMPACTION_TRIGGER_CONFIG,
} from "./proactive-compaction-controller.js";

describe("ProactiveCompactionController", () => {
  let controller: ProactiveCompactionController;

  beforeEach(() => {
    controller = new ProactiveCompactionController();
  });

  describe("shouldCompact", () => {
    it("should not recommend compaction for low token count", () => {
      const result = controller.shouldCompact("test-session", "deepseek-v3", 30000);
      expect(result.shouldCompact).toBe(false);
      expect(result.reason).toContain("below minimum");
    });

    it("should recommend compaction when threshold exceeded", () => {
      const result = controller.shouldCompact("test-session", "deepseek-v3", 110000);
      expect(result.shouldCompact).toBe(true);
      expect(result.reason).toContain("exceeds threshold");
    });

    it("should respect model-specific threshold", () => {
      // DeepSeek V3 has compressionThreshold: 100000
      const result1 = controller.shouldCompact("session1", "deepseek-v3", 90000);
      expect(result1.shouldCompact).toBe(false);

      // GLM-5.2 has compressionThreshold: 800000
      const result2 = controller.shouldCompact("session2", "glm-5.2", 90000);
      expect(result2.shouldCompact).toBe(false);

      // GPT-5.6 has compressionThreshold: 400000
      const result3 = controller.shouldCompact("session3", "gpt-5.6", 200000);
      expect(result3.shouldCompact).toBe(false);
    });

    it("should respect cooldown", () => {
      const sessionId = "cooldown-test";

      // First compaction
      const result1 = controller.shouldCompact(sessionId, "deepseek-v3", 110000);
      expect(result1.shouldCompact).toBe(true);

      // Record compaction
      controller.recordCompaction(sessionId, 110000, 70000);

      // Immediate second check should be blocked by cooldown
      const result2 = controller.shouldCompact(sessionId, "deepseek-v3", 110000);
      expect(result2.shouldCompact).toBe(false);
      expect(result2.reason).toContain("Cooldown active");
    });

    it("should respect session compaction limit", () => {
      const sessionId = "limit-test";
      // v6.4.0: use zero cooldown so the limit check (not cooldown) is exercised
      const limitController = new ProactiveCompactionController(undefined, { cooldownMs: 0 });

      // Perform max compactions
      for (let i = 0; i < DEFAULT_COMPACTION_TRIGGER_CONFIG.maxCompactionsPerSession; i++) {
        const result = limitController.shouldCompact(sessionId, "deepseek-v3", 110000);
        expect(result.shouldCompact).toBe(true);
        limitController.recordCompaction(sessionId, 110000, 70000);
      }

      // Next compaction should be blocked
      const result = limitController.shouldCompact(sessionId, "deepseek-v3", 110000);
      expect(result.shouldCompact).toBe(false);
      expect(result.reason).toContain("limit reached");
    });
  });

  describe("recordCompaction", () => {
    it("should track compaction count", () => {
      const sessionId = "track-test";

      controller.recordCompaction(sessionId, 100000, 70000);
      const state = controller.getSessionState(sessionId);

      expect(state).toBeDefined();
      expect(state?.compactionCount).toBe(1);
      expect(state?.lastTokenCount).toBe(70000);
    });

    it("should increment compaction count", () => {
      const sessionId = "increment-test";

      controller.recordCompaction(sessionId, 100000, 70000);
      controller.recordCompaction(sessionId, 70000, 50000);

      const state = controller.getSessionState(sessionId);
      expect(state?.compactionCount).toBe(2);
    });
  });

  describe("resetSession", () => {
    it("should clear session state", () => {
      const sessionId = "reset-test";

      controller.recordCompaction(sessionId, 100000, 70000);
      controller.resetSession(sessionId);

      const state = controller.getSessionState(sessionId);
      expect(state).toBeUndefined();
    });
  });

  describe("getUsageRatio", () => {
    it("should calculate usage ratio correctly", () => {
      // DeepSeek V3 has maxTokens: 128000
      const ratio = controller.getUsageRatio("deepseek-v3", 64000);
      expect(ratio).toBeCloseTo(0.5, 2);
    });

    it("should handle high token counts", () => {
      const ratio = controller.getUsageRatio("deepseek-v3", 128000);
      expect(ratio).toBe(1);
    });
  });

  describe("getStatusSummary", () => {
    it("should provide readable summary", () => {
      const summary = controller.shouldCompact("test", "deepseek-v3", 60000);
      expect(summary.reason).toBeDefined();
      expect(summary.threshold).toBeGreaterThan(0);
    });
  });

  describe("model-specific behavior", () => {
    it("should use different thresholds for different models", () => {
      const models = [
        { id: "deepseek-v3", expectedThreshold: 100000 },
        { id: "glm-5.2", expectedThreshold: 800000 },
        { id: "gpt-5.6", expectedThreshold: 400000 },
        { id: "minimax-m3", expectedThreshold: 800000 },
      ];

      for (const model of models) {
        const result = controller.shouldCompact("test", model.id, model.expectedThreshold + 10000);
        expect(result.shouldCompact).toBe(true);
        expect(result.threshold).toBe(model.expectedThreshold);
      }
    });

    it("should provide model hints", () => {
      const result = controller.shouldCompact("test", "deepseek-v3", 110000);
      expect(result.modelHint).toBeDefined();
      expect(result.modelHint?.strategy).toBe("static-prefix");
      expect(result.modelHint?.cacheStaticPrefix).toBe(true);
    });
  });

  describe("configuration", () => {
    it("should use default config", () => {
      const config = controller.getConfig();
      expect(config.proactiveRatio).toBe(DEFAULT_COMPACTION_TRIGGER_CONFIG.proactiveRatio);
      expect(config.minTokens).toBe(DEFAULT_COMPACTION_TRIGGER_CONFIG.minTokens);
    });

    it("should allow config updates", () => {
      controller.updateConfig({ proactiveRatio: 0.8 });
      const config = controller.getConfig();
      expect(config.proactiveRatio).toBe(0.8);
    });
  });

  describe("v6.10.1 reported caliber (actual usage)", () => {
    it("marks caliber=estimated when no actual usage is provided", () => {
      const result = controller.shouldCompact("cal-est", "deepseek-v3", 30000);
      expect(result.caliber).toBe("estimated");
      expect(result.currentTokens).toBe(30000);
    });

    it("uses merged reported value for the decision when actual provided", () => {
      const actual = {
        inputTokens: 60000,
        cacheReadTokens: 40000,
        cacheCreationTokens: 15000,
        outputTokens: 1000,
        mergedTotal: 115000,
      };
      // Estimate says 30000 (below minimum) but reported merged is over threshold
      const result = controller.shouldCompact("cal-rep", "deepseek-v3", 30000, undefined, actual);
      expect(result.caliber).toBe("reported");
      expect(result.currentTokens).toBe(115000);
      expect(result.shouldCompact).toBe(true);
      expect(result.reason).toContain("115000");
    });

    it("lag-by-one scenario: low post-compaction estimate, then re-expansion", () => {
      // Data 1: right after compaction the estimate is low → no trigger (legacy path misses it)
      const afterCompaction = controller.shouldCompact("lag-est", "deepseek-v3", 30000);
      expect(afterCompaction.shouldCompact).toBe(false);
      expect(afterCompaction.caliber).toBe("estimated");

      // Data 2: next turn the context re-expanded — host reports real merged usage
      const reExpanded = {
        inputTokens: 70000,
        cacheReadTokens: 35000,
        cacheCreationTokens: 10000,
        outputTokens: 0,
        mergedTotal: 115000,
      };
      const reported = controller.shouldCompact("lag-rep", "deepseek-v3", 30000, undefined, reExpanded);
      expect(reported.caliber).toBe("reported");
      expect(reported.shouldCompact).toBe(true);
      expect(reported.currentTokens).toBe(115000);
    });

    it("estimated path behavior is unchanged (zero breaking)", () => {
      const legacy = controller.shouldCompact("legacy", "deepseek-v3", 110000);
      expect(legacy.shouldCompact).toBe(true);
      expect(legacy.caliber).toBe("estimated");
      expect(legacy.currentTokens).toBe(110000);
    });
  });
});
