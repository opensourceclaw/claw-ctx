import { describe, it, expect } from "vitest";
import { ContextEfficiencyMetrics } from "../../../src/efficiency/ContextEfficiencyMetrics";

describe("ContextEfficiencyMetrics — cache hit rate correlation", () => {
  it("captures cache hit rate at each checkpoint (injected collector)", () => {
    const rates = [0.1, 0.5, 0.9];
    let i = 0;
    const collector = { getCacheHitRate: () => rates[i++] ?? 0 };
    const m = new ContextEfficiencyMetrics({ cacheCollector: collector });
    m.recordCheckpoint("s1", "deepseek-v3", 50000, 100000);
    m.recordCheckpoint("s1", "deepseek-v3", 60000, 100000);
    m.recordCheckpoint("s1", "deepseek-v3", 70000, 100000);
    // report exposes the latest rate
    expect(m.getSessionReport("s1")!.cacheHitRate).toBeCloseTo(0.9, 5);
  });

  it("recordCacheContext appends manual samples", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: { getCacheHitRate: () => 0 } });
    m.recordCacheContext("s2", 0.33);
    m.recordCacheContext("s2", 0.66);
    expect(m.getSessionReport("s2")!.cacheHitRate).toBeCloseTo(0.66, 5);
  });

  it("defaults cacheHitRate to 0 when collector throws", () => {
    const m = new ContextEfficiencyMetrics({
      cacheCollector: { getCacheHitRate: () => { throw new Error("boom"); } },
    });
    m.recordCheckpoint("s3", "deepseek-v3", 50000, 100000);
    expect(m.getSessionReport("s3")!.cacheHitRate).toBe(0);
  });
});
