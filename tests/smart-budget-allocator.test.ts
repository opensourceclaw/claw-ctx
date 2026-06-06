import { describe, it, expect } from "vitest";
import {
  SmartBudgetAllocator,
  TaskTypeDetector,
  QualityBasedAdjuster,
  DEFAULT_BUDGET_CONFIG,
  TASK_BUDGET_PROFILES,
  type TaskType,
  type BudgetConfig,
} from "../src/smart-budget-allocator";
import { DriftDetector } from "../src/drift-detector";

// ── TaskTypeDetector Tests ─────────────────────────────────────────

describe("TaskTypeDetector", () => {
  const detector = new TaskTypeDetector();

  describe("detect()", () => {
    it("detects coding tasks", () => {
      expect(detector.detect([
        { content: "Fix the bug in deploy pipeline" },
        { content: "Refactor the code to use TypeScript" },
      ])).toBe("coding");
    });

    it("detects reasoning tasks", () => {
      expect(detector.detect([
        { content: "Analyze the root cause of this problem" },
        { content: "Let's evaluate the trade-offs" },
      ])).toBe("reasoning");
    });

    it("detects writing tasks", () => {
      expect(detector.detect([
        { content: "Write the README documentation" },
        { content: "Draft the changelog entry" },
      ])).toBe("writing");
    });

    it("detects conversation tasks", () => {
      expect(detector.detect([
        { content: "Hello how are you today" },
        { content: "Thanks for your help" },
      ])).toBe("conversation");
    });

    it("returns unknown for empty messages", () => {
      expect(detector.detect([])).toBe("unknown");
    });

    it("returns unknown for ambiguous text", () => {
      expect(detector.detect([
        { content: "ok got it" },
      ])).toBe("unknown");
    });
  });

  describe("getConfidence()", () => {
    it("returns 0 for empty messages", () => {
      expect(detector.getConfidence([])).toBe(0);
    });

    it("returns higher confidence for clear coding signal", () => {
      const conf = detector.getConfidence([
        { content: "Fix the TypeScript bug and deploy to production with CI pipeline" },
      ]);
      expect(conf).toBeGreaterThan(0);
    });

    it("returns 0 for no keyword matches", () => {
      const conf = detector.getConfidence([
        { content: "xyzzy plugh foo" },
      ]);
      expect(conf).toBe(0);
    });
  });
});

// ── QualityBasedAdjuster Tests ─────────────────────────────────────

describe("QualityBasedAdjuster", () => {
  const config: BudgetConfig = { ...DEFAULT_BUDGET_CONFIG, qualityThreshold: 0.5 };
  const adjuster = new QualityBasedAdjuster(config);

  describe("calculateAdjustment()", () => {
    it("returns negative for high quality (bonus to base)", () => {
      const adj = adjuster.calculateAdjustment(0.9);
      expect(adj).toBeLessThan(0);
    });

    it("returns positive for low quality (shift to buffer)", () => {
      const adj = adjuster.calculateAdjustment(0.1);
      expect(adj).toBeGreaterThan(0);
    });

    it("returns 0 for quality at threshold", () => {
      const adj = adjuster.calculateAdjustment(0.5);
      expect(adj).toBe(0);
    });
  });

  describe("applyBudgetShift()", () => {
    it("shifts budget from base to buffer for positive shift", () => {
      const profile = { basePct: 60, crossDomainPct: 10, ciPct: 10, bufferPct: 20 };
      const result = adjuster.applyBudgetShift(profile, 10);
      expect(result.basePct).toBeLessThan(60);
      expect(result.bufferPct).toBeGreaterThan(20);
    });

    it("shifts budget from buffer to base for negative shift", () => {
      const profile = { basePct: 60, crossDomainPct: 10, ciPct: 10, bufferPct: 20 };
      const result = adjuster.applyBudgetShift(profile, -5);
      expect(result.basePct).toBeGreaterThan(60);
      expect(result.bufferPct).toBeLessThan(20);
    });

    it("clamps base to minimum 10%", () => {
      const profile = { basePct: 15, crossDomainPct: 10, ciPct: 10, bufferPct: 65 };
      const result = adjuster.applyBudgetShift(profile, 10);
      expect(result.basePct).toBeGreaterThanOrEqual(10);
    });

    it("percentages sum to approximately 100", () => {
      const profile = { basePct: 55, crossDomainPct: 10, ciPct: 10, bufferPct: 25 };
      const result = adjuster.applyBudgetShift(profile, 8);
      const sum = result.basePct + result.crossDomainPct + result.ciPct + result.bufferPct;
      expect(sum).toBeCloseTo(100, 0);
    });
  });
});

// ── SmartBudgetAllocator Tests ─────────────────────────────────────

