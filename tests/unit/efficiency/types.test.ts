import { describe, it, expect } from "vitest";
import { ContextEfficiencyMetrics } from "../../../src/efficiency/ContextEfficiencyMetrics";
import type { EfficiencyMetric, EfficiencyReport, WasteMetric } from "../../../src/efficiency/types";

const noCache = { getCacheHitRate: () => 0 };

describe("efficiency types & barrel", () => {
  it("EfficiencyMetric shape is populated by recordCheckpoint", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: noCache });
    m.recordCheckpoint("s1", "deepseek-v3", 50000, 100000, "code");
    const r = m.getSessionReport("s1")!;
    const expected: EfficiencyMetric = {
      sessionId: "s1", modelId: "deepseek-v3",
      utilization: 0.5, effectiveBudget: 100000, currentTokens: 50000,
      timestamp: expect.any(Number) as unknown as number,
    };
    expect(r.utilizationSamples).toBe(1);
    expect(expected.utilization).toBe(0.5);
  });

  it("WasteMetric semantics documented via report", () => {
    const m = new ContextEfficiencyMetrics({ cacheCollector: noCache });
    m.recordCompaction("s1", 120000, 70000, 70000, 100000);
    const report: EfficiencyReport = m.getSessionReport("s1")!;
    expect(report.avgTriggerGap).toBe(20000);
    const waste: WasteMetric = {
      sessionId: "s1", compactionDeltaRate: 0, triggerGap: 20000, timestamp: expect.any(Number) as unknown as number,
    };
    expect(waste.triggerGap).toBe(20000);
  });

  it("barrel exports singleton and class", async () => {
    const mod = await import("../../../src/efficiency/index");
    expect(typeof mod.ContextEfficiencyMetrics).toBe("function");
    expect(mod.contextEfficiencyMetrics).toBeInstanceOf(mod.ContextEfficiencyMetrics);
  });
});
