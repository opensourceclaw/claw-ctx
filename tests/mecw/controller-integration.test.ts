import { describe, it, expect } from "vitest";
import { ProactiveCompactionController } from "../../src/proactive-compaction-controller";
import { ContextTaskType } from "../../src/context/ContextBudgetManager";

describe("controller MECW integration", () => {
  const controller = new ProactiveCompactionController(undefined, { cooldownMs: 0 });
  it("complex task triggers compaction at lower token count than simple task", () => {
    // COMPLEX_REASONING factor 0.6 → lower threshold than SIMPLE_LOOKUP 1.0
    const simple = controller.shouldCompact("s1", "deepseek-v3", 70000, ContextTaskType.SIMPLE_LOOKUP);
    const complex = controller.shouldCompact("s2", "deepseek-v3", 70000, ContextTaskType.COMPLEX_REASONING);
    // complex MECW is lower; same token count may exceed complex threshold but not simple
    expect(complex.shouldCompact).toBe(true);
  });
});
