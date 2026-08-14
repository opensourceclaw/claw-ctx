import { describe, it, expect } from "vitest";
import { ContextEfficiencyMetrics } from "../../../src/efficiency/ContextEfficiencyMetrics";

const noCache = { getCacheHitRate: () => 0 };

describe("ContextEfficiencyMetrics — lifecycle", () => {
  it("resetSession wipes one session only", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: noCache });
    m.recordCheckpoint("s1", "deepseek-v3", 50000, 100000);
    m.recordCheckpoint("s2", "deepseek-v3", 50000, 100000);
    m.resetSession("s1");
    expect(m.getSessionReport("s1")).toBeUndefined();
    expect(m.getSessionReport("s2")).toBeDefined();
  });

  it("clear wipes everything", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: noCache });
    m.recordCheckpoint("s1", "deepseek-v3", 50000, 100000);
    m.recordCompaction("s1", 100, 50, 50, 100);
    m.clear();
    expect(m.getSessionReport("s1")).toBeUndefined();
    expect(m.getAggregateReport().utilizationSamples).toBe(0);
    expect(m.getAggregateReport().compactionCount).toBe(0);
  });

  it("reset then reuse keeps fresh state", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: noCache });
    m.recordCheckpoint("s1", "deepseek-v3", 90000, 100000);
    m.resetSession("s1");
    m.recordCheckpoint("s1", "deepseek-v3", 10000, 100000);
    const r = m.getSessionReport("s1")!;
    expect(r.utilizationSamples).toBe(1);
    expect(r.avgUtilization).toBeCloseTo(0.1, 5);
  });
});