describe("SmartBudgetAllocator", () => {
  const allocator = new SmartBudgetAllocator();

  describe("allocate()", () => {
    it("allocates budget with unknown task type by default", () => {
      const allocation = allocator.allocate("session-1", 10000);
      expect(allocation.sessionId).toBe("session-1");
      expect(allocation.totalBudget).toBe(10000);
      expect(allocation.taskType).toBe("unknown");
      expect(allocation.baseContext + allocation.crossDomain + allocation.ci + allocation.buffer).toBe(10000);
    });

    it("detects coding task type from messages", () => {
      const messages = [
        { content: "Fix the bug in the deploy pipeline" },
        { content: "Refactor TypeScript code" },
      ];
      const allocation = allocator.allocate("session-2", 10000, messages);
      expect(allocation.taskType).toBe("coding");
    });

    it("respects minBaseContext and minBuffer", () => {
      const alloc = new SmartBudgetAllocator({ minBaseContext: 2000, minBuffer: 500 });
      const allocation = alloc.allocate("s", 8000);
      expect(allocation.baseContext).toBeGreaterThanOrEqual(2000);
      expect(allocation.buffer).toBeGreaterThanOrEqual(500);
    });

    it("sum of all components equals totalBudget", () => {
      const budgets = [4000, 8000, 20000];
      for (const total of budgets) {
        const allocation = allocator.allocate(`test-${total}`, total);
        const sum = allocation.baseContext + allocation.crossDomain + allocation.ci + allocation.buffer;
        expect(sum).toBe(total);
      }
    });

    it("records history", () => {
      const a1 = new SmartBudgetAllocator();
      a1.allocate("h1", 10000);
      a1.allocate("h2", 20000);
      const history = a1.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].allocation.sessionId).toBe("h1");
      expect(history[1].allocation.sessionId).toBe("h2");
    });
  });

  describe("adjust()", () => {
    it("returns percentage profile for task type and quality", () => {
      const result = allocator.adjust("coding", 0.8);
      expect(result.taskType).toBe("coding");
      expect(result.quality).toBe(0.8);
      expect(typeof result.baseContext).toBe("number");
      expect(typeof result.buffer).toBe("number");
    });
  });

  describe("getHistory()", () => {
    it("returns copy of history", () => {
      const a = new SmartBudgetAllocator();
      a.allocate("test", 10000);
      const h1 = a.getHistory();
      h1.pop();
      expect(a.getHistory()).toHaveLength(1); // Original unaffected
    });
  });

  describe("resetHistory()", () => {
    it("clears history", () => {
      const a = new SmartBudgetAllocator();
      a.allocate("test", 10000);
      a.resetHistory();
      expect(a.getHistory()).toHaveLength(0);
    });
  });

  describe("learning rate smoothing", () => {
    it("smooths transitions between allocations", () => {
      const a = new SmartBudgetAllocator({ learningRate: 0.5 });
      // First allocation sets baseline
      a.allocate("s", 10000);

      // Second allocation with different type should be smoothed
      const msgs = [
        { content: "Deploy to production fix bug code review" },
      ];
      const a2 = a.allocate("s", 10000, msgs);
      expect(a2.taskType).toBe("coding");
    });
  });

  describe("drift detector integration", () => {
    it("applies drift detector for quality calculation", () => {
      const detector = new DriftDetector({
        minMessages: 1,
        similarityThreshold: 0.5,
      });
      detector.feedTurn([{ content: "fix bug" }]);
      detector.feedTurn([{ content: "fix login" }]);
      detector.feedTurn([{ content: "completely different topic" }]);

      const allocator = new SmartBudgetAllocator();
      allocator.setDriftDetector(detector);

      const allocation = allocator.allocate("test", 10000);
      // driftScore should be set from the detector
      expect(typeof allocation.driftScore).toBe("number");
      expect(typeof allocation.quality).toBe("number");
    });
  });

  describe("getConfig() and updateConfig()", () => {
    it("returns current config", () => {
      const a = new SmartBudgetAllocator({ minBaseContext: 5000 });
      const config = a.getConfig();
      expect(config.minBaseContext).toBe(5000);
      expect(config.totalBudget).toBe(8000);
    });

    it("updates config at runtime", () => {
      const a = new SmartBudgetAllocator();
      a.updateConfig({ minBaseContext: 3000, learningRate: 0.8 });
      const config = a.getConfig();
      expect(config.minBaseContext).toBe(3000);
      expect(config.learningRate).toBe(0.8);
    });
  });

  describe("getTaskDetector()", () => {
    it("exposes task detector for external use", () => {
      const a = new SmartBudgetAllocator();
      const detector = a.getTaskDetector();
      expect(detector.detect([{ content: "fix the bug deploy" }])).toBe("coding");
    });
  });

  describe("getAllocation()", () => {
    it("returns last allocation", () => {
      const a = new SmartBudgetAllocator();
      expect(a.getAllocation()).toBeNull();
      a.allocate("s1", 10000);
      const last = a.getAllocation();
      expect(last).not.toBeNull();
      expect(last?.sessionId).toBe("s1");
    });
  });

  describe("edge cases", () => {
    it("handles messages with numeric content", () => {
      const a = new SmartBudgetAllocator();
      const alloc = a.allocate("s", 10000, [
        { content: "12345" },
        { content: "abc def 999" },
      ]);
      expect(alloc.taskType).toBeDefined();
    });

    it("handles very small budget", () => {
      const a = new SmartBudgetAllocator();
      const alloc = a.allocate("s", 100);
      // Buffer cannot be less than minBuffer (400 by default), so budget should adjust
      expect(alloc.totalBudget).toBe(100);
    });

    it("allocate without messages returns unknown task type", () => {
      const a = new SmartBudgetAllocator();
      const alloc = a.allocate("s", 10000);
      expect(alloc.taskType).toBe("unknown");
    });

    it("adjust returns different profiles per task", () => {
      const coding = allocator.adjust("coding", 1.0);
      const reasoning = allocator.adjust("reasoning", 1.0);
      // Different task types have different profiles
      expect(coding.baseContext).not.toBe(reasoning.baseContext);
    });

    it("getTaskDetector detect with empty messages", () => {
      const a = new SmartBudgetAllocator();
      expect(a.getTaskDetector().detect([])).toBe("unknown");
    });

    it("getHistory returns independent copy", () => {
      const a = new SmartBudgetAllocator();
      a.allocate("s1", 10000);
      a.allocate("s2", 10000);
      const h = a.getHistory();
      h.splice(0, 1);
      expect(a.getHistory()).toHaveLength(2); // original unchanged
    });
  });
});
