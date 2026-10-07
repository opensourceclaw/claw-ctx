#!/usr/bin/env node
/**
 * CX-18 — §6.5 CPU-pairing benchmark (the design-doc fixture, now versioned).
 *
 * Fixture: pretrim-style 60-message session (lorem, no screening keywords).
 * Pairing: A = legacy summary path; B = three-section + recordCompactionQuality
 * (in-process). Alternating rounds, process.cpuUsage(), median of 10 rounds.
 * Budget: (B-A)/A < 2% (design §6.5 / Friday §D ruling (a)).
 *
 * Usage:
 *   node tests/performance/paired-compaction-benchmark.mjs [--rounds N] [--json]
 *   (requires `npm run build` first — imports dist/)
 *
 * Not picked up by vitest (no .test. suffix); CI perf job runs it manually
 * via workflow_dispatch only.
 */
import { SemanticCompressor } from "../../dist/semantic-compressor.js";
import { OptimizerMetricsCollector } from "../../dist/metrics/optimizer-metrics.js";

const args = process.argv.slice(2);
const ROUNDS = (() => {
  const i = args.indexOf("--rounds");
  return i >= 0 ? Number(args[i + 1]) : 10;
})();
const AS_JSON = args.includes("--json");

// --- §6.5 fixture: pretrim-style 60 messages, no screening keywords --------
const messages = [];
for (let i = 0; i < 60; i++) {
  messages.push({
    message: {
      role: i % 2 ? "user" : "assistant",
      content:
        `message ${i} ` +
        "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor. ".repeat(8),
    },
  });
}
const tokens = messages.map((_, i) => 40 + (i % 7));

const legacy = new SemanticCompressor();
const three = new SemanticCompressor({ summarySchema: "three-section" });
const metrics = new OptimizerMetricsCollector(); // memory-only (no persist path)

const runA = (n) => {
  for (let i = 0; i < n; i++) legacy.compress(messages, tokens, 1500);
};
const runB = (n) => {
  for (let i = 0; i < n; i++) {
    const r = three.compress(messages, tokens, 1500);
    metrics.recordCompactionQuality({
      sessionId: "perf",
      triggerReason: "auto",
      proactive: true,
      summaryText: r.summary,
      removedCount: r.removedIndices.length,
      consistency: r.consistency?.status ?? "notMeasured",
    });
  }
};

// warmup: JIT tier-up both paths
runA(50);
runB(50);

const perOpA = [];
const perOpB = [];
const deltas = [];
for (let round = 0; round < ROUNDS; round++) {
  let a;
  let b;
  let c0;
  // alternate ordering to cancel drift
  if (round % 2 === 0) {
    c0 = process.cpuUsage();
    runA(200);
    a = process.cpuUsage(c0);
    c0 = process.cpuUsage();
    runB(200);
    b = process.cpuUsage(c0);
  } else {
    c0 = process.cpuUsage();
    runB(200);
    b = process.cpuUsage(c0);
    c0 = process.cpuUsage();
    runA(200);
    a = process.cpuUsage(c0);
  }
  const ms = (u) => (u.user + u.system) / 1000;
  perOpA.push(ms(a) / 200);
  perOpB.push(ms(b) / 200);
  deltas.push(((ms(b) - ms(a)) / ms(a)));
}
const median = (arr) => {
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

const result = {
  fixture: "pretrim-60msg-lorem",
  rounds: ROUNDS,
  perOpAms: Number(median(perOpA).toFixed(4)),
  perOpBms: Number(median(perOpB).toFixed(4)),
  medianDeltaPct: Number((median(deltas) * 100).toFixed(2)),
  budgetPct: 2,
  verdict: median(deltas) < 0.02 ? "PASS" : "OVER",
  loadavg: (await import("os")).loadavg().map((x) => Number(x.toFixed(2))),
  node: process.version,
  at: new Date().toISOString(),
};

if (AS_JSON) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`§6.5 paired compaction benchmark (CX-18)`);
  console.log(`  fixture:      ${result.fixture}  rounds=${ROUNDS}`);
  console.log(`  A legacy:     ${result.perOpAms} ms/op (median)`);
  console.log(`  B three+rec:  ${result.perOpBms} ms/op (median)`);
  console.log(`  delta:        ${result.medianDeltaPct}%  (budget < ${result.budgetPct}%) → ${result.verdict}`);
  console.log(`  loadavg:      ${result.loadavg.join(" ")}  node=${result.node}`);
}

// markdown for GitHub Actions job summary
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("fs");
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    [
      `### §6.5 paired compaction benchmark (CX-18)`,
      ``,
      `| metric | value |`,
      `|---|---|`,
      `| fixture | ${result.fixture} (rounds=${ROUNDS}) |`,
      `| A legacy | ${result.perOpAms} ms/op |`,
      `| B three-section + record | ${result.perOpBms} ms/op |`,
      `| **median delta** | **${result.medianDeltaPct}%** (budget < 2%) |`,
      `| verdict | ${result.verdict} |`,
      `| loadavg | ${result.loadavg.join(" ")} |`,
      `| node | ${result.node} |`,
      ``,
      `> Read with §D(a): judge over-budget against host load; CI runners are quieter than dev laptops.`,
      ``,
    ].join("\n"),
  );
}
