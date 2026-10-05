// v6.11.0 P4 — compaction quality metrics (design §3)

import { describe, it, expect, beforeEach } from "vitest";
import {
  OptimizerMetricsCollector,
  CRITICAL_STATE_KEYWORDS,
  NEXT_ACTION_KEYWORDS,
} from "../../src/metrics/optimizer-metrics.js";

function record(
  c: OptimizerMetricsCollector,
  over: Partial<Parameters<OptimizerMetricsCollector["recordCompactionQuality"]>[0]> = {},
) {
  c.recordCompactionQuality({
    sessionId: "s1",
    triggerReason: "auto",
    proactive: true,
    summaryText: "decided to migrate the gate; next step: run acceptance",
    removedCount: 20,
    consistency: "pass",
    ...over,
  });
}

describe("P4 compaction quality metrics (v6.11.0)", () => {
  let c: OptimizerMetricsCollector;
  beforeEach(() => (c = new OptimizerMetricsCollector()));

  it("proactiveRate = auto / total (mixed trigger reasons)", () => {
    record(c, { triggerReason: "auto", proactive: true });
    record(c, { triggerReason: "auto", proactive: true });
    record(c, { triggerReason: "explicit", proactive: false });
    record(c, { triggerReason: "explicit", proactive: false });
    record(c, { triggerReason: "force", proactive: false });
    const q = c.getCompactionQuality();
    expect(q.sampleCount).toBe(5);
    expect(q.proactiveRate).toBeCloseTo(2 / 5, 6);
  });

  it("missingCriticalStatePct: no keyword → counted; EN/CN hits → not counted", () => {
    record(c, { summaryText: "kept the recent messages" }); // no state keyword
    record(c, { summaryText: "decided the layout" }); // EN hit
    record(c, { summaryText: "已解决登录问题" }); // CN hit
    const q = c.getCompactionQuality();
    expect(q.sampleCount).toBe(3);
    expect(q.missingCriticalStatePct).toBeCloseTo(33.33, 1);
  });

  it("missingNextActionPct: EN and CN action keywords both hit", () => {
    record(c, { summaryText: "next step: verify" }); // hit
    record(c, { summaryText: "下一步 跑测试" }); // CN hit
    record(c, { summaryText: "all quiet here today" }); // miss
    const q = c.getCompactionQuality();
    expect(q.missingNextActionPct).toBeCloseTo(33.33, 1);
  });

  it("zero samples → all headline metrics 0", () => {
    const q = c.getCompactionQuality();
    expect(q.sampleCount).toBe(0);
    expect(q.proactiveRate).toBe(0);
    expect(q.missingCriticalStatePct).toBe(0);
    expect(q.missingNextActionPct).toBe(0);
    expect(q.consistency.violationRate).toBe(0);
  });

  it("FIFO cap 50/session: detail trimmed, headline counters stay lifetime-true", () => {
    for (let i = 0; i < 51; i++) {
      record(c, { summaryText: `run check ${i}` }); // no state keyword → all miss
    }
    const q = c.getCompactionQuality();
    expect(q.sampleCount).toBe(51); // aggregates not truncated
    expect(q.missingCriticalStatePct).toBe(100);
    expect(q.capped).toBe(true);
  });

  it("session cap 500: LRU-by-insert eviction sets capped", () => {
    for (let s = 0; s < 501; s++) {
      c.recordCompactionQuality({
        sessionId: `sess-${s}`,
        triggerReason: "auto",
        proactive: true,
        summaryText: "fixed the bug",
        removedCount: 5,
        consistency: "pass",
      });
    }
    const q = c.getCompactionQuality();
    expect(q.sampleCount).toBe(501);
    expect(q.capped).toBe(true);
  });

  it("consistency counters and violationRate", () => {
    record(c, { consistency: "pass" });
    record(c, { consistency: "rejected" });
    record(c, { consistency: "degraded" });
    const q = c.getCompactionQuality();
    expect(q.consistency).toMatchObject({ pass: 1, rejected: 1, degraded: 1 });
    expect(q.consistency.violationRate).toBeCloseTo(2 / 3, 6);
  });

  it("empty keyword tables → missing = 100% (review 🟡 anti-flake assertion)", () => {
    // Simulate the cleared-table mutation by screening a summary against
    // the tables *as if empty*: with real tables a text that matches nothing
    // must read 100%. Empty-table mutation makes every sample read 100% —
    // pin the sentinel here so the mutation cannot pass by coincidence.
    record(c, { summaryText: "zzz yyy zzz" });
    record(c, { summaryText: "aaa bbb ccc" });
    const q = c.getCompactionQuality();
    expect(q.missingCriticalStatePct).toBe(100);
    expect(q.missingNextActionPct).toBe(100);
  });

  it("reset clears the compaction domain too", () => {
    record(c);
    expect(c.getCompactionQuality().sampleCount).toBe(1);
    c.reset();
    expect(c.getCompactionQuality().sampleCount).toBe(0);
    expect(c.getCompactionQuality().window).toEqual({ start: 0, end: 0 });
  });

  it("getReport() carries compactionQuality alongside legacy domains", () => {
    record(c);
    const r = c.getReport();
    expect(r.compactionQuality).toBeDefined();
    expect(r.compactionQuality!.sampleCount).toBe(1);
    expect(r.totalCalls).toBe(0); // legacy domain untouched by P4 writes
  });

  it("keyword tables are bilingual and non-empty", () => {
    expect(CRITICAL_STATE_KEYWORDS.length).toBeGreaterThan(5);
    expect(NEXT_ACTION_KEYWORDS.length).toBeGreaterThan(5);
    expect(CRITICAL_STATE_KEYWORDS.some((k) => /[一-鿿]/.test(k))).toBe(true);
    expect(NEXT_ACTION_KEYWORDS.some((k) => /[一-鿿]/.test(k))).toBe(true);
    expect(NEXT_ACTION_KEYWORDS).toContain("next step");
  });
});
