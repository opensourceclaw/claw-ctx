/**
 * Tests for TimeBucket (v5.4.0)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TimeBucket, DEFAULT_TIME_BUCKET_CONFIG } from '../../src/session-resume/time-bucket.js';
import type { SessionSummary } from '../../src/session-resume/types.js';

function makeSummary(sessionId: string, timestamp: number): SessionSummary {
  return {
    theme: `Theme for ${sessionId}`,
    pendingTasks: [],
    keyPoints: [],
    timestamp,
    sessionId,
    messageCount: 5,
    entities: [],
  };
}

describe('TimeBucket', () => {
  const NOW = 1000000000000; // Fixed timestamp for testing

  describe('bucket', () => {
    it('TB-1: empty array returns empty buckets', () => {
      const bucket = new TimeBucket();
      const result = bucket.bucket([]);
      expect(result.recent).toEqual([]);
      expect(result.thisWeek).toEqual([]);
      expect(result.older).toEqual([]);
    });

    it('TB-2: fewer than recentSessionCount all go to recent', () => {
      const bucket = new TimeBucket({ recentSessionCount: 3 });
      const summaries = [
        makeSummary('s1', NOW - 1000),
        makeSummary('s2', NOW - 2000),
      ];
      const result = bucket.bucket(summaries, NOW);
      expect(result.recent).toHaveLength(2);
      expect(result.thisWeek).toHaveLength(0);
      expect(result.older).toHaveLength(0);
    });

    it('TB-3: exactly recentSessionCount all go to recent', () => {
      const bucket = new TimeBucket({ recentSessionCount: 3 });
      const summaries = [
        makeSummary('s1', NOW - 1000),
        makeSummary('s2', NOW - 2000),
        makeSummary('s3', NOW - 3000),
      ];
      const result = bucket.bucket(summaries, NOW);
      expect(result.recent).toHaveLength(3);
      expect(result.thisWeek).toHaveLength(0);
      expect(result.older).toHaveLength(0);
    });

    it('TB-4: more than recent, within week -> correct split', () => {
      const bucket = new TimeBucket({ recentSessionCount: 3, weekBoundaryDays: 7 });
      const oneDayMs = 24 * 60 * 60 * 1000;
      const summaries = [
        makeSummary('s1', NOW - 1000),          // recent
        makeSummary('s2', NOW - 2000),          // recent
        makeSummary('s3', NOW - 3000),          // recent
        makeSummary('s4', NOW - oneDayMs),      // this week
        makeSummary('s5', NOW - 2 * oneDayMs),  // this week
      ];
      const result = bucket.bucket(summaries, NOW);
      expect(result.recent).toHaveLength(3);
      expect(result.thisWeek).toHaveLength(2);
      expect(result.older).toHaveLength(0);
    });

    it('TB-5: sessions older than week go to older', () => {
      const bucket = new TimeBucket({ recentSessionCount: 3, weekBoundaryDays: 7, maxAgeDays: 30 });
      const oneDayMs = 24 * 60 * 60 * 1000;
      const summaries = [
        makeSummary('s1', NOW - 1000),           // recent
        makeSummary('s2', NOW - 2000),           // recent
        makeSummary('s3', NOW - 3000),           // recent
        makeSummary('s4', NOW - 8 * oneDayMs),   // older (8 days)
        makeSummary('s5', NOW - 10 * oneDayMs),  // older (10 days)
      ];
      const result = bucket.bucket(summaries, NOW);
      expect(result.recent).toHaveLength(3);
      expect(result.thisWeek).toHaveLength(0);
      expect(result.older).toHaveLength(2);
    });

    it('TB-6: sessions older than maxAgeDays are excluded', () => {
      const bucket = new TimeBucket({ recentSessionCount: 2, weekBoundaryDays: 7, maxAgeDays: 14 });
      const oneDayMs = 24 * 60 * 60 * 1000;
      const summaries = [
        makeSummary('s1', NOW - 1000),           // recent
        makeSummary('s2', NOW - 2000),           // recent
        makeSummary('s3', NOW - 10 * oneDayMs),  // older (within maxAge)
        makeSummary('s4', NOW - 20 * oneDayMs),  // excluded (> maxAge)
      ];
      const result = bucket.bucket(summaries, NOW);
      expect(result.recent).toHaveLength(2);
      expect(result.older).toHaveLength(1); // s4 excluded
    });

    it('TB-7: unsorted input is correctly sorted', () => {
      const bucket = new TimeBucket({ recentSessionCount: 3 });
      const summaries = [
        makeSummary('old', NOW - 10000),
        makeSummary('new', NOW - 1000),
        makeSummary('mid', NOW - 5000),
      ];
      const result = bucket.bucket(summaries, NOW);
      expect(result.recent[0].sessionId).toBe('new'); // Most recent first
      expect(result.recent[1].sessionId).toBe('mid');
      expect(result.recent[2].sessionId).toBe('old');
    });

    it('TB-8: custom config values work', () => {
      const bucket = new TimeBucket({ recentSessionCount: 2, weekBoundaryDays: 3 });
      const oneDayMs = 24 * 60 * 60 * 1000;
      const summaries = [
        makeSummary('s1', NOW - 1000),
        makeSummary('s2', NOW - 2000),
        makeSummary('s3', NOW - oneDayMs),      // this week (1 day < 3 days)
        makeSummary('s4', NOW - 4 * oneDayMs),  // older (4 days > 3 days)
      ];
      const result = bucket.bucket(summaries, NOW);
      expect(result.recent).toHaveLength(2);
      expect(result.thisWeek).toHaveLength(1);
      expect(result.older).toHaveLength(1);
    });

    it('TB-9: timestamp boundary edge cases', () => {
      const bucket = new TimeBucket({ recentSessionCount: 1, weekBoundaryDays: 7 });
      const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
      const summaries = [
        makeSummary('recent', NOW - 1000),
        makeSummary('exactly-week', NOW - oneWeekMs), // Exactly 7 days
      ];
      const result = bucket.bucket(summaries, NOW);
      expect(result.recent).toHaveLength(1);
      // Exactly at boundary should be in thisWeek (>= check)
      expect(result.thisWeek).toHaveLength(1);
    });

    it('TB-10: single session always goes to recent', () => {
      const bucket = new TimeBucket();
      const summaries = [makeSummary('s1', NOW - 1000)];
      const result = bucket.bucket(summaries, NOW);
      expect(result.recent).toHaveLength(1);
      expect(result.thisWeek).toHaveLength(0);
      expect(result.older).toHaveLength(0);
    });
  });

  describe('getConfig', () => {
    it('returns current configuration', () => {
      const bucket = new TimeBucket({ recentSessionCount: 5 });
      const config = bucket.getConfig();
      expect(config.recentSessionCount).toBe(5);
    });
  });

  describe('updateConfig', () => {
    it('updates configuration at runtime', () => {
      const bucket = new TimeBucket({ recentSessionCount: 3 });
      expect(bucket.getConfig().recentSessionCount).toBe(3);

      bucket.updateConfig({ recentSessionCount: 5 });
      expect(bucket.getConfig().recentSessionCount).toBe(5);
    });
  });

  describe('DEFAULT_TIME_BUCKET_CONFIG', () => {
    it('has expected default values', () => {
      expect(DEFAULT_TIME_BUCKET_CONFIG.recentSessionCount).toBe(3);
      expect(DEFAULT_TIME_BUCKET_CONFIG.weekBoundaryDays).toBe(7);
      expect(DEFAULT_TIME_BUCKET_CONFIG.maxAgeDays).toBe(30);
    });
  });
});
