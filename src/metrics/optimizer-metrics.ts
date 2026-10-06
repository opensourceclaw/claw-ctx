/**
 * claw-ctx — Optimizer Metrics
 *
 * Collects usage metrics for Model-Aware Context Optimization.
 * Tracks strategy usage, model calls, and performance indicators.
 *
 * v5.16.1: Initial implementation
 * v6.11.0: + compaction quality domain (P4): proactive rate,
 *           missing-critical-state %, missing-next-action % (keyword screening).
 */

import * as fs from "fs";
import * as path from "path";
import type { OptimizationStrategy } from "../model-profile.js";

// ── v6.11.0 P4: compaction quality ──────────────────────────────────────────

/**
 * Keyword tables for summary screening (paper-aligned, bilingual).
 * Exported for doctor/manual verification; changes require design review.
 */
export const CRITICAL_STATE_KEYWORDS = [
  "decided", "decision", "resolved", "fixed", "root cause", "blocked",
  "error", "failed", "regression", "breaking", "depends on", "invariant",
  "结论", "决定", "已解决", "修复", "阻塞", "失败", "回归", "依赖", "状态",
] as const;

export const NEXT_ACTION_KEYWORDS = [
  "next step", "next action", "todo", "follow-up", "will ", "should ",
  "plan to", "continue", "run ", "deploy", "verify",
  "下一步", "继续", "待办", "需要", "执行", "验证", "发布",
] as const;

/** One compaction outcome, recorded at the compact() success branch. */
export interface CompactionQualityRecord {
  at: number;
  sessionId: string;
  triggerReason: "explicit" | "auto" | "force";
  /** triggerReason === "auto" — engine self-triggered (paper: proactive) */
  proactive: boolean;
  /** The summary text actually written — keyword screening input */
  summaryText: string;
  removedCount: number;
  /** notMeasured = consistency was never evaluated (legacy schema default) */
  consistency: "pass" | "rejected" | "degraded" | "notMeasured";
}

export interface CompactionQualityReport {
  sampleCount: number;
  /** absolute counts so disk+process reports can be merged losslessly */
  proactiveCount: number;
  missingStateCount: number;
  missingNextCount: number;
  /** proactiveCount / sampleCount, 0 when sampleCount === 0 */
  proactiveRate: number;
  /** % of records whose summary matched no CRITICAL_STATE_KEYWORDS */
  missingCriticalStatePct: number;
  /** % of records whose summary matched no NEXT_ACTION_KEYWORDS */
  missingNextActionPct: number;
  consistency: {
    pass: number;
    rejected: number;
    degraded: number;
    /** CX-12: samples where consistency was never evaluated (shown explicitly,
     *  never folded into pass — unmeasured is not measured-pass) */
    notMeasured: number;
    violationRate: number;
  };
  window: { start: number; end: number };
  /** true when FIFO/LRU caps trimmed the detail store */
  capped: boolean;
  /** T3 ledger persistence status (fail-open: writeErrors never throws) */
  persist?: {
    path: string | null;
    writeErrors: number;
    bytes: number;
    rotated: number;
  };
}

const MAX_RECORDS_PER_SESSION = 50;
const MAX_SESSIONS = 500;
/** T3: rotate the JSONL when it exceeds this size (single-level .1) */
const PERSIST_ROTATE_BYTES = 512 * 1024;

/** Three-section schema heads — stripped before screening so the schema
 *  itself (literal "Next Action:") never swallows the missing-% counters. */
const SECTION_HEAD_RE = /(?:Recorded Findings|Workspace State|Next Action):/g;

function scrubSectionHeads(text: string): string {
  return text.replace(SECTION_HEAD_RE, " ");
}

