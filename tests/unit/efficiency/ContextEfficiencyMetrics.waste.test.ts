import { describe, it, expect } from "vitest";
import { ContextEfficiencyMetrics } from "../../../src/efficiency/ContextEfficiencyMetrics";

const noCache = { getCacheHitRate: () => 0 };

describe("ContextEfficiencyMetrics — waste metrics", () => {
  it("computes compactionDeltaRate = |after-target|/target", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: noCache });
    m.recordCompaction("s1", 100000, 70000, 70000, 100000);
    const r = m.getSessionReport("s1")!;
    expect(r.avgCompactionDeltaRate).toBeCloseTo(0, 5);
  });

  it("computes triggerGap = before - threshold (late trigger positive)", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: noCache });
    m.recordCompaction("s2", 120000, 70000, 70000, 100000);
    const r = m.getSessionReport("s2")!;
    expect(r.avgTriggerGap).toBe(20000);
  });

  it("negative triggerGap for early trigger", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: noCache });
    m.recordCompaction("s3", 90000, 60000, 70000, 100000);
    const r = m.getSessionReport("s3")!;
    expect(r.avgTriggerGap).toBe(-10000);
  });

  it("fallback to latest checkpoint budget when targetTokens omitted", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: noCache });
    m.recordCheckpoint("s4", "deepseek-v3", 90000, 100000);
    // target omitted → falls back to checkpoint effectiveBudget 100000
    m.recordCompaction("s4", 90000, 80000);
    const r = m.getSessionReport("s4")!;
    expect(r.avgCompactionDeltaRate).toBeCloseTo(0.2, 5);
    // threshold omitted → gap vs checkpoint budget
    expect(r.avgTriggerGap).toBe(-10000);
  });

  it("counts compactions", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: noCache });
    m.recordCompaction("s5", 100, 50, 50, 100);
    m.recordCompaction("s5", 100, 50, 50, 100);
    m.recordCompaction("s5", 100, 50, 50, 100);
    expect(m.getSessionReport("s5")!.compactionCount).toBe(3);
  });
});
