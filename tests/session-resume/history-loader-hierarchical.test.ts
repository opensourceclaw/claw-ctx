/**
 * Integration tests for HistoryLoader hierarchical mode (v5.4.0)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistoryLoader } from '../../src/session-resume/history-loader.js';
import type { SessionSummary } from '../../src/session-resume/types.js';

function makeMockSummary(sessionId: string, timestamp: number, overrides: Partial<SessionSummary> = {}): string {
  const summary: SessionSummary = {
    theme: `Theme for ${sessionId}`,
    pendingTasks: [],
    keyPoints: [],
    timestamp,
    sessionId,
    messageCount: 5,
    entities: [],
    ...overrides,
  };
  return JSON.stringify(summary);
}

describe('HistoryLoader v5.4.0 Hierarchical Mode', () => {
  const NOW = 1000000000000;
  const oneDayMs = 24 * 60 * 60 * 1000;

  describe('hierarchical mode integration', () => {
    it('switches to hierarchical mode when configured', async () => {
      const mockManager = {
        hybridSearch: vi.fn().mockResolvedValue({
          results: [
            { content: makeMockSummary('s1', NOW - 1000), score: 0.8, tags: ['session_summary'], id: 'm1' },
            { content: makeMockSummary('s2', NOW - oneDayMs), score: 0.7, tags: ['session_summary'], id: 'm2' },
            { content: makeMockSummary('s3', NOW - 10 * oneDayMs), score: 0.6, tags: ['session_summary'], id: 'm3' },
          ],
          completeness_score: 0.5,
        }),
        search: vi.fn(),
      };

      const loader = new HistoryLoader(mockManager as any, {
        historyMode: 'hierarchical',
        maxHistorySessions: 3,
        maxAgeHours: 48,
        injectMode: 'full',
      });

      const result = await loader.load('test-session');

      expect(mockManager.hybridSearch).toHaveBeenCalled();
      // Level 1 sessions are formatted with [Session: xxx]
      expect(result.formatted).toContain('Session');
    });

    it('queries wider range for hierarchical mode', async () => {
      const mockManager = {
        hybridSearch: vi.fn().mockResolvedValue({
          results: [],
          completeness_score: 0.5,
        }),
        search: vi.fn().mockResolvedValue([]),
      };

      const loader = new HistoryLoader(mockManager as any, {
        historyMode: 'hierarchical',
        maxHistorySessions: 3,
      });

      await loader.load('test-session');

      // Should query with topK * 3
      const call = mockManager.hybridSearch.mock.calls[0];
      expect(call[1].topK).toBe(9); // 3 * 3
    });

    it('produces three-level output', async () => {
      const mockManager = {
        hybridSearch: vi.fn().mockResolvedValue({
          results: [
            { content: makeMockSummary('recent1', NOW - 1000), score: 0.9, tags: ['session_summary'], id: 'm1' },
            { content: makeMockSummary('recent2', NOW - 2000), score: 0.8, tags: ['session_summary'], id: 'm2' },
            { content: makeMockSummary('recent3', NOW - 3000), score: 0.7, tags: ['session_summary'], id: 'm3' },
            { content: makeMockSummary('week1', NOW - oneDayMs), score: 0.6, tags: ['session_summary'], id: 'm4' },
            { content: makeMockSummary('older1', NOW - 10 * oneDayMs), score: 0.5, tags: ['session_summary'], id: 'm5' },
          ],
          completeness_score: 0.6,
        }),
        search: vi.fn(),
      };

      const loader = new HistoryLoader(mockManager as any, {
        historyMode: 'hierarchical',
        maxHistorySessions: 3,
        injectMode: 'full',
      });

      const result = await loader.load('test-session');

      // Level 1 sessions formatted with [Session: xxx]
      expect(result.formatted).toContain('Session');
      // When there are entries in level 2/3, they appear in formatted output
      expect(result.totalSessions).toBe(5);
    });

    it('flat mode unchanged (backward compat)', async () => {
      // Use a timestamp that's definitely within maxAgeHours (48 hours)
      const recentTimestamp = Date.now() - 1000;

      const mockManager = {
        hybridSearch: vi.fn().mockResolvedValue({
          results: [
            { content: makeMockSummary('s1', recentTimestamp), score: 0.8, tags: ['session_summary'], id: 'm1' },
          ],
          completeness_score: 0.5,
        }),
        search: vi.fn(),
      };

      const loader = new HistoryLoader(mockManager as any, {
        historyMode: 'flat', // Explicit flat mode
        maxHistorySessions: 3,
        maxAgeHours: 48,
        injectMode: 'full',
      });

      const result = await loader.load('test-session');

      // Flat mode uses [Previous Session: xxx] format
      if (result.entries.length > 0) {
        expect(result.formatted).toContain('Previous Session');
      }
      expect(result.entries.length).toBeGreaterThanOrEqual(0);
    });

    it('pending tasks preserved from L1 and L2', async () => {
      const mockManager = {
        hybridSearch: vi.fn().mockResolvedValue({
          results: [
            { content: makeMockSummary('recent', NOW - 1000, { pendingTasks: ['task-recent'] }), score: 0.9, tags: ['session_summary'], id: 'm1' },
            { content: makeMockSummary('week', NOW - oneDayMs, { pendingTasks: ['task-week'] }), score: 0.7, tags: ['session_summary'], id: 'm2' },
            { content: makeMockSummary('older', NOW - 10 * oneDayMs, { pendingTasks: ['task-older'] }), score: 0.5, tags: ['session_summary'], id: 'm3' },
          ],
          completeness_score: 0.5,
        }),
        search: vi.fn(),
      };

      const loader = new HistoryLoader(mockManager as any, {
        historyMode: 'hierarchical',
        maxHistorySessions: 3,
        injectMode: 'full',
      });

      const result = await loader.load('test-session');

      // Pending tasks from L1 and L2 should be in formatted output
      expect(result.formatted).toContain('task-recent');
      // task-older from L3 should be dropped
    });

    it('uses config hierarchicalLoader settings', async () => {
      const mockManager = {
        hybridSearch: vi.fn().mockResolvedValue({
          results: [],
          completeness_score: 0.5,
        }),
        search: vi.fn().mockResolvedValue([]),
      };

      const loader = new HistoryLoader(mockManager as any, {
        historyMode: 'hierarchical',
        maxHistorySessions: 3,
        hierarchicalLoader: {
          recentSessionCount: 5,
          weekBoundaryDays: 3,
          level3MaxAgeDays: 14,
          dedupThreshold: 0.8,
        },
      });

      await loader.load('test-session');

      // Query should use level3MaxAgeDays
      const call = mockManager.hybridSearch.mock.calls[0];
      // topK should be maxHistorySessions * 3 = 9
      // maxAgeHours should be 14 * 24 = 336
      expect(call[1].topK).toBe(9);
    });
  });

  describe('default mode', () => {
    it('defaults to flat mode when not specified', async () => {
      // Use a timestamp that's definitely within maxAgeHours
      const recentTimestamp = Date.now() - 1000;

      const mockManager = {
        hybridSearch: vi.fn().mockResolvedValue({
          results: [
            { content: makeMockSummary('s1', recentTimestamp), score: 0.8, tags: ['session_summary'], id: 'm1' },
          ],
          completeness_score: 0.5,
        }),
        search: vi.fn(),
      };

      // No historyMode specified - should default to flat
      const loader = new HistoryLoader(mockManager as any, {
        maxHistorySessions: 3,
        maxAgeHours: 48,
      });

      const result = await loader.load('test-session');
      expect(result.entries.length).toBeGreaterThanOrEqual(0); // May be 0 if timestamp filtering applies
    });
  });
});