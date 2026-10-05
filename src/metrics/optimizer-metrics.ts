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
  consistency: "pass" | "rejected" | "degraded";
}

export interface CompactionQualityReport {
  sampleCount: number;
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
    violationRate: number;
  };
  window: { start: number; end: number };
  /** true when FIFO/LRU caps trimmed the detail store */
  capped: boolean;
}

const MAX_RECORDS_PER_SESSION = 50;
const MAX_SESSIONS = 500;

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
  recordCompactionQuality(r: Omit<CompactionQualityRecord, "at">): void {
    if (!this.enabled) return;

    const rec: CompactionQualityRecord = { ...r, at: Date.now() };
    const t = this.metrics.compactionTotals;

    t.total++;
    if (rec.proactive) t.proactive++;
    if (!matchesAnyKeyword(rec.summaryText, CRITICAL_STATE_KEYWORDS)) t.missingState++;
    if (!matchesAnyKeyword(rec.summaryText, NEXT_ACTION_KEYWORDS)) t.missingNext++;
    if (rec.consistency === "pass") t.consistencyPass++;
    else if (rec.consistency === "rejected") t.consistencyRejected++;
    else t.consistencyDegraded++;
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
  }

  /** v6.11.0 P4: headline report (design §3 formulas). */
  getCompactionQuality(): CompactionQualityReport {
    const t = this.metrics.compactionTotals;
    const total = t.total;
    const round2 = (n: number) => Math.round(n * 100) / 100;

    return {
      sampleCount: total,
      proactiveRate: total > 0 ? t.proactive / total : 0,
      missingCriticalStatePct:
        total > 0 ? round2((100 * t.missingState) / total) : 0,
      missingNextActionPct:
        total > 0 ? round2((100 * t.missingNext) / total) : 0,
      consistency: {
        pass: t.consistencyPass,
        rejected: t.consistencyRejected,
        degraded: t.consistencyDegraded,
        violationRate:
          total > 0 ? (t.consistencyRejected + t.consistencyDegraded) / total : 0,
      },
      window: { start: t.firstAt, end: t.lastAt },
      capped: this.metrics.compactionCapped,
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