function matchesAnyKeyword(text: string, keywords: readonly string[]): boolean {
  const lower = scrubSectionHeads(text).toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

/**
 * Strategy usage statistics
 */
export interface StrategyUsageStat {
  strategy: OptimizationStrategy;
  count: number;
  percentage: number;
}

/**
 * Model call statistics
 */
export interface ModelCallStat {
  modelId: string;
  callCount: number;
  lastCall: number;
}

/**
 * Performance statistics
 */
export interface PerformanceStat {
  optimizeDuration: number;
  cacheHitRate: number;
  tokensSaved: number;
  sampleCount: number;
}

/**
 * Complete optimizer metrics report
 */
export interface OptimizerMetrics {
  strategyUsage: StrategyUsageStat[];
  modelCalls: ModelCallStat[];
  performance: PerformanceStat;
  timeRange: { start: number; end: number };
  totalCalls: number;
  /** v6.11.0: present once compaction quality domain has data (or is queried) */
  compactionQuality?: CompactionQualityReport;
}

/**
 * Internal metrics storage
 */
interface InternalMetrics {
  strategyCounts: Map<OptimizationStrategy, number>;
  modelCalls: Map<string, { count: number; lastCall: number }>;
  optimizeDurations: number[];
  cacheHits: number;
  cacheMisses: number;
  tokensSavedTotal: number;
  startTime: number;
  lastUpdateTime: number;
  totalCalls: number;
  // v6.11.0: compaction quality store (per-session FIFO, LRU by insert)
  compactionBySession: Map<string, CompactionQualityRecord[]>;
  compactionOrder: string[];
  compactionTotals: {
    total: number;
    proactive: number;
    missingState: number;
    missingNext: number;
    consistencyPass: number;
    consistencyRejected: number;
    consistencyDegraded: number;
    consistencyNotMeasured: number;
    firstAt: number;
    lastAt: number;
  };
  compactionCapped: boolean;
}

/**
 * Optimizer Metrics Collector
 */
export class OptimizerMetricsCollector {
  private metrics: InternalMetrics;
  private enabled: boolean = true;

  constructor() {
    this.metrics = this.createEmptyMetrics();
  }

  private createEmptyMetrics(): InternalMetrics {
    return {
      strategyCounts: new Map(),
      modelCalls: new Map(),
      optimizeDurations: [],
      cacheHits: 0,
      cacheMisses: 0,
      tokensSavedTotal: 0,
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      totalCalls: 0,
      compactionBySession: new Map(),
      compactionOrder: [],
      compactionTotals: {
        total: 0,
        proactive: 0,
        missingState: 0,
        missingNext: 0,
        consistencyPass: 0,
        consistencyRejected: 0,
        consistencyDegraded: 0,
        consistencyNotMeasured: 0,
        firstAt: 0,
        lastAt: 0,
      },
      compactionCapped: false,
    };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  recordStrategyUsed(strategy: OptimizationStrategy, modelId: string): void {
    if (!this.enabled) return;

    const currentCount = this.metrics.strategyCounts.get(strategy) ?? 0;
    this.metrics.strategyCounts.set(strategy, currentCount + 1);

    const modelStat = this.metrics.modelCalls.get(modelId) ?? { count: 0, lastCall: 0 };
    modelStat.count++;
    modelStat.lastCall = Date.now();
    this.metrics.modelCalls.set(modelId, modelStat);

    this.metrics.totalCalls++;
    this.metrics.lastUpdateTime = Date.now();
  }

  recordOptimizeDuration(durationMs: number): void {
    if (!this.enabled) return;

    if (this.metrics.optimizeDurations.length >= 1000) {
      this.metrics.optimizeDurations.shift();
    }
    this.metrics.optimizeDurations.push(durationMs);
    this.metrics.lastUpdateTime = Date.now();
  }

  recordCacheHit(hit: boolean): void {
    if (!this.enabled) return;

    if (hit) {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
    }
    this.metrics.lastUpdateTime = Date.now();
  }

  recordTokensSaved(tokens: number): void {
    if (!this.enabled) return;

    this.metrics.tokensSavedTotal += tokens;
    this.metrics.lastUpdateTime = Date.now();
  }

  /**
   * v6.11.0 P4: record one compaction outcome.
   * Aggregate counters are lifetime-true (FIFO trimming affects only the
   * per-session detail store, not the three headline metrics).
   */
  recordCompactionQuality(r: Omit<CompactionQualityRecord, "at"> & { at?: number }): void {
    if (!this.enabled) return;

    const rec: CompactionQualityRecord = { ...r, at: r.at ?? Date.now() };
    const t = this.metrics.compactionTotals;

    t.total++;
    if (rec.proactive) t.proactive++;
    if (!matchesAnyKeyword(rec.summaryText, CRITICAL_STATE_KEYWORDS)) t.missingState++;
    if (!matchesAnyKeyword(rec.summaryText, NEXT_ACTION_KEYWORDS)) t.missingNext++;
    if (rec.consistency === "pass") t.consistencyPass++;
    else if (rec.consistency === "rejected") t.consistencyRejected++;
    else if (rec.consistency === "degraded") t.consistencyDegraded++;
    else t.consistencyNotMeasured++;
    if (t.firstAt === 0) t.firstAt = rec.at;
    t.lastAt = rec.at;

    let list = this.metrics.compactionBySession.get(rec.sessionId);
    if (!list) {
      list = [];
      this.metrics.compactionBySession.set(rec.sessionId, list);
      this.metrics.compactionOrder.push(rec.sessionId);
      if (this.metrics.compactionOrder.length > MAX_SESSIONS) {
        const evicted = this.metrics.compactionOrder.shift();
        if (evicted !== undefined) this.metrics.compactionBySession.delete(evicted);
        this.metrics.compactionCapped = true;
      }
    }
    list.push(rec);
    if (list.length > MAX_RECORDS_PER_SESSION) {
      list.shift();
      this.metrics.compactionCapped = true;
    }

    this.metrics.lastUpdateTime = rec.at;
    this.persistRecord(rec);
  }

  // --- T3 ledger persistence (fail-open: never throws into the caller) ---

  /** Point the collector at a JSONL file; unset = memory only. */
  setPersistPath(p?: string): void {
    this.persistPath = p;
    this.persistBytes = 0;
    this.persistWriteErrors = 0;
    this.persistRotated = 0;
    if (p) {
      try {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        this.persistBytes = fs.existsSync(p) ? fs.statSync(p).size : 0;
      } catch {
        this.persistWriteErrors++;
      }
    }
  }

  private persistPath?: string;
  private persistBytes = 0;
  private persistWriteErrors = 0;
  private persistRotated = 0;

  private persistRecord(rec: CompactionQualityRecord): void {
    if (!this.persistPath) return;
    try {
      // rotation via in-memory byte counter — no per-record statSync (the
      // stat+mkdir pair dominated the §D pairing budget at 17%)
      if (this.persistBytes > PERSIST_ROTATE_BYTES) {
        fs.renameSync(this.persistPath, this.persistPath + ".1");
        this.persistRotated++;
        this.persistBytes = 0;
      }
      const line = JSON.stringify({ k: "cq", ...rec }) + "\n";
      // sync append chosen after §D re-check: the async fire-and-forget
      // fallback measured THE SAME cpu-pairing cost (process.cpuUsage
      // includes the fs threadpool) while weakening read-after-write —
      // data + §D numbers + alternatives are filed in the CODE receipt.
      fs.appendFileSync(this.persistPath, line);
      this.persistBytes += Buffer.byteLength(line);
    } catch {
      // red line: persistence failure must never affect the compaction path
      this.persistWriteErrors++;
    }
  }

  /** v6.11.0 P4: headline report (design §3 formulas). */
  getCompactionQuality(): CompactionQualityReport {
    const t = this.metrics.compactionTotals;
    const total = t.total;
    const round2 = (n: number) => Math.round(n * 100) / 100;

    return {
      sampleCount: total,
      proactiveCount: t.proactive,
      missingStateCount: t.missingState,
      missingNextCount: t.missingNext,
      proactiveRate: total > 0 ? t.proactive / total : 0,
      missingCriticalStatePct:
        total > 0 ? round2((100 * t.missingState) / total) : 0,
      missingNextActionPct:
        total > 0 ? round2((100 * t.missingNext) / total) : 0,
      consistency: {
        pass: t.consistencyPass,
        rejected: t.consistencyRejected,
        degraded: t.consistencyDegraded,
        notMeasured: t.consistencyNotMeasured,
        violationRate:
          total > 0 ? (t.consistencyRejected + t.consistencyDegraded) / total : 0,
      },
      window: { start: t.firstAt, end: t.lastAt },
      capped: this.metrics.compactionCapped,
      persist: {
        path: this.persistPath ?? null,
        writeErrors: this.persistWriteErrors,
        bytes: this.persistBytes,
        rotated: this.persistRotated,
      },
    };
  }

  getReport(): OptimizerMetrics {
    const { strategyCounts, modelCalls, optimizeDurations, cacheHits, cacheMisses, tokensSavedTotal, startTime, lastUpdateTime, totalCalls } = this.metrics;

    const strategyUsage: StrategyUsageStat[] = [];
    for (const [strategy, count] of strategyCounts) {
      strategyUsage.push({
        strategy,
        count,
        percentage: totalCalls > 0 ? Math.round((count / totalCalls) * 10000) / 100 : 0,
      });
    }
    strategyUsage.sort((a, b) => b.count - a.count);

    const modelCallList: ModelCallStat[] = [];
    for (const [modelId, stat] of modelCalls) {
      modelCallList.push({ modelId, callCount: stat.count, lastCall: stat.lastCall });
    }
    modelCallList.sort((a, b) => b.callCount - a.callCount);
    const topModelCalls = modelCallList.slice(0, 20);

    const avgDuration = optimizeDurations.length > 0
      ? Math.round(optimizeDurations.reduce((a, b) => a + b, 0) / optimizeDurations.length)
      : 0;

    const totalCacheOps = cacheHits + cacheMisses;
    const cacheHitRate = totalCacheOps > 0
      ? Math.round((cacheHits / totalCacheOps) * 10000) / 10000
      : 0;

    return {
      strategyUsage,
      modelCalls: topModelCalls,
      performance: {
        optimizeDuration: avgDuration,
        cacheHitRate,
        tokensSaved: tokensSavedTotal,
        sampleCount: optimizeDurations.length,
      },
      timeRange: { start: startTime, end: lastUpdateTime },
      totalCalls,
      // v6.11.0 P4: always present in report (zero-sample report is valid)
      compactionQuality: this.getCompactionQuality(),
    };
  }

  getSummary(): string {
    const report = this.getReport();
    const lines = [
      `Optimizer Metrics Summary:`,
      `  Total Calls: ${report.totalCalls}`,
      `  Strategy Usage:`,
    ];

    for (const stat of report.strategyUsage) {
      lines.push(`    ${stat.strategy}: ${stat.count} (${stat.percentage}%)`);
    }

    if (report.modelCalls.length > 0) {
      lines.push(`  Top Models:`);
      for (const model of report.modelCalls.slice(0, 5)) {
        lines.push(`    ${model.modelId}: ${model.callCount} calls`);
      }
    }

    lines.push(`  Performance:`);
    lines.push(`    Avg Duration: ${report.performance.optimizeDuration}ms`);
    lines.push(`    Cache Hit Rate: ${(report.performance.cacheHitRate * 100).toFixed(1)}%`);
    lines.push(`    Tokens Saved: ${report.performance.tokensSaved.toLocaleString()}`);

    return lines.join("\n");
  }

  reset(): void {
    this.metrics = this.createEmptyMetrics();
    this.persistBytes = 0;
    this.persistWriteErrors = 0;
    this.persistRotated = 0;
    // persistPath intentionally survives reset (identity is collector-scoped)
  }

  getTotalCalls(): number {
    return this.metrics.totalCalls;
  }

  getTokensSaved(): number {
    return this.metrics.tokensSavedTotal;
  }

  getCacheHitRate(): number {
    const { cacheHits, cacheMisses } = this.metrics;
    const total = cacheHits + cacheMisses;
    return total > 0 ? cacheHits / total : 0;
  }
}

export const optimizerMetricsCollector = new OptimizerMetricsCollector();

/**
 * T3: replay a persisted JSONL into a fresh in-memory collector
 * (no persistPath → no write-back during replay). Unparseable lines are
 * counted, not fatal (doctor must stay usable on a partially corrupt file).
 */
export function loadCompactionQuality(filePath: string): {
  collector: OptimizerMetricsCollector;
  loaded: number;
  bad: number;
} {
  const c = new OptimizerMetricsCollector();
  let loaded = 0;
  let bad = 0;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line) as Record<string, unknown>;
        if (e.k === "cq" && typeof e.sessionId === "string") {
          c.recordCompactionQuality({
            sessionId: e.sessionId,
            triggerReason: e.triggerReason as CompactionQualityRecord["triggerReason"],
            proactive: Boolean(e.proactive),
            summaryText: typeof e.summaryText === "string" ? e.summaryText : "",
            removedCount: Number(e.removedCount ?? 0),
            consistency: (e.consistency as CompactionQualityRecord["consistency"]) ?? "notMeasured",
            at: typeof e.at === "number" ? e.at : undefined,
          });
          loaded++;
        } else {
          bad++;
        }
      } catch {
        bad++;
      }
    }
  } catch {
    bad = -1; // unreadable file
  }
  return { collector: c, loaded, bad };
}

