/**
 * claw-ctx — Cost / cache legibility ledger (Exo absorption #1, C1)
 *
 * Append-only annotations for compaction events: token counts, cached-token
 * share, trigger reason and strategy version. Reads never mutate the ledger;
 * writes use fs.appendFileSync only. All failures are fail-open — observability
 * must never affect the compaction path.
 */

import * as fs from "fs";
import * as path from "path";

export interface CostAnnotation {
  /** Event time, epoch ms. */
  at: number;
  event: "compaction";
  sessionId: string;
  /** Strategy identity for window comparisons, e.g. claw-ctx@6.15.1. */
  strategyVersion: string;
  triggerReason: "explicit" | "auto" | "force";
  /** Message tokens before compaction — not provider input usage (billable caliber). */
  inputTokens: number;
  /** Message tokens after compaction — not provider completion tokens. */
  outputTokens: number;
  /**
   * 0..1 share of event-time input tokens served from cache
   * (usage.cacheReadTokens / mergedTotal). `null` = no host usage was
   * reported for this session at compaction time (unknown, not 0%).
   */
  cachedTokenShare: number | null;
}

export interface CostWindow {
  from?: number;
  to?: number;
  strategyVersion?: string;
}

export interface CostWindowSummary {
  eventCount: number;
  inputTokens: number;
  outputTokens: number;
  /** Message tokens removed by compaction (inputTokens - outputTokens); not billable savings. */
  tokensSaved: number;
  /** Mean over events with a known share; `null` when no event has one. */
  avgCacheShare: number | null;
  byTrigger: Record<string, number>;
  window: { start: number; end: number };
  strategyVersions: string[];
}

const LEDGER_NAME = "cost-annotations.jsonl";

/** Per-workspace ledger path (inside the gitignored runtime dir). */
export function costLedgerPath(workspace: string): string {
  return path.join(workspace, ".claw-ctx", LEDGER_NAME);
}

/** Append one annotation. Never rewrites existing lines; fail-open. */
export function appendCostAnnotation(filePath: string, rec: CostAnnotation): boolean {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, JSON.stringify(rec) + "\n");
    return true;
  } catch {
    return false;
  }
}

/** Read all annotations; malformed lines are counted, not fatal. */
export function readCostAnnotations(filePath: string): {
  records: CostAnnotation[];
  bad: number;
} {
  let raw = "";
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return { records: [], bad: 0 };
  }
  const records: CostAnnotation[] = [];
  let bad = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as CostAnnotation;
      if (
        typeof rec.at !== "number" || typeof rec.sessionId !== "string"
        || typeof rec.inputTokens !== "number" || typeof rec.outputTokens !== "number"
        || (rec.cachedTokenShare !== null && typeof rec.cachedTokenShare !== "number")
        || typeof rec.strategyVersion !== "string"
        || typeof rec.triggerReason !== "string"
      ) {
        bad++;
        continue;
      }
      records.push(rec);
    } catch {
      bad++;
    }
  }
  return { records, bad };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Aggregate a window (pure; idempotent for the same input). */
export function summarizeCost(
  records: CostAnnotation[],
  win: CostWindow = {},
): CostWindowSummary {
  const filtered = records.filter(
    (r) =>
      (win.from === undefined || r.at >= win.from)
      && (win.to === undefined || r.at <= win.to)
      && (!win.strategyVersion || r.strategyVersion === win.strategyVersion),
  );
  const inputTokens = filtered.reduce((s, r) => s + r.inputTokens, 0);
  const outputTokens = filtered.reduce((s, r) => s + r.outputTokens, 0);
  const knownShares = filtered
    .map((r) => r.cachedTokenShare)
    .filter((s): s is number => s !== null);
  const avgCacheShare =
    knownShares.length > 0
      ? knownShares.reduce((s, v) => s + v, 0) / knownShares.length
      : null;
  const byTrigger: Record<string, number> = {};
  for (const r of filtered) {
    byTrigger[r.triggerReason] = (byTrigger[r.triggerReason] ?? 0) + 1;
  }
  return {
    eventCount: filtered.length,
    inputTokens,
    outputTokens,
    tokensSaved: Math.max(0, inputTokens - outputTokens),
    avgCacheShare: avgCacheShare === null ? null : round4(avgCacheShare),
    byTrigger,
    window: {
      start: filtered.length ? Math.min(...filtered.map((r) => r.at)) : 0,
      end: filtered.length ? Math.max(...filtered.map((r) => r.at)) : 0,
    },
    strategyVersions: [...new Set(filtered.map((r) => r.strategyVersion))].sort(),
  };
}

