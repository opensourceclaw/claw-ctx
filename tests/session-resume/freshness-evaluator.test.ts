/**
 * Tests for FreshnessEvaluator (v5.6.0)
 */

import { describe, it, expect } from 'vitest';
import { FreshnessEvaluator } from '../../src/session-resume/freshness-evaluator.js';
import type { HistoryEntry } from '../../src/session-resume/types.js';

function makeEntry(timestamp: number): HistoryEntry {
  return {
    summary: {
      theme: 'Test theme',
      pendingTasks: [],
      keyPoints: [],
      timestamp,
      sessionId: `session-${Math.random().toString(36).slice(2, 7)}`,
      messageCount: 5,
      entities: [],
    },
    memoryId: `mem-${Math.random().toString(36).slice(2, 7)}`,
    storedAt: timestamp,
  };
}

describe('FreshnessEvaluator', () => {
  describe('evaluate', () => {
    it('FR-1: all entries 1 hour old', () => {
      const evaluator = new FreshnessEvaluator(24); // 24-hour half-life
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      const entries = [makeEntry(oneHourAgo), makeEntry(oneHourAgo)];

      const result = evaluator.evaluate(entries);
      // e^(-1/24) ≈ 0.959
      expect(result.score).toBeGreaterThan(0.95);
      expect(result.score).toBeLessThan(0.97);
    });

    it('FR-2: all entries 24 hours old', () => {
      const evaluator = new FreshnessEvaluator(24);
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const entries = [makeEntry(oneDayAgo), makeEntry(oneDayAgo)];

      const result = evaluator.evaluate(entries);
      // e^(-1) ≈ 0.368
      expect(result.score).toBeGreaterThan(0.35);
      expect(result.score).toBeLessThan(0.38);
    });

    it('FR-3: all entries 48 hours old', () => {
      const evaluator = new FreshnessEvaluator(24);
      const now = Date.now();
      const twoDaysAgo = now - 48 * 60 * 60 * 1000;
      const entries = [makeEntry(twoDaysAgo), makeEntry(twoDaysAgo)];

      const result = evaluator.evaluate(entries);
      // e^(-2) ≈ 0.135
      expect(result.score).toBeGreaterThan(0.13);
      expect(result.score).toBeLessThan(0.15);
    });

    it('FR-4: empty entries → score = 1.0', () => {
      const evaluator = new FreshnessEvaluator(24);
      const result = evaluator.evaluate([]);
      expect(result.score).toBe(1.0);
    });

    it('FR-5: missing timestamp → treated as fresh', () => {
      const evaluator = new FreshnessEvaluator(24);
      const entry = makeEntry(0); // Invalid timestamp
      const result = evaluator.evaluate([entry]);
      expect(result.score).toBe(1.0);
    });

    it('FR-6: future timestamp → treated as fresh', () => {
      const evaluator = new FreshnessEvaluator(24);
      const future = Date.now() + 100000;
      const entry = makeEntry(future);
      const result = evaluator.evaluate([entry]);
      expect(result.score).toBe(1.0);
    });

    it('FR-7: mixed ages → weighted average', () => {
      const evaluator = new FreshnessEvaluator(24);
      const now = Date.now();
      const fresh = now - 60 * 60 * 1000;  // 1 hour ago
      const stale = now - 48 * 60 * 60 * 1000;  // 48 hours ago
      const entries = [makeEntry(fresh), makeEntry(stale)];

      const result = evaluator.evaluate(entries);
      // Average of e^(-1/24) ≈ 0.96 and e^(-2) ≈ 0.135
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.score).toBeLessThan(0.6);
    });

    it('FR-8: custom half-life', () => {
      const evaluator = new FreshnessEvaluator(12); // 12-hour half-life
      const now = Date.now();
      const twelveHoursAgo = now - 12 * 60 * 60 * 1000;
      const entries = [makeEntry(twelveHoursAgo)];

      const result = evaluator.evaluate(entries);
      // e^(-1) ≈ 0.368
      expect(result.score).toBeGreaterThan(0.35);
      expect(result.score).toBeLessThan(0.38);
    });
  });
});
