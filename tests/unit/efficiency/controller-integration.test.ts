import { describe, it, expect } from "vitest";
import { ProactiveCompactionController, DEFAULT_COMPACTION_TRIGGER_CONFIG } from "../../../src/proactive-compaction-controller";
import { ContextEfficiencyMetrics } from "../../../src/efficiency/ContextEfficiencyMetrics";

function makeController() {
  const metrics = new ContextEfficiencyMetrics({ cacheCollector: { getCacheHitRate: () => 0.2 } });
  const controller = new ProactiveCompactionController(undefined, {
    proactiveRatio: 0.75,
    minTokens: 100,
    cooldownMs: 0, // disable cooldown for deterministic tests
    maxCompactionsPerSession: 5,
    useModelThresholds: false, // deterministic: threshold = maxTokens × 0.75
  }, metrics);
  return { controller, metrics };
}

describe("ProactiveCompactionController × ContextEfficiencyMetrics integration", () => {
  it("shouldCompact records a checkpoint without changing the recommendation", () => {
    const { controller, metrics } = makeController();
    const before = controller.shouldCompact("s1", "deepseek-v3", 100000);
    const after = controller.shouldCompact("s1", "deepseek-v3", 100000);
    // recommendation semantics unchanged
    expect(before).toEqual(after);
    // checkpoint recorded twice
    expect(metrics.getSessionReport("s1")!.utilizationSamples).toBe(2);
  });

  it("shouldCompact semantics identical with and without metrics injection", () => {
    const withMetrics = makeController().controller;
    const plain = new ProactiveCompactionController(undefined, {
      proactiveRatio: 0.75,
      minTokens: 100,
      cooldownMs: 0,
      maxCompactionsPerSession: 5,
      useModelThresholds: false,
    });
    for (const tokens of [10, 100, 999, 500000]) {
      const a = withMetrics.shouldCompact("s", "deepseek-v3", tokens);
      const b = plain.shouldCompact("s", "deepseek-v3", tokens);
      expect(a.shouldCompact).toBe(b.shouldCompact);
      expect(a.threshold).toBe(b.threshold);
      expect(a.targetTokens).toBe(b.targetTokens);
      expect(a.reason).toBe(b.reason);
    }
  });

  it("recordCompaction tracks state identically and records waste", () => {
    const { controller, metrics } = makeController();
    controller.shouldCompact("s1", "deepseek-v3", 100000);
    controller.recordCompaction("s1", 100000, 70000, 70000, 100000);
    const state = controller.getSessionState("s1")!;
    expect(state.compactionCount).toBe(1);
    expect(state.lastTokenCount).toBe(70000);
    const report = metrics.getSessionReport("s1")!;
    expect(report.compactionCount).toBe(1);
    expect(report.avgCompactionDeltaRate).toBeCloseTo(0, 5);
    expect(report.avgTriggerGap).toBeCloseTo(0, 5);
  });

  it("recordCompaction with omitted optional args keeps backward-compatible behavior", () => {
    const { controller, metrics } = makeController();
    controller.shouldCompact("s2", "deepseek-v3", 120000); // threshold = 153600
    controller.recordCompaction("s2", 120000, 80000); // no target/threshold args
    const state = controller.getSessionState("s2")!;
    expect(state.compactionCount).toBe(1);
    expect(state.lastTokenCount).toBe(80000);
    // waste recorded with checkpoint-budget fallback, no NaN
    const report = metrics.getSessionReport("s2")!;
    expect(Number.isNaN(report.avgCompactionDeltaRate)).toBe(false);
    expect(report.compactionCount).toBe(1);
  });

  it("cooldown / limit semantics unchanged after integration", () => {
    const controller = new ProactiveCompactionController(undefined, {
      proactiveRatio: 0.75,
      minTokens: 100,
      cooldownMs: 60000,
      maxCompactionsPerSession: 2,
      useModelThresholds: false,
    }, new ContextEfficiencyMetrics({ cacheCollector: { getCacheHitRate: () => 0 } }));
    const first = controller.shouldCompact("s1", "deepseek-v3", 500000);
    expect(first.shouldCompact).toBe(true);
    controller.recordCompaction("s1", 500000, 100000);
    // cooldown active → blocked
    const second = controller.shouldCompact("s1", "deepseek-v3", 500000);
    expect(second.shouldCompact).toBe(false);
    expect(second.reason).toContain("Cooldown");
  });

  it("DEFAULT_COMPACTION_TRIGGER_CONFIG untouched", () => {
    expect(DEFAULT_COMPACTION_TRIGGER_CONFIG.proactiveRatio).toBe(0.75);
    expect(DEFAULT_COMPACTION_TRIGGER_CONFIG.minTokens).toBe(50000);
    expect(DEFAULT_COMPACTION_TRIGGER_CONFIG.cooldownMs).toBe(300000);
    expect(DEFAULT_COMPACTION_TRIGGER_CONFIG.maxCompactionsPerSession).toBe(5);
  });
});
