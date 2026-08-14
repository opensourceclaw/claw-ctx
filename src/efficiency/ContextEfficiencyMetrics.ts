/**
 * claw-ctx v6.6.0 — Context Efficiency Metrics Collector
 *
 * PURE OBSERVABILITY module: reads data, computes metrics, produces reports.
 * Never writes state that influences compaction decisions.
 * No adaptive logic (that is v6.7.0, explicitly out of scope).
 */

import type { EfficiencyMetric, EfficiencyReport, WasteMetric } from "./types.js";
import { modelProfileRegistry } from "../model-profile.js";
import { optimizerMetricsCollector } from "../metrics/optimizer-metrics.js";

export interface EfficiencyCollectorDeps {
  /** Provides cache hit rate at decision points. Defaults to the global singleton. */
  cacheCollector?: { getCacheHitRate(): number };
}

export class ContextEfficiencyMetrics {
  private checkpoints: Map<string, EfficiencyMetric[]> = new Map();
  private wastes: Map<string, WasteMetric[]> = new Map();
  private cacheRates: Map<string, number[]> = new Map();
  private modelBySession: Map<string, string> = new Map();
  private firstSeen: Map<string, number> = new Map();
  private lastSeen: Map<string, number> = new Map();
  private cacheCollector: { getCacheHitRate(): number };

  constructor(deps?: EfficiencyCollectorDeps) {
    this.cacheCollector = deps?.cacheCollector ?? optimizerMetricsCollector;
  }

  /**
   * Record a utilization checkpoint at a compaction decision point.
   * effectiveBudget falls back to modelProfile maxTokens × effectiveWindowRatio.
   * Also captures the current cache hit rate (correlation pair).
   */
  recordCheckpoint(
    sessionId: string,
    modelId: string,
    currentTokens: number,
    budget?: number,
    taskType?: string,
  ): void {
    const now = Date.now();
    const effectiveBudget = budget ?? this.resolveEffectiveBudget(modelId);
    const utilization =
      effectiveBudget > 0 ? currentTokens / effectiveBudget : 0;

    const metric: EfficiencyMetric = {
      sessionId,
      modelId,
      utilization,
      effectiveBudget,
      currentTokens,
      timestamp: now,
    };

    const list = this.checkpoints.get(sessionId) ?? [];
    list.push(metric);
    this.checkpoints.set(sessionId, list);
    this.modelBySession.set(sessionId, modelId);
    this.touch(sessionId, now);

    let cacheHitRate = 0;
    try {
      cacheHitRate = this.cacheCollector.getCacheHitRate();
    } catch {
      cacheHitRate = 0;
    }
    const rates = this.cacheRates.get(sessionId) ?? [];
    rates.push(cacheHitRate);
    this.cacheRates.set(sessionId, rates);
  }

  /**
   * Record a compaction event. targetTokens/threshold may be omitted —
   * then compactionDeltaRate falls back to the latest checkpoint budget
   * and triggerGap stays 0.
   */
  recordCompaction(
    sessionId: string,
    tokensBefore: number,
    tokensAfter: number,
    targetTokens?: number,
    threshold?: number,
  ): void {
    const now = Date.now();

    const latest = this.latestCheckpoint(sessionId);
    const target =
      targetTokens ?? latest?.effectiveBudget ?? tokensAfter;
    const compactionDeltaRate =
      target > 0 ? Math.abs(tokensAfter - target) / target : 0;
    const triggerGap =
      threshold !== undefined
        ? tokensBefore - threshold
        : latest !== undefined
          ? tokensBefore - latest.effectiveBudget
          : 0;

    const waste: WasteMetric = {
      sessionId,
      compactionDeltaRate,
      triggerGap,
      timestamp: now,
    };

    const list = this.wastes.get(sessionId) ?? [];
    list.push(waste);
    this.wastes.set(sessionId, list);
    this.touch(sessionId, now);
  }

  /** Record a cache hit rate sample (manual path; checkpoints record it automatically). */
  recordCacheContext(sessionId: string, cacheHitRate: number): void {
    const rates = this.cacheRates.get(sessionId) ?? [];
    rates.push(cacheHitRate);
    this.cacheRates.set(sessionId, rates);
    this.touch(sessionId, Date.now());
  }

