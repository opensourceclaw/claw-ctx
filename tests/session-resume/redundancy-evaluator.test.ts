/**
 * Tests for RedundancyEvaluator (v5.6.0)
 */

import { describe, it, expect } from 'vitest';
import { RedundancyEvaluator } from '../../src/session-resume/redundancy-evaluator.js';
import type { HistoryEntry } from '../../src/session-resume/types.js';

function makeEntry(theme: string, keyPoints: string[] = []): HistoryEntry {
  return {
    summary: {
      theme,
      pendingTasks: [],
      keyPoints,
      timestamp: Date.now(),
      sessionId: `session-${Math.random().toString(36).slice(2, 7)}`,
      messageCount: 5,
      entities: [],
    },
    memoryId: `mem-${Math.random().toString(36).slice(2, 7)}`,
    storedAt: Date.now(),
  };
}

describe('RedundancyEvaluator', () => {
  const evaluator = new RedundancyEvaluator();

  describe('evaluate', () => {
    it('RD-1: no duplicates → score = 1.0', () => {
      const entries = [
        makeEntry('API design', ['Created endpoint']),
        makeEntry('Database migration', ['Added tables']),
      ];
      const formatted = 'API design\nDatabase migration';
      const result = evaluator.evaluate(entries, formatted);
      expect(result.score).toBe(1.0);
      expect(result.duplicateLineCount).toBe(0);
    });

    it('RD-2: duplicate keyPoints → score < 1.0', () => {
      const entries = [
        makeEntry('Session 1', ['Same keypoint', 'Unique point']),
        makeEntry('Session 2', ['Same keypoint', 'Another point']),
      ];
      const formatted = 'Session 1\nSame keypoint\nSession 2\nSame keypoint';
      const result = evaluator.evaluate(entries, formatted);
      // Jaccard similarity between keyPoints should trigger duplicate detection
      expect(result.score).toBeLessThan(1.0);
    });

    it('RD-3: single entry → score = 1.0', () => {
      const entries = [makeEntry('Single session', ['key point'])];
      const formatted = 'Single session\nkey point';
      const result = evaluator.evaluate(entries, formatted);
      expect(result.score).toBe(1.0);
    });

    it('RD-4: empty entries → score = 1.0', () => {
      const result = evaluator.evaluate([], '');
      expect(result.score).toBe(1.0);
      expect(result.duplicateLineCount).toBe(0);
    });

    it('RD-5: duplicate lines detected', () => {
      const entries = [
        makeEntry('Session 1'),
        makeEntry('Session 2'),
      ];
      const formatted = 'Same line\nSame line\nDifferent line';
      const result = evaluator.evaluate(entries, formatted);
      expect(result.duplicateLineCount).toBeGreaterThan(0);
    });

    it('RD-6: Jaccard similarity 0.8 flagged', () => {
      const entries = [
        makeEntry('Topic A', ['point one', 'point two', 'point three']),
        makeEntry('Topic B', ['point one', 'point two', 'point three']),
      ];
      const formatted = 'Topic A\nTopic B';
      const result = evaluator.evaluate(entries, formatted);
      // High similarity should be detected
      expect(result.score).toBeLessThan(1.0);
    });

    it('RD-7: Jaccard similarity 0.3 not flagged', () => {
      const entries = [
        makeEntry('Topic A', ['alpha', 'beta']),
        makeEntry('Topic B', ['gamma', 'delta']),
      ];
      const formatted = 'Topic A\nTopic B';
      const result = evaluator.evaluate(entries, formatted);
      // Low similarity should not trigger duplicate detection
      expect(result.score).toBeGreaterThanOrEqual(0.9);
    });

    it('RD-8: totalLineCount correct', () => {
      const entries = [makeEntry('Test')];
      const formatted = 'Line 1\nLine 2\nLine 3';
      const result = evaluator.evaluate(entries, formatted);
      expect(result.totalLineCount).toBe(3);
    });
  });
});
