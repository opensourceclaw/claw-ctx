#!/usr/bin/env node
/**
 * v6.13.0 P1/P3 — §6.5 CPU-pairing benchmark (per-turn overhead).
 *
 * Design §6.4: afterTurn already walks O(messages) (per-message token
 * estimation); P1 (StageProgressTrigger) + P3 (ContinuationGuard) add a
 * constant-level pass beside it. Budget: (B-A)/A < 2% (v6.11.0 §6.5 rule).
 *
 * Pairing (in-process, alternating rounds, process.cpuUsage(), median):
 *   A    existing per-turn work   — token estimation over the message window
 *   Boff A + P1(off) + P3(off)    — shipped default: early-return no-ops
 *   Bon  A + P1(boundary) + P3(armed) — opt-in worst case: full detector scan
 *
 * The shipped default is `Boff` (both switches off ⇒ v6.11.x-equivalent path).
 * `Bon` is the bounded worst case: the guard runs only while armed (windowTurns
 * turns after a compaction), so its cost is amortized, not per-turn steady state.
 *
 * Usage:
 *   node tests/performance/p13-paired-overhead-benchmark.mjs [--rounds N] [--json]
 *   (requires `npm run build` first — imports dist/)
 *
 * Not picked up by vitest (no .test. suffix).
 */
import { createTokenCounter } from "../../dist/token-counter.js";
import { StageProgressTrigger } from "../../dist/stage-progress-trigger.js";
import { ContinuationGuard } from "../../dist/continuation-guard.js";

const args = process.argv.slice(2);
const i = args.indexOf("--rounds");
const ROUNDS = i >= 0 ? Number(args[i + 1]) : 10;
const AS_JSON = args.includes("--json");

// --- fixture: 40-message window, half carrying tool_use blocks ------------
const counter = createTokenCounter();
const messages = [];
for (let n = 0; n < 40; n++) {
  const filler = "lorem ipsum dolor sit amet consectetur adipiscing elit. ".repeat(6);
  if (n % 4 === 1) {
    messages.push({
      role: "assistant",
      content: [
        { type: "text", text: `msg ${n} ${filler}` },
        { type: "tool_use", name: "read", input: { path: `src/module-${n}.ts` } },
      ],
    });
  } else {
    messages.push({ role: n % 2 ? "assistant" : "user", content: `msg ${n} ${filler}` });
  }
}

// text extraction mirrors engine._estimateMessageTokens shape
function messageTokens(m) {
  const c = m.content;
  if (typeof c === "string") return counter.count(c).tokens;
  if (Array.isArray(c)) {
    let t = 0;
    for (const b of c) {
      if (typeof b === "string") t += counter.count(b).tokens;
      else if (b?.text) t += counter.count(b.text).tokens;
      else if (b?.input) t += counter.count(JSON.stringify(b.input)).tokens;
    }
    return t;
  }
  return 0;
}

// A: existing per-turn O(messages) traversal only
// summary carries a Next Action segment ⇒ exercises the full plan-restatement path
const SUMMARY =
  "Recorded Findings: decisions recorded earlier | Workspace State: ok | " +
  "Next Action: verify the release pipeline";
const runA = (n) => {
  for (let r = 0; r < n; r++) {
    let est = 0;
    for (const m of messages) est += messageTokens(m);
    if (est < 0) throw new Error("unreachable");
  }
};

// Boff: shipped default — P1/P3 constructed disabled ⇒ early-return no-ops
const triggerOff = new StageProgressTrigger(); // enabled:false
const guardOff = new ContinuationGuard();      // enabled:false
const runBoff = (n) => {
  for (let r = 0; r < n; r++) {
    let est = 0;
    for (const m of messages) est += messageTokens(m);
    triggerOff.noteStage("perf", "A");
    triggerOff.adjustThreshold("perf", Math.floor(est * 4), est);
    guardOff.inspect("perf", messages, "");
  }
};

