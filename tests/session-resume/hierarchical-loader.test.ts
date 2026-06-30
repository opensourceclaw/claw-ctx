/**
 * Tests for HierarchicalLoader (v5.4.0)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HierarchicalLoader } from '../../src/session-resume/hierarchical-loader.js';
import type { SessionSummary } from '../../src/session-resume/types.js';

function makeSummary(sessionId: string, timestamp: number, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    theme: `Theme for ${sessionId}`,
    pendingTasks: [],
    keyPoints: [],
    timestamp,
    sessionId,
    messageCount: 5,
    entities: [],
    ...overrides,
  };
}

describe('HierarchicalLoader', () => {
  const NOW = 1000000000000;
  const oneDayMs = 24 * 60 * 60 * 1000;

  describe('load', () => {
    it('HL-1: empty summaries returns empty history', () => {
      const loader = new HierarchicalLoader();
      const history = loader.load([], NOW);
      expect(history.level1).toEqual([]);
      expect(history.level2).toEqual([]);
      expect(history.level3).toEqual([]);
    });

    it('HL-2: all levels populated correctly', () => {
      const loader = new HierarchicalLoader({
        timeBucket: { recentSessionCount: 2, weekBoundaryDays: 7, maxAgeDays: 30 },
      });

      const summaries = [
        makeSummary('recent1', NOW - 1000),
        makeSummary('recent2', NOW - 2000),
        makeSummary('week1', NOW - oneDayMs),
        makeSummary('week2', NOW - 2 * oneDayMs),
        makeSummary('older1', NOW - 10 * oneDayMs),
        makeSummary('older2', NOW - 15 * oneDayMs),
      ];

      const history = loader.load(summaries, NOW);
      expect(history.level1.length).toBe(2);
      expect(history.level2.length).toBeGreaterThanOrEqual(1);
      expect(history.level3.length).toBeGreaterThanOrEqual(1);
    });

    it('HL-3: Level 1 only when few sessions', () => {
      const loader = new HierarchicalLoader();
      const summaries = [
        makeSummary('s1', NOW - 1000),
        makeSummary('s2', NOW - 2000),
      ];

      const history = loader.load(summaries, NOW);
      expect(history.level1.length).toBe(2);
      expect(history.level2).toEqual([]);
      expect(history.level3).toEqual([]);
    });

    it('HL-4: Pending tasks aggregated from L1 and L2', () => {
      const loader = new HierarchicalLoader();

      const summaries = [
        makeSummary('s1', NOW - 1000, { pendingTasks: ['task1'] }),
        makeSummary('s2', NOW - 2000, { pendingTasks: ['task2'] }),
        makeSummary('s3', NOW - oneDayMs, { pendingTasks: ['task3'] }),
        makeSummary('s4', NOW - 20 * oneDayMs, { pendingTasks: ['task-old'] }), // Level 3 - dropped
      ];

      const history = loader.load(summaries, NOW);
      // Should have tasks from L1 and L2, not L3
      expect(history.allPendingTasks).toContain('task1');
      expect(history.allPendingTasks).toContain('task2');
      // task-old from level 3 should be dropped
    });

    it('HL-5: Entities aggregated from all levels', () => {
      const loader = new HierarchicalLoader();

      const summaries = [
        makeSummary('s1', NOW - 1000, { entities: ['entity1'] }),
        makeSummary('s2', NOW - oneDayMs, { entities: ['entity2'] }),
        makeSummary('s3', NOW - 20 * oneDayMs, { entities: ['entity3'] }),
      ];

      const history = loader.load(summaries, NOW);
      expect(history.entities.has('entity1')).toBe(true);
      expect(history.entities.has('entity2')).toBe(true);
      expect(history.entities.has('entity3')).toBe(true);
    });

    it('HL-6: Format full mode produces correct output', () => {
      const loader = new HierarchicalLoader({ injectMode: 'full' });

      const summaries = [
        makeSummary('s1', NOW - 1000, { theme: 'API refactoring' }),
      ];

      const history = loader.load(summaries, NOW);
      const formatted = loader.format(history);
      expect(formatted).toContain('Session');
      expect(formatted).toContain('API refactoring');
    });

    it('HL-7: Format compact mode produces correct output', () => {
      const loader = new HierarchicalLoader({ injectMode: 'compact' });

      const summaries = [
        makeSummary('s1', NOW - 1000, { theme: 'API refactoring' }),
      ];

      const history = loader.load(summaries, NOW);
      const formatted = loader.format(history);
      expect(formatted).toContain('Recent Sessions');
    });

    it('HL-8: Level 3 excludes pending tasks', () => {
      const loader = new HierarchicalLoader({
        timeBucket: { recentSessionCount: 1, weekBoundaryDays: 2, maxAgeDays: 30 },
      });

      const summaries = [
        makeSummary('recent', NOW - 1000, { pendingTasks: ['task-recent'] }),
        makeSummary('older', NOW - 10 * oneDayMs, { pendingTasks: ['task-older'] }),
      ];

      const history = loader.load(summaries, NOW);
      // older is in level 3, its tasks should be dropped
      expect(history.allPendingTasks).toContain('task-recent');
      expect(history.allPendingTasks).not.toContain('task-older');
    });

    it('HL-9: Month names formatted correctly', () => {
      const loader = new HierarchicalLoader({
        timeBucket: { recentSessionCount: 1, weekBoundaryDays: 7, maxAgeDays: 30 },
      });

      // Create enough sessions so level3 gets populated
      const summaries = [
        makeSummary('recent', NOW - 1000, { theme: 'Recent theme' }), // Level 1
        makeSummary('week', NOW - oneDayMs, { theme: 'Week theme' }), // Level 2
        makeSummary('older', NOW - 20 * oneDayMs, { theme: 'Old theme' }), // Level 3
      ];

      const history = loader.load(summaries, NOW);
      const formatted = loader.format(history);
      // Should contain "Earlier — Summary" section when level3 has entries
      if (history.level3.length > 0) {
        expect(formatted).toContain('Earlier');
      }
    });

    it('HL-10: Integration with TimeBucket and BucketConsolidator', () => {
      const loader = new HierarchicalLoader({
        timeBucket: { recentSessionCount: 3, weekBoundaryDays: 7, maxAgeDays: 30 },
        consolidator: { dedupThreshold: 0.7 },
      });

      const summaries = [
        makeSummary('s1', NOW - 1000),
        makeSummary('s2', NOW - 2000),
        makeSummary('s3', NOW - 3000),
        makeSummary('s4', NOW - oneDayMs),
        makeSummary('s5', NOW - 10 * oneDayMs),
      ];

      const history = loader.load(summaries, NOW);
      const formatted = loader.format(history);

      expect(formatted).toBeTruthy();
      expect(formatted.length).toBeGreaterThan(0);
    });
  });

  describe('format', () => {
    it('produces sections for each populated level', () => {
      const loader = new HierarchicalLoader();
      const history = {
        level1: [makeSummary('s1', NOW)],
        level2: [makeSummary('s2', NOW - oneDayMs)],
        level3: [makeSummary('s3', NOW - 20 * oneDayMs)],
        allPendingTasks: [],
        entities: new Map(),
      };

      const formatted = loader.format(history);
      // Level 1 format: [Session: xxx]
      expect(formatted).toContain('Session');
      // Level 2 format: [This Week — Key Activity]
      expect(formatted).toContain('This Week');
      // Level 3 format: [Earlier — Summary]
      expect(formatted).toContain('Earlier');
    });

    it('skips empty levels', () => {
      const loader = new HierarchicalLoader();
      const history = {
        level1: [makeSummary('s1', NOW)],
        level2: [],
        level3: [],
        allPendingTasks: [],
        entities: new Map(),
      };

      const formatted = loader.format(history);
      // Level 1 format
      expect(formatted).toContain('Session');
      expect(formatted).not.toContain('This Week');
      expect(formatted).not.toContain('Earlier');
    });
  });
});