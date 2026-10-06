// T3 — P4 compaction-quality ledger persistence: shape, rotation, fail-open,
// load/merge (doctor cross-process), engine switch. Red line: write failures
// must NEVER affect the compaction path.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  OptimizerMetricsCollector,
  loadCompactionQuality,
  mergeCompactionQuality,
} from "../../src/metrics/optimizer-metrics.js";
import { createClawContextEngine } from "../../src/engine.js";

const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

function recordOne(c: OptimizerMetricsCollector, over: Record<string, unknown> = {}): void {
  c.recordCompactionQuality({
    sessionId: "s1",
    triggerReason: "auto",
    proactive: true,
    summaryText: "decided x; next step: y",
    removedCount: 30,
    consistency: "notMeasured",
    ...over,
  });
}

describe("T3 ledger persistence", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-persist-"));
    file = path.join(dir, ".claw-ctx", "compaction-quality.jsonl");
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("writes parseable JSONL with full record shape + persist counters", () => {
    const c = new OptimizerMetricsCollector();
    c.setPersistPath(file);
    recordOne(c, { at: 1791300000000 });
    expect(fs.existsSync(file)).toBe(true);
    const line = fs.readFileSync(file, "utf-8").trim().split("\n")[0];
    const e = JSON.parse(line);
    expect(e.k).toBe("cq");
    expect(e.sessionId).toBe("s1");
    expect(e.summaryText).toContain("next step");
    expect(e.at).toBe(1791300000000);
    const q = c.getCompactionQuality();
    expect(q.persist?.path).toBe(file);
    expect(q.persist?.writeErrors).toBe(0);
    expect(q.persist?.bytes).toBeGreaterThan(0);
    expect(q.persist?.rotated).toBe(0);
  });

  it("rotates at >512KB (single-level .1) and keeps appending", () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "x".repeat(512 * 1024 + 1));
    const c = new OptimizerMetricsCollector();
    c.setPersistPath(file);
    recordOne(c);
    expect(fs.existsSync(file + ".1")).toBe(true);
    const fresh = fs.readFileSync(file, "utf-8");
    expect(fresh).toContain('"k":"cq"');
    expect(c.getCompactionQuality().persist?.rotated).toBe(1);
  });

  it("fail-open: unwritable persist path → no throw, writeErrors counted, memory intact", () => {
    // create a plain FILE where a directory is needed → mkdir/append must fail
    const blocker = path.join(dir, "blocker");
    fs.writeFileSync(blocker, "not-a-dir");
    const c = new OptimizerMetricsCollector();
    c.setPersistPath(path.join(blocker, "sub", "cq.jsonl"));
    expect(() => recordOne(c)).not.toThrow();
    const q = c.getCompactionQuality();
    expect(q.sampleCount).toBe(1); // in-memory totals unaffected
    expect(q.missingCriticalStatePct).toBe(0); // keyword hit intact
    expect(q.persist!.writeErrors).toBeGreaterThan(0);
  });

  it("load replays history (counts + original at) and merge sums losslessly", () => {
    const c = new OptimizerMetricsCollector();
    c.setPersistPath(file);
    recordOne(c, { at: 1791300000001, proactive: true, consistency: "pass" });
    recordOne(c, { at: 1791300000002, proactive: false, consistency: "notMeasured" });

    const { collector, loaded, bad } = loadCompactionQuality(file);
    expect(loaded).toBe(2);
    expect(bad).toBe(0);
    const disk = collector.getCompactionQuality();
    expect(disk.sampleCount).toBe(2);
    expect(disk.proactiveCount).toBe(1);
    expect(disk.consistency.pass).toBe(1);
    expect(disk.consistency.notMeasured).toBe(1);
    expect(disk.window.start).toBe(1791300000001); // original at preserved

    const proc = new OptimizerMetricsCollector();
    recordOne(proc);
    const merged = mergeCompactionQuality(disk, proc.getCompactionQuality());
    expect(merged.sampleCount).toBe(3);
    expect(merged.proactiveCount).toBe(2);
    expect(merged.window.end).toBeGreaterThanOrEqual(1791300000002);
  });

  it("tolerates corrupt lines (bad counted, good replayed)", () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ k: "cq", sessionId: "s", triggerReason: "auto", proactive: false, summaryText: "x", removedCount: 1, consistency: "pass", at: 42 }) + "\n" +
      "{not json\n" +
      JSON.stringify({ k: "other" }) + "\n",
    );
    const { loaded, bad } = loadCompactionQuality(file);
    expect(loaded).toBe(1);
    expect(bad).toBe(2);
  });

  it("engine switch: persistCompactionQuality:false → no file written; default → written", async () => {
    const mk = (cfg: Record<string, unknown>) => {
      const e = createClawContextEngine({ workspaceDir: dir, sessionResume: false, ...cfg }, mockLogger);
      const f = path.join(dir, "session.jsonl");
      const lines = Array.from({ length: 60 }, (_, i) =>
        JSON.stringify({
          type: "message",
          id: `m${i}`,
          message: { role: "user", content: `msg ${i} ` + "lorem ipsum dolor sit amet consectetur. ".repeat(6) },
        }),
      );
      fs.writeFileSync(f, lines.join("\n") + "\n");
      return { e, f };
    };

    // default (enabled): after a real compact the ledger exists
    const a = mk({});
    const ra = await a.e.compact({ sessionId: "on", sessionFile: a.f, tokenBudget: 2000, force: true, triggerReason: "force" });
    expect(ra.compacted).toBe(true);
    expect(fs.existsSync(file)).toBe(true);

    // disabled: fresh dir, no ledger ever appears
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), "cq-switch-"));
    try {
      const fB = path.join(dirB, "session.jsonl");
      fs.copyFileSync(a.f, fB);
      const eB = createClawContextEngine(
        { workspaceDir: dirB, sessionResume: false, persistCompactionQuality: false },
        mockLogger,
      );
      const rb = await eB.compact({ sessionId: "off", sessionFile: fB, tokenBudget: 2000, force: true, triggerReason: "force" });
      expect(rb.compacted).toBe(true);
      expect(fs.existsSync(path.join(dirB, ".claw-ctx", "compaction-quality.jsonl"))).toBe(false);
    } finally {
      fs.rmSync(dirB, { recursive: true, force: true });
    }
  });
});
