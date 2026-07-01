/**
 * Tests for ContextQualityEvaluator (v5.6.0)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ContextQualityEvaluator,
  DEFAULT_QUALITY_CONFIG,
} from '../../src/session-resume/context-quality-evaluator.js';
import type { HistoryEntry } from '../../src/session-resume/types.js';

function makeEntry(theme: string, keyPoints: string[] = [], timestamp = Date.now()): HistoryEntry {
  return {
    summary: {
      theme,
      pendingTasks: [],
      keyPoints,
      timestamp,
      sessionId: `session-${Math.random().toString(36).slice(2, 7)}`,
      messageCount: 5,
      entities: [],
    },
    memoryId: `mem-${Math.random().toString(36).slice(2, 7)}`,
    storedAt: timestamp,
  };
}

describe('ContextQualityEvaluator', () => {
  let evaluator: ContextQualityEvaluator;

  beforeEach(() => {
    evaluator = new ContextQualityEvaluator();
  });

  describe('evaluate', () => {
    it('QE-1: overall score calculation', () => {
      const entries = [makeEntry('API design')];
      const formatted = 'API design patterns for the project';
      const result = evaluator.evaluate(entries, formatted, 'API design');

      // Should be weighted average of dimensions
      const expectedOverall =
        DEFAULT_QUALITY_CONFIG.coverageWeight * 1.0 +  // coverage = 1.0 (all keywords present)
        DEFAULT_QUALITY_CONFIG.redundancyWeight * 1.0 +  // redundancy = 1.0 (no duplicates)
        DEFAULT_QUALITY_CONFIG.freshnessWeight * 1.0;    // freshness = 1.0 (recent)

      expect(result.overall).toBeCloseTo(expectedOverall, 2);
    });

    it('QE-2: good assessment → overall >= 0.7', () => {
      const entries = [makeEntry('API design and implementation')];
      const formatted = 'API design and implementation details';
      const result = evaluator.evaluate(entries, formatted, 'API design');
      expect(result.assessment).toBe('good');
    });

    it('QE-3: acceptable assessment → 0.4 <= overall < 0.7', () => {
      // Create evaluator with custom thresholds to force specific score
      const customEvaluator = new ContextQualityEvaluator({
        coverageWeight: 0.5,
        redundancyWeight: 0.0,
        freshnessWeight: 0.5,
        goodThreshold: 0.8,
      });

      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const entries = [makeEntry('Test', [], oneDayAgo)];
      const formatted = 'Test content';
      const result = customEvaluator.evaluate(entries, formatted, '');
      // Empty query → coverage = 1.0, freshness ~0.37
      // Overall ≈ 0.5 * 1.0 + 0.5 * 0.37 ≈ 0.68 → acceptable
      expect(result.overall).toBeGreaterThan(0.4);
      expect(result.overall).toBeLessThan(0.8);
      expect(result.assessment).toBe('acceptable');
    });

    it('QE-4: poor assessment → overall < 0.4', () => {
      const customEvaluator = new ContextQualityEvaluator({
        coverageWeight: 1.0,  // Coverage dominates
        redundancyWeight: 0.0,
        freshnessWeight: 0.0,
      });

      const entries = [makeEntry('Completely unrelated')];
      const formatted = 'Completely unrelated content here';
      const result = customEvaluator.evaluate(entries, formatted, 'API endpoint authentication');
      // No keywords matched, coverage = 0
      expect(result.overall).toBe(0.0);
      expect(result.assessment).toBe('poor');
    });

    it('QE-5: metadata populated', () => {
      const entries = [makeEntry('Test theme')];
      const formatted = 'Test theme content';
      const result = evaluator.evaluate(entries, formatted, 'Test');

      expect(result.metadata.evalTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.entryCount).toBe(1);
      expect(result.metadata.queryKeywordCount).toBeGreaterThan(0);
      expect(result.metadata.coveredKeywordCount).toBeGreaterThanOrEqual(0);
    });

    it('QE-6: evaluation time tracked', () => {
      const entries = [makeEntry('Test')];
      const formatted = 'Test content';
      const result = evaluator.evaluate(entries, formatted, 'Test');
      expect(result.metadata.evalTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.metadata.evalTimeMs).toBe('number');
    });

    it('QE-7: custom weights affect calculation', () => {
      const customEvaluator = new ContextQualityEvaluator({
        coverageWeight: 1.0,
        redundancyWeight: 0.0,
        freshnessWeight: 0.0,
      });

      const entries = [makeEntry('API design')];
      const formatted = 'API design content';
      const result = customEvaluator.evaluate(entries, formatted, 'API design');
      // With coverage weight = 1.0 and coverage = 1.0, overall should be ~1.0
      expect(result.overall).toBeCloseTo(1.0, 2);
    });

    it('QE-8: integration with real data', () => {
      const now = Date.now();
      const entries = [
        makeEntry('API implementation', ['Created REST endpoints', 'Added authentication'], now - 1000),
        makeEntry('Testing', ['Wrote unit tests', 'Added integration tests'], now - 3600000),
      ];
      const formatted = 'API implementation with REST endpoints and authentication. Testing with unit tests.';
      const result = evaluator.evaluate(entries, formatted, 'API REST endpoints');

      // Should have sensible scores
      expect(result.overall).toBeGreaterThan(0);
      expect(result.overall).toBeLessThanOrEqual(1);
      expect(result.dimensions.coverage).toBeGreaterThan(0);
      expect(result.dimensions.freshness).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT_QUALITY_CONFIG', () => {
    it('has expected default values', () => {
      expect(DEFAULT_QUALITY_CONFIG.coverageWeight).toBe(0.4);
      expect(DEFAULT_QUALITY_CONFIG.redundancyWeight).toBe(0.35);
      expect(DEFAULT_QUALITY_CONFIG.freshnessWeight).toBe(0.25);
      expect(DEFAULT_QUALITY_CONFIG.goodThreshold).toBe(0.7);
      expect(DEFAULT_QUALITY_CONFIG.acceptableThreshold).toBe(0.4);
      expect(DEFAULT_QUALITY_CONFIG.freshnessHalfLifeHours).toBe(24);
    });

    it('weights sum to 1.0', () => {
      const sum = DEFAULT_QUALITY_CONFIG.coverageWeight +
        DEFAULT_QUALITY_CONFIG.redundancyWeight +
        DEFAULT_QUALITY_CONFIG.freshnessWeight;
      expect(sum).toBeCloseTo(1.0, 2);
    });
  });
});