export interface CostComparison {
  a: CostWindowSummary;
  b: CostWindowSummary;
  delta: {
    inputTokens: number;
    outputTokens: number;
    /** `null` when either side has no known share. */
    avgCacheShare: number | null;
    eventCount: number;
  };
}

/** Compare two strategy-version windows (pure). */
export function compareCostWindows(a: CostWindowSummary, b: CostWindowSummary): CostComparison {
  return {
    a,
    b,
    delta: {
      inputTokens: b.inputTokens - a.inputTokens,
      outputTokens: b.outputTokens - a.outputTokens,
      avgCacheShare:
        a.avgCacheShare === null || b.avgCacheShare === null
          ? null
          : round4(b.avgCacheShare - a.avgCacheShare),
      eventCount: b.eventCount - a.eventCount,
    },
  };
}

function fmtShare(share: number | null): string {
  return share === null ? "n/a" : `${(share * 100).toFixed(1)}%`;
}

function fmtTime(ts: number): string {
  return ts > 0 ? new Date(ts).toISOString() : "-";
}

/** Markdown summary view (spending, cache share, trigger frequency, composition). */
export function renderCostReportMarkdown(
  summary: CostWindowSummary,
  opts: { badLines?: number; title?: string } = {},
): string {
  const triggers = Object.entries(summary.byTrigger)
    .sort((x, y) => y[1] - x[1])
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ") || "-";
  return [
    `## ${opts.title ?? "Cost / Cache Report"}`,
    "",
    `- Window: ${fmtTime(summary.window.start)} → ${fmtTime(summary.window.end)}`,
    `- Events: ${summary.eventCount}`,
    `- Input tokens: ${summary.inputTokens}`,
    `- Output tokens: ${summary.outputTokens}`,
    `- Tokens saved: ${summary.tokensSaved}`,
    `- Average cache share: ${fmtShare(summary.avgCacheShare)}`,
    `- Trigger frequency: ${triggers}`,
    `- Strategy versions: ${summary.strategyVersions.join(", ") || "-"}`,
    ...(opts.badLines ? [`- Malformed ledger lines skipped: ${opts.badLines}`] : []),
  ].join("\n");
}

/** Markdown comparison of two window summaries. */
export function renderCostComparisonMarkdown(c: CostComparison): string {
  const row = (label: string, a: number, b: number) => `| ${label} | ${a} | ${b} | ${round4(b - a)} |`;
  const shareRow =
    `| Avg cache share | ${fmtShare(c.a.avgCacheShare)} | ${fmtShare(c.b.avgCacheShare)}`
    + ` | ${c.delta.avgCacheShare === null ? "n/a" : fmtShare(c.delta.avgCacheShare)} |`;
  return [
    "## Cost / Cache Version Comparison",
    "",
    "| Metric | A | B | Delta (B-A) |",
    "|---|---|---|---|",
    row("Events", c.a.eventCount, c.b.eventCount),
    row("Input tokens", c.a.inputTokens, c.b.inputTokens),
    row("Output tokens", c.a.outputTokens, c.b.outputTokens),
    shareRow,
    "",
    `- A versions: ${c.a.strategyVersions.join(", ") || "-"}`,
    `- B versions: ${c.b.strategyVersions.join(", ") || "-"}`,
  ].join("\n");
}
