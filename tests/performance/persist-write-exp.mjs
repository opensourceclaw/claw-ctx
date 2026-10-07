#!/usr/bin/env node
/**
 * CX-19 — persistence write-path experiment (PROBE ONLY, no product change).
 *
 * Question (Karen probe): per-record cost stays ~176µs/op even at half load;
 * the fixed cost is suspected to sit in appendFileSync's per-call
 * open+write+close. Compare on this host:
 *   A  appendFileSync(line)            — current implementation
 *   B  fd reuse: openSync once + writeSync per record + closeSync
 *   C  buffered: collect 64 lines → one writeSync (per-record amortized)
 *
 * Run: node tests/performance/persist-write-exp.mjs [--n 5000] [--json]
 * Result: per-op µs table → pasted into the CODE receipt as data for the
 * v6.13.0 data-checkpoint decision (this batch must NOT change src/).
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const args = process.argv.slice(2);
const nIdx = args.indexOf("--n");
const N = nIdx >= 0 ? Number(args[nIdx + 1]) : 5000;
const AS_JSON = args.includes("--json");

const LINE =
  JSON.stringify({
    k: "cq",
    sessionId: "exp-perf",
    triggerReason: "auto",
    proactive: true,
    summaryText: "decided x; next step: run acceptance — " + "payload ".repeat(16),
    removedCount: 30,
    consistency: "notMeasured",
    at: Date.now(),
  }) + "\n";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cx19-exp-"));
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

let benchSeq = 0;
function bench(label, fn, reps = 5) {
  const slug = String(++benchSeq);
  fn(100, path.join(tmp, `warmup-${slug}.jsonl`)); // warmup / fs cache
  const per = [];
  for (let r = 0; r < reps; r++) {
    const f = path.join(tmp, `bench-${slug}-${r}.jsonl`);
    const c0 = process.cpuUsage();
    fn(N, f);
    const d = process.cpuUsage(c0);
    per.push((d.user + d.system) / 1000 / N); // ms/op → µs at *1000
    try { fs.unlinkSync(f); } catch {}
  }
  return { label, usPerOp: Number((median(per) * 1000).toFixed(1)) };
}

const results = [];

// A: current — appendFileSync per record (open+write+close each call)
results.push(
  bench("A appendFileSync/record", (n, f) => {
    for (let i = 0; i < n; i++) fs.appendFileSync(f, LINE);
  }),
);

// B: fd reuse — open once, writeSync per record, close once
results.push(
  bench("B fd-reuse writeSync", (n, f) => {
    const fd = fs.openSync(f, "a");
    try {
      for (let i = 0; i < n; i++) fs.writeSync(fd, LINE);
    } finally {
      fs.closeSync(fd);
    }
  }),
);

// C: buffered — 64 records per writeSync
results.push(
  bench("C buffered x64", (n, f) => {
    const fd = fs.openSync(f, "a");
    try {
      let buf = "";
      for (let i = 0; i < n; i++) {
        buf += LINE;
        if ((i + 1) % 64 === 0) {
          fs.writeSync(fd, buf);
          buf = "";
        }
      }
      if (buf) fs.writeSync(fd, buf);
    } finally {
      fs.closeSync(fd);
    }
  }),
);

const base = results[0].usPerOp;
for (const r of results) {
  r.vsA = Number(((base - r.usPerOp) / base * 100).toFixed(1)); // % saved vs A
}

const out = {
  n: N,
  reps: 5,
  lineBytes: Buffer.byteLength(LINE),
  results,
  loadavg: os.loadavg().map((x) => Number(x.toFixed(2))),
  node: process.version,
  host: `${os.platform()} ${os.release()}`,
  at: new Date().toISOString(),
  note: "PROBE ONLY — no product code changed (v6.12.0 red line); decision deferred to v6.13.0 data checkpoint.",
};

if (AS_JSON) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`CX-19 persistence write-path experiment (probe only)`);
  console.log(`  line: ${out.lineBytes} B  n=${N}  reps=${out.reps}  load=${out.loadavg.join(" ")}`);
  console.log(`  impl                         µs/op    vs A`);
  for (const r of results) {
    console.log(`  ${r.label.padEnd(28)} ${String(r.usPerOp).padStart(7)}  ${r.vsA >= 0 ? "-" + r.vsA + "%" : "+" + (-r.vsA) + "%"}`);
  }
  console.log(`  ${out.note}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
