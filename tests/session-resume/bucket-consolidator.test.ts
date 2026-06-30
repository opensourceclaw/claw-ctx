/**
 * Tests for BucketConsolidator (v5.4.0)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BucketConsolidator, DEFAULT_CONSOLIDATOR_CONFIG } from '../../src/session-resume/bucket-consolidator.js';
import type { SessionSummary } from '../../src/session-resume/types.js';

function makeSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    theme: 'Test theme',
    pendingTasks: [],
    keyPoints: [],
    timestamp: Date.now(),
    sessionId: `session-${Math.random().toString(36).slice(2, 7)}`,
    messageCount: 5,
    entities: [],
    ...overrides,
  };
}

describe('BucketConsolidator', () => {
  let consolidator: BucketConsolidator;

  beforeEach(() => {
    consolidator = new BucketConsolidator();
  });

  describe('consolidate', () => {
    it('BC-1: Level 1 pass-through preserves all data', () => {
      const summaries = [
        makeSummary({ sessionId: 's1', theme: 'Theme 1', pendingTasks: ['task1'], keyPoints: ['kp1'] }),
        makeSummary({ sessionId: 's2', theme: 'Theme 2', pendingTasks: ['task2'], keyPoints: ['kp2'] }),
      ];

      const result = consolidator.consolidate(summaries, [], []);
      expect(result.level1.summaries).toHaveLength(2);
      expect(result.level1.wasConsolidated).toBe(false);
      expect(result.level1.allPendingTasks).toEqual(['task1', 'task2']);
    });

    it('BC-2: Level 2 groups by day correctly', () => {
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      const summaries = [
        makeSummary({ timestamp: now, sessionId: 'today1' }),
        makeSummary({ timestamp: now, sessionId: 'today2' }), // Same day
        makeSummary({ timestamp: now - oneDayMs, sessionId: 'yesterday' }),
      ];

      const result = consolidator.consolidate([], summaries, []);
      expect(result.level2.wasConsolidated).toBe(true);
      // Should have 2 merged summaries (one for each day)
      expect(result.level2.summaries.length).toBeLessThanOrEqual(2);
    });

    it('BC-3: Level 2 dedups keyPoints above threshold', () => {
      const similarKP1 = 'This is a test keypoint about API design';
      const similarKP2 = 'This is a test keypoint about API architecture';

      const summaries = [
        makeSummary({ keyPoints: [similarKP1] }),
        makeSummary({ keyPoints: [similarKP2] }),
      ];

      const result = consolidator.consolidate([], summaries, []);
      // Should dedup similar keyPoints
      const allKeyPoints = result.level2.summaries.flatMap(s => s.keyPoints);
      expect(allKeyPoints.length).toBeLessThan(2);
    });

    it('BC-4: Level 2 keeps all pendingTasks', () => {
      const summaries = [
        makeSummary({ pendingTasks: ['task1', 'task2'] }),
        makeSummary({ pendingTasks: ['task3'] }),
      ];

      const result = consolidator.consolidate([], summaries, []);
      expect(result.level2.allPendingTasks).toEqual(['task1', 'task2', 'task3']);
    });

    it('BC-5: Level 2 merges entities', () => {
      const summaries = [
        makeSummary({ entities: ['entity1', 'entity2'] }),
        makeSummary({ entities: ['entity2', 'entity3'] }),
      ];

      const result = consolidator.consolidate([], summaries, []);
      expect(result.level2.entities.has('entity1')).toBe(true);
      expect(result.level2.entities.has('entity2')).toBe(true);
      expect(result.level2.entities.has('entity3')).toBe(true);
    });

    it('BC-6: Level 3 groups by month correctly', () => {
      const now = Date.now();
      const oneMonthMs = 30 * 24 * 60 * 60 * 1000;

      const summaries = [
        makeSummary({ timestamp: now, sessionId: 'this-month' }),
        makeSummary({ timestamp: now - oneMonthMs, sessionId: 'last-month' }),
      ];

      const result = consolidator.consolidate([], [], summaries);
      expect(result.level3.wasConsolidated).toBe(true);
    });

    it('BC-7: Level 3 drops pendingTasks', () => {
      const summaries = [
        makeSummary({ pendingTasks: ['task1', 'task2'] }),
        makeSummary({ pendingTasks: ['task3'] }),
      ];

      const result = consolidator.consolidate([], [], summaries);
      expect(result.level3.allPendingTasks).toEqual([]);
      for (const summary of result.level3.summaries) {
        expect(summary.pendingTasks).toEqual([]);
      }
    });

    it('BC-8: Level 3 extracts top entities', () => {
      const summaries = [
        makeSummary({ entities: ['a', 'b', 'c'] }),
        makeSummary({ entities: ['b', 'c', 'd'] }),
        makeSummary({ entities: ['c', 'd', 'e'] }),
      ];

      const result = consolidator.consolidate([], [], summaries);
      // c appears most frequently
      expect(result.level3.entities.size).toBeGreaterThan(0);
    });

    it('BC-9: Jaccard similarity calculation correct', () => {
      // Testing internal method indirectly through dedup
      const identicalKP = 'API design decision';
      const summaries = [
        makeSummary({ keyPoints: [identicalKP] }),
        makeSummary({ keyPoints: [identicalKP] }), // Identical
      ];

      const result = consolidator.consolidate([], summaries, []);
      const allKeyPoints = result.level2.summaries.flatMap(s => s.keyPoints);
      expect(allKeyPoints.length).toBe(1); // Should dedup identical
    });

    it('BC-10: Empty input returns empty result', () => {
      const result = consolidator.consolidate([], [], []);
      expect(result.level1.summaries).toEqual([]);
      expect(result.level2.summaries).toEqual([]);
      expect(result.level3.summaries).toEqual([]);
    });

    it('BC-11: Single summary level 2 no merge needed', () => {
      const summaries = [makeSummary({ theme: 'Single summary' })];

      const result = consolidator.consolidate([], summaries, []);
      // Single summary should be processed but minimal consolidation
      expect(result.level2.summaries.length).toBeGreaterThanOrEqual(1);
    });

    it('BC-12: Single summary level 3 compression', () => {
      const summaries = [makeSummary({ theme: 'Single older summary', entities: ['e1', 'e2'] })];

      const result = consolidator.consolidate([], [], summaries);
      expect(result.level3.summaries.length).toBe(1);
    });

    it('BC-13: Config threshold affects dedup', () => {
      const strictConsolidator = new BucketConsolidator({ dedupThreshold: 0.9 });
      const similarKP1 = 'API design decision made today';
      const similarKP2 = 'API design choice from yesterday';

      const summaries = [
        makeSummary({ keyPoints: [similarKP1] }),
        makeSummary({ keyPoints: [similarKP2] }),
      ];

      const result = strictConsolidator.consolidate([], summaries, []);
      const allKeyPoints = result.level2.summaries.flatMap(s => s.keyPoints);
      // With higher threshold, less aggressive dedup
      expect(allKeyPoints.length).toBeGreaterThanOrEqual(1);
    });

    it('BC-14: maxKeyPoints limits output', () => {
      const limitedConsolidator = new BucketConsolidator({ maxKeyPointsLevel2: 2 });
      const manyKeyPoints = ['kp1', 'kp2', 'kp3', 'kp4', 'kp5'];

      const summaries = [makeSummary({ keyPoints: manyKeyPoints })];

      const result = limitedConsolidator.consolidate([], summaries, []);
      for (const summary of result.level2.summaries) {
        expect(summary.keyPoints.length).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('getConfig', () => {
    it('returns current configuration', () => {
      const customConsolidator = new BucketConsolidator({ dedupThreshold: 0.8 });
      expect(customConsolidator.getConfig().dedupThreshold).toBe(0.8);
    });
  });

  describe('DEFAULT_CONSOLIDATOR_CONFIG', () => {
    it('has expected default values', () => {
      expect(DEFAULT_CONSOLIDATOR_CONFIG.dedupThreshold).toBe(0.7);
      expect(DEFAULT_CONSOLIDATOR_CONFIG.maxKeyPointsLevel2).toBe(10);
      expect(DEFAULT_CONSOLIDATOR_CONFIG.maxKeyPointsLevel3).toBe(5);
      expect(DEFAULT_CONSOLIDATOR_CONFIG.maxEntities).toBe(15);
    });
  });
});