  /** Per-session efficiency report. Undefined when the session has no data. */
  getSessionReport(sessionId: string): EfficiencyReport | undefined {
    const checkpoints = this.checkpoints.get(sessionId) ?? [];
    const wastes = this.wastes.get(sessionId) ?? [];
    const rates = this.cacheRates.get(sessionId) ?? [];
    if (checkpoints.length === 0 && wastes.length === 0 && rates.length === 0) {
      return undefined;
    }
    return this.buildReport(sessionId, checkpoints, wastes, rates);
  }

  /** Cross-session aggregate. Optional modelId filter. */
  getAggregateReport(modelId?: string): EfficiencyReport {
    const checkpoints: EfficiencyMetric[] = [];
    const wastes: WasteMetric[] = [];
    const rates: number[] = [];

    for (const [sessionId, list] of this.checkpoints) {
      if (modelId && this.modelBySession.get(sessionId) !== modelId) continue;
      checkpoints.push(...list);
    }
    for (const [sessionId, list] of this.wastes) {
      if (modelId && this.modelBySession.get(sessionId) !== modelId) continue;
      wastes.push(...list);
    }
    for (const [sessionId, list] of this.cacheRates) {
      if (modelId && this.modelBySession.get(sessionId) !== modelId) continue;
      rates.push(...list);
    }

    return this.buildReport(undefined, checkpoints, wastes, rates);
  }

  resetSession(sessionId: string): void {
    this.checkpoints.delete(sessionId);
    this.wastes.delete(sessionId);
    this.cacheRates.delete(sessionId);
    this.modelBySession.delete(sessionId);
    this.firstSeen.delete(sessionId);
    this.lastSeen.delete(sessionId);
  }

  clear(): void {
    this.checkpoints.clear();
    this.wastes.clear();
    this.cacheRates.clear();
    this.modelBySession.clear();
    this.firstSeen.clear();
    this.lastSeen.clear();
  }

  // ── Internals ──────────────────────────────────────────────────

  private buildReport(
    sessionId: string | undefined,
    checkpoints: EfficiencyMetric[],
    wastes: WasteMetric[],
    rates: number[],
  ): EfficiencyReport {
    const utilizations = checkpoints.map((c) => c.utilization);
    const avgUtilization =
      utilizations.length > 0
        ? utilizations.reduce((a, b) => a + b, 0) / utilizations.length
        : 0;
    const peakUtilization = utilizations.length > 0 ? Math.max(...utilizations) : 0;

    const deltas = wastes.map((w) => w.compactionDeltaRate);
    const avgCompactionDeltaRate =
      deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
    const gaps = wastes.map((w) => w.triggerGap);
    const avgTriggerGap =
      gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;

    const timestamps = [
      ...checkpoints.map((c) => c.timestamp),
      ...wastes.map((w) => w.timestamp),
    ];
    const start = timestamps.length > 0 ? Math.min(...timestamps) : 0;
    const end = timestamps.length > 0 ? Math.max(...timestamps) : 0;

    return {
      sessionId,
      avgUtilization,
      peakUtilization,
      utilizationSamples: utilizations.length,
      avgCompactionDeltaRate,
      avgTriggerGap,
      cacheHitRate: rates.length > 0 ? rates[rates.length - 1] : 0,
      compactionCount: wastes.length,
      timeRange: { start, end },
    };
  }

  private resolveEffectiveBudget(modelId: string): number {
    const profile = modelProfileRegistry.get(modelId);
    if (profile) {
      return Math.floor(profile.context.maxTokens * profile.context.effectiveWindowRatio);
    }
    return 0;
  }

  private latestCheckpoint(sessionId: string): EfficiencyMetric | undefined {
    const list = this.checkpoints.get(sessionId) ?? [];
    return list.length > 0 ? list[list.length - 1] : undefined;
  }

  private touch(sessionId: string, now: number): void {
    const first = this.firstSeen.get(sessionId);
    if (first === undefined || now < first) this.firstSeen.set(sessionId, now);
    const last = this.lastSeen.get(sessionId);
    if (last === undefined || now > last) this.lastSeen.set(sessionId, now);
  }
}

/** Global singleton — default instance for controller integration. */
export const contextEfficiencyMetrics = new ContextEfficiencyMetrics();
