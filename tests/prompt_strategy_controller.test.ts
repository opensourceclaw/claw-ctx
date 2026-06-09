import { describe, it, expect } from "vitest";
import {
  PromptStrategyController,
  DEFAULT_STRATEGY_CONFIG,
  type ReasoningStrategy,
} from "../src/prompt_strategy_controller";

describe("PromptStrategyController", () => {
  const makeCtrl = (overrides?: Partial<typeof DEFAULT_STRATEGY_CONFIG>) =>
    new PromptStrategyController(overrides);

  // ── detectTaskType ─────────────────────────────────────────────────

  describe("detectTaskType", () => {
    it("detects debugging from content", () => {
      const ctrl = makeCtrl();
      expect(ctrl.detectTaskType("fix the bug in login")).toBe("code-debugging");
    });

    it("detects testing from content", () => {
      const ctrl = makeCtrl();
      expect(ctrl.detectTaskType("add unit tests for coverage")).toBe("testing");
    });

    it("detects documentation from content", () => {
      const ctrl = makeCtrl();
      expect(ctrl.detectTaskType("update the README documentation")).toBe("documentation");
    });

    it("detects architecture from content", () => {
      const ctrl = makeCtrl();
      expect(ctrl.detectTaskType("design the microservice architecture pattern")).toBe("architecture-design");
    });

    it("returns quick-answer for empty content", () => {
      const ctrl = makeCtrl();
      expect(ctrl.detectTaskType("")).toBe("quick-answer");
    });

    it("returns quick-answer for simple question", () => {
      const ctrl = makeCtrl();
      expect(ctrl.detectTaskType("what is TypeScript?")).toBe("quick-answer");
    });
  });

  // ── detectComplexity ───────────────────────────────────────────────

  describe("detectComplexity", () => {
    it("returns 0 for empty text", () => {
      const ctrl = makeCtrl();
      expect(ctrl.detectComplexity("")).toBe(0);
    });

    it("returns low complexity for simple text", () => {
      const ctrl = makeCtrl();
      expect(ctrl.detectComplexity("What is Node.js?")).toBe(0);
    });

    it("returns higher complexity for long multi-sentence text", () => {
      const ctrl = makeCtrl();
      const text = "First we need to design the architecture. " +
        "Then we must implement several modules with various dependencies. " +
        "Next we should optimize for scale. Finally run the async function. " +
        "The trade-off here is complex. We need to consider multiple factors. " +
        "This is a longer text with more sentences to increase complexity score.";
      expect(ctrl.detectComplexity(text)).toBeGreaterThan(0);
    });
  });

  // ── selectStrategy ─────────────────────────────────────────────────

  describe("selectStrategy", () => {
    it("uses taskStrategyMap override for known types", () => {
      const ctrl = makeCtrl();
      const strategy = ctrl.selectStrategy({ taskType: "code-review", content: "" });
      expect(strategy).toBe("tree-of-thoughts");
    });

    it("returns default for unknown types", () => {
      const ctrl = makeCtrl();
      const strategy = ctrl.selectStrategy({ taskType: "unknown-type", content: "simple question" });
      expect(["chain-of-thought", "direct"]).toContain(strategy);
    });

    it("selects graph-of-thoughts for high complexity", () => {
      const ctrl = makeCtrl();
      const strategy = ctrl.selectStrategy({
        taskType: "unknown",
        content: "complex architecture design with multiple dependencies and trade-offs",
        complexity: 0.8,
      });
      expect(strategy).toBe("graph-of-thoughts");
    });

    it("selects tree-of-thoughts for medium complexity", () => {
      const ctrl = makeCtrl();
      const strategy = ctrl.selectStrategy({
        taskType: "unknown",
        content: "refactor module",
        complexity: 0.6,
      });
      expect(strategy).toBe("tree-of-thoughts");
    });

    it("selects chain-of-thought for low-medium complexity", () => {
      const ctrl = makeCtrl();
      const strategy = ctrl.selectStrategy({
        taskType: "unknown",
        content: "fix a bug",
        complexity: 0.4,
      });
      expect(strategy).toBe("chain-of-thought");
    });
  });

  // ── applyStrategy ──────────────────────────────────────────────────

  describe("applyStrategy", () => {
    it("returns prompt unchanged for direct strategy", () => {
      const ctrl = makeCtrl();
      const result = ctrl.applyStrategy("Answer the question.", "direct");
      expect(result).not.toContain("Strategy:");
    });

    it("adds CoT prompt for chain-of-thought", () => {
      const ctrl = makeCtrl();
      const result = ctrl.applyStrategy("Fix the bug.", "chain-of-thought");
      expect(result).toContain("step by step");
    });

    it("adds ToT prompt for tree-of-thoughts", () => {
      const ctrl = makeCtrl();
      const result = ctrl.applyStrategy("Review code.", "tree-of-thoughts");
      expect(result).toContain("alternative approaches");
    });

    it("adds GoT prompt for graph-of-thoughts", () => {
      const ctrl = makeCtrl();
      const result = ctrl.applyStrategy("Design API.", "graph-of-thoughts");
      expect(result).toContain("network of ideas");
    });

    it("includes self-consistency sampling when enabled", () => {
      const ctrl = makeCtrl();
      const result = ctrl.applyStrategy("Solve the problem.", "self-consistency");
      expect(result).toContain("3 independent solutions");
    });
  });

  // ── getSystemPromptAddition ────────────────────────────────────────

  describe("getSystemPromptAddition", () => {
    it("returns strategy label and prompt", () => {
      const ctrl = makeCtrl();
      const result = ctrl.getSystemPromptAddition("chain-of-thought");
      expect(result).toContain("[Strategy: chain-of-thought]");
      expect(result).toContain("step by step");
    });

    it("returns empty for direct strategy", () => {
      const ctrl = makeCtrl();
      const result = ctrl.getSystemPromptAddition("direct");
      expect(result).toBe("");
    });
  });

  // ── config ────────────────────────────────────────────────────────

  describe("config", () => {
    it("uses defaults", () => {
      const ctrl = new PromptStrategyController();
      expect(ctrl.config.defaultStrategy).toBe("chain-of-thought");
      expect(ctrl.config.selfConsistencySamples).toBe(3);
    });

    it("merges partial config", () => {
      const ctrl = new PromptStrategyController({ selfConsistencySamples: 5 });
      expect(ctrl.config.selfConsistencySamples).toBe(5);
      expect(ctrl.config.defaultStrategy).toBe("chain-of-thought");
    });
  });
});
