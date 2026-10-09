/**
 * Tests for OptimizerMetricsCollector
 * claw-ctx v5.16.1
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { OptimizerMetricsCollector, optimizerMetricsCollector, stripSummaryScaffold } from '../src/metrics/optimizer-metrics.js';

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

// ── v6.13.0 OBS-3: template scaffolding must not fake the missing-% counters ──
describe('OBS-3 summary screening', () => {
  const record = (summaryText: string) => {
    const c = new OptimizerMetricsCollector();
    c.recordCompactionQuality({
      sessionId: 's',
      triggerReason: 'auto',
      proactive: true,
      summaryText,
      removedCount: 5,
      consistency: 'notMeasured',
    });
    return c.getCompactionQuality();
  };

  it('legacy template tail no longer false-positives as a next action', () => {
    // Before OBS-3 this contained "continue" → missingNext stayed 0 (false negative).
    const legacy =
      '[Compacted History — 12 earlier messages summarized]\n' +
      'Topics: general discussion\n\n' +
      'Continue with the current task using the remaining recent context below.';
    expect(record(legacy).missingNextCount).toBe(1);
  });

  it('three-section with an empty Next Action value still counts as missing', () => {
    const three =
      '[Compacted History - 5 msgs] Recorded Findings: decided the fix | ' +
      'Workspace State: ok | Next Action: ';
    expect(record(three).missingNextCount).toBe(1);
  });

  it('three-section with a real Next Action value is NOT counted missing', () => {
    const three =
      '[Compacted History - 5 msgs] Recorded Findings: decided the fix | ' +
      'Workspace State: ok | Next Action: verify the release';
    expect(record(three).missingNextCount).toBe(0);
  });

  it('stripSummaryScaffold removes only fixed scaffolding', () => {
    expect(
      stripSummaryScaffold('Continue with the current task using the remaining recent context below.').trim(),
    ).toBe('');
    expect(stripSummaryScaffold('Next Action: verify')).not.toContain('Next Action:');
    expect(stripSummaryScaffold('keep me intact')).toBe('keep me intact');
  });
});
