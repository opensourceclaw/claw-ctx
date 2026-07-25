/**
 * claw-ctx — Optimizer Metrics
 *
 * Collects usage metrics for Model-Aware Context Optimization.
 * Tracks strategy usage, model calls, and performance indicators.
 *
 * v5.16.1: Initial implementation
 */

import type { OptimizationStrategy } from "../model-profile.js";

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
