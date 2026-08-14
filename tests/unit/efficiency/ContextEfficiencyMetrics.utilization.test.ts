import { describe, it, expect } from "vitest";
import { ContextEfficiencyMetrics } from "../../../src/efficiency/ContextEfficiencyMetrics";

const noCache = { getCacheHitRate: () => 0 };

describe("ContextEfficiencyMetrics — utilization checkpoints", () => {
  it("computes utilization = currentTokens / budget (explicit budget)", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: noCache });
    m.recordCheckpoint("s1", "deepseek-v3", 50000, 100000, "code");
    const r = m.getSessionReport("s1")!;
    expect(r.avgUtilization).toBeCloseTo(0.5, 5);
    expect(r.utilizationSamples).toBe(1);
  });

  it("falls back to model profile maxTokens × effectiveWindowRatio", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: noCache });
    // deepseek-v3 profile: 128000 × 0.9 = 115200
    m.recordCheckpoint("s2", "deepseek-v3", 57600);
    const r = m.getSessionReport("s2")!;
    expect(r.avgUtilization).toBeCloseTo(0.5, 5);
  });

  it("guards zero budget → utilization 0 (no NaN)", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: noCache });
    m.recordCheckpoint("s3", "unknown-model-xyz", 1000);
    const r = m.getSessionReport("s3")!;
    expect(r.avgUtilization).toBe(0);
    expect(Number.isNaN(r.avgUtilization)).toBe(false);
  });

  it("tracks peak utilization across samples", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: noCache });
    m.recordCheckpoint("s4", "deepseek-v3", 25000, 100000);
    m.recordCheckpoint("s4", "deepseek-v3", 90000, 100000);
    m.recordCheckpoint("s4", "deepseek-v3", 50000, 100000);
    const r = m.getSessionReport("s4")!;
    expect(r.peakUtilization).toBeCloseTo(0.9, 5);
    expect(r.utilizationSamples).toBe(3);
    expect(r.avgUtilization).toBeCloseTo((0.25 + 0.9 + 0.5) / 3, 5);
  });
});