/** T3: lossless merge of two reports via their absolute counts. */
export function mergeCompactionQuality(
  a: CompactionQualityReport,
  b: CompactionQualityReport,
): CompactionQualityReport {
  const total = a.sampleCount + b.sampleCount;
  const pc = a.proactiveCount + b.proactiveCount;
  const ms = a.missingStateCount + b.missingStateCount;
  const mn = a.missingNextCount + b.missingNextCount;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const nzMin = (x: number, y: number) => (x === 0 ? y : y === 0 ? x : Math.min(x, y));
  return {
    sampleCount: total,
    proactiveCount: pc,
    missingStateCount: ms,
    missingNextCount: mn,
    proactiveRate: total > 0 ? pc / total : 0,
    missingCriticalStatePct: total > 0 ? r2((100 * ms) / total) : 0,
    missingNextActionPct: total > 0 ? r2((100 * mn) / total) : 0,
    consistency: {
      pass: a.consistency.pass + b.consistency.pass,
      rejected: a.consistency.rejected + b.consistency.rejected,
      degraded: a.consistency.degraded + b.consistency.degraded,
      notMeasured: a.consistency.notMeasured + b.consistency.notMeasured,
      violationRate:
        total > 0
          ? (a.consistency.rejected + b.consistency.rejected +
             a.consistency.degraded + b.consistency.degraded) / total
          : 0,
    },
    window: {
      start: nzMin(a.window.start, b.window.start),
      end: Math.max(a.window.end, b.window.end),
    },
    capped: a.capped || b.capped,
    persist: b.persist ?? a.persist,
  };
}
