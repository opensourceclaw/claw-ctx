/**
 * Tests for OptimizerMetricsCollector
 * claw-ctx v5.16.1
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { OptimizerMetricsCollector, optimizerMetricsCollector } from '../src/metrics/optimizer-metrics.js';

describe('OptimizerMetricsCollector', () => {
  let collector: OptimizerMetricsCollector;

  beforeEach(() => {
    collector = new OptimizerMetricsCollector();
  });

  describe('recordStrategyUsed()', () => {
    it('should record strategy usage', () => {
      collector.recordStrategyUsed('static-prefix', 'deepseek-v3');
      collector.recordStrategyUsed('static-prefix', 'gpt-4o');
      collector.recordStrategyUsed('dynamic-load', 'minimax-m3');

      const report = collector.getReport();
      expect(report.totalCalls).toBe(3);
      expect(report.strategyUsage).toHaveLength(2);
      expect(report.strategyUsage[0].strategy).toBe('static-prefix');
      expect(report.strategyUsage[0].count).toBe(2);
    });

    it('should track model calls', () => {
      collector.recordStrategyUsed('static-prefix', 'deepseek-v3');
      collector.recordStrategyUsed('static-prefix', 'deepseek-v3');
      collector.recordStrategyUsed('static-prefix', 'gpt-4o');

      const report = collector.getReport();
      expect(report.modelCalls).toHaveLength(2);
      expect(report.modelCalls[0].modelId).toBe('deepseek-v3');
      expect(report.modelCalls[0].callCount).toBe(2);
    });
  });

  describe('recordOptimizeDuration()', () => {
    it('should record optimization durations', () => {
      collector.recordOptimizeDuration(5);
      collector.recordOptimizeDuration(10);
      collector.recordOptimizeDuration(15);

      const report = collector.getReport();
      expect(report.performance.optimizeDuration).toBe(10);
      expect(report.performance.sampleCount).toBe(3);
    });
  });

  describe('recordCacheHit()', () => {
    it('should calculate cache hit rate', () => {
      collector.recordCacheHit(true);
      collector.recordCacheHit(true);
      collector.recordCacheHit(false);

      const report = collector.getReport();
      expect(report.performance.cacheHitRate).toBeCloseTo(0.6667, 3);
    });
  });

  describe('recordTokensSaved()', () => {
    it('should accumulate tokens saved', () => {
      collector.recordTokensSaved(1000);
      collector.recordTokensSaved(500);

      const report = collector.getReport();
      expect(report.performance.tokensSaved).toBe(1500);
    });
  });

  describe('getReport()', () => {
    it('should return complete metrics report', () => {
      collector.recordStrategyUsed('static-prefix', 'deepseek-v3');
      collector.recordOptimizeDuration(10);
      collector.recordCacheHit(true);
      collector.recordTokensSaved(1000);

      const report = collector.getReport();
      expect(report.totalCalls).toBe(1);
      expect(report.strategyUsage).toBeDefined();
      expect(report.modelCalls).toBeDefined();
      expect(report.performance).toBeDefined();
      expect(report.timeRange).toBeDefined();
    });
  });

  describe('reset()', () => {
    it('should reset all metrics', () => {
      collector.recordStrategyUsed('static-prefix', 'model');
      collector.recordCacheHit(true);
      collector.recordTokensSaved(1000);

      expect(collector.getTotalCalls()).toBe(1);
      collector.reset();
      expect(collector.getTotalCalls()).toBe(0);
    });
  });

  describe('setEnabled()', () => {
    it('should disable metrics collection', () => {
      collector.setEnabled(false);
      collector.recordStrategyUsed('static-prefix', 'model');
      expect(collector.getTotalCalls()).toBe(0);
    });
  });
});

describe('optimizerMetricsCollector singleton', () => {
  it('should be an OptimizerMetricsCollector instance', () => {
    expect(optimizerMetricsCollector).toBeInstanceOf(OptimizerMetricsCollector);
  });
});