// Bon: opt-in worst case — P1 boundary pending + P3 armed ⇒ full detector scan
const triggerOn = new StageProgressTrigger({ enabled: true, boundaryBonus: 0.1, minTokens: 0 });
const guardOn = new ContinuationGuard({ enabled: true, windowTurns: 999999, refetchHint: true });
guardOn.arm("perf");
let stageFlip = 0;
const runBon = (n) => {
  for (let r = 0; r < n; r++) {
    let est = 0;
    for (const m of messages) est += messageTokens(m);
    triggerOn.noteStage("perf", (stageFlip++ % 2) ? "B" : "A");
    triggerOn.adjustThreshold("perf", Math.floor(est * 4), est);
    guardOn.inspect("perf", messages, SUMMARY);
  }
};

const REPS = 200;
runA(50);
runBoff(50);
runBon(50); // JIT warmup

const median = (arr) => {
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const ms = (u) => (u.user + u.system) / 1000;

const acc = { A: [], Boff: [], Bon: [] };
const deltasOff = [];      // shipped default vs existing path
const deltasOnVsOff = [];  // marginal cost of enabling P1/P3 (isolates new work)
const deltasAbs = [];      // |Boff-A|/A — the noise floor of this fixture
for (let round = 0; round < ROUNDS; round++) {
  // alternate ordering to cancel drift
  const order = round % 2 === 0 ? ["A", "Boff", "Bon"] : ["Bon", "Boff", "A"];
  const runs = { A: runA, Boff: runBoff, Bon: runBon };
  const timed = {};
  for (const k of order) {
    const c0 = process.cpuUsage();
    runs[k](REPS);
    timed[k] = ms(process.cpuUsage(c0)) / REPS;
  }
  acc.A.push(timed.A);
  acc.Boff.push(timed.Boff);
  acc.Bon.push(timed.Bon);
  deltasOff.push((timed.Boff - timed.A) / timed.A);
  deltasOnVsOff.push((timed.Bon - timed.Boff) / timed.Boff);
  deltasAbs.push(Math.abs(timed.Boff - timed.A) / timed.A);
}

// Session-amortized: the guard runs only `windowTurns` turns per compaction.
// Assume a conservative compaction cadence (design §6.4: post-compaction window).
const WINDOW_TURNS = 3;
const CADENCE_TURNS = 50;
const amortizedOnPct = median(deltasOnVsOff) * (WINDOW_TURNS / CADENCE_TURNS);

const result = {
  fixture: "p1p3-40msg-window",
  rounds: ROUNDS,
  reps: REPS,
  perOpAms: Number(median(acc.A).toFixed(4)),
  perOpBoffms: Number(median(acc.Boff).toFixed(4)),
  perOpBonms: Number(median(acc.Bon).toFixed(4)),
  medianDeltaOffPct: Number((median(deltasOff) * 100).toFixed(2)),
  medianDeltaOnVsOffPct: Number((median(deltasOnVsOff) * 100).toFixed(2)),
  noiseFloorPct: Number((median(deltasAbs) * 100).toFixed(2)),
  amortizedOnPct: Number((amortizedOnPct * 100).toFixed(2)),
  budgetPct: 2,
  verdictOff: median(deltasOff) < 0.02 ? "PASS" : "OVER",
  verdictOnVsOff: median(deltasOnVsOff) < 0.02 ? "PASS" : "OVER",
  loadavg: (await import("os")).loadavg().map((x) => Number(x.toFixed(2))),
  node: process.version,
  at: new Date().toISOString(),
};

if (AS_JSON) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`v6.13.0 P1/P3 §6.5 paired overhead benchmark`);
  console.log(`  fixture:      ${result.fixture}  rounds=${ROUNDS} reps=${REPS}`);
  console.log(`  A existing:   ${result.perOpAms} ms/op (median)`);
  console.log(`  Boff default: ${result.perOpBoffms} ms/op  vs A ${result.medianDeltaOffPct}% → ${result.verdictOff}`);
  console.log(`  Bon  armed:   ${result.perOpBonms} ms/op  vs Boff ${result.medianDeltaOnVsOffPct}% → ${result.verdictOnVsOff}`);
  console.log(`  noise floor:  ${result.noiseFloorPct}%   amortized(on): ${result.amortizedOnPct}%`);
  console.log(`  budget < ${result.budgetPct}%   loadavg: ${result.loadavg.join(" ")}  node=${result.node}`);
}
