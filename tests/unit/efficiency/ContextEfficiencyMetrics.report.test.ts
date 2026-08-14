import { describe, it, expect } from "vitest";
import { ContextEfficiencyMetrics } from "../../../src/efficiency/ContextEfficiencyMetrics";

const noCache = { getCacheHitRate: () => 0 };

describe("ContextEfficiencyMetrics — per-session & aggregate reports", () => {
  it("returns undefined for unknown session", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: noCache });
    expect(m.getSessionReport("nope")).toBeUndefined();
  });

  it("per-session report carries sessionId and timeRange", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: noCache });
    m.recordCheckpoint("s1", "deepseek-v3", 50000, 100000);
    const r = m.getSessionReport("s1")!;
    expect(r.sessionId).toBe("s1");
    expect(r.timeRange.start).toBeGreaterThan(0);
    expect(r.timeRange.end).toBeGreaterThanOrEqual(r.timeRange.start);
  });

  it("aggregate report merges across sessions", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: noCache });
    m.recordCheckpoint("s1", "deepseek-v3", 25000, 100000);
    m.recordCheckpoint("s2", "deepseek-v3", 75000, 100000);
    const agg = m.getAggregateReport();
    expect(agg.utilizationSamples).toBe(2);
    expect(agg.avgUtilization).toBeCloseTo(0.5, 5);
    expect(agg.sessionId).toBeUndefined();
  });

  it("aggregate report filters by modelId", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: noCache });
    m.recordCheckpoint("s1", "deepseek-v3", 10000, 100000);
    m.recordCheckpoint("s2", "gpt-4o", 90000, 100000);
    const agg = m.getAggregateReport("gpt-4o");
    expect(agg.utilizationSamples).toBe(1);
    expect(agg.avgUtilization).toBeCloseTo(0.9, 5);
    expect(m.getAggregateReport("deepseek-v3").utilizationSamples).toBe(1);
    expect(m.getAggregateReport("unknown-model").utilizationSamples).toBe(0);
  });

  it("aggregate includes waste and cache across sessions", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: { getCacheHitRate: () => 0.25 } });
    m.recordCheckpoint("s1", "deepseek-v3", 50000, 100000); // cache 0.25 recorded
    m.recordCompaction("s1", 100000, 70000, 70000, 100000);
    m.recordCompaction("s2", 100000, 80000, 70000, 100000);
    const agg = m.getAggregateReport();
    expect(agg.compactionCount).toBe(2);
    expect(agg.avgCompactionDeltaRate).toBeCloseTo((0 + 10000 / 70000) / 2, 5);
    expect(agg.cacheHitRate).toBeCloseTo(0.25, 5);
  });
});
