/**
 * Integration tests for HistoryLoader v5.3.0 (hybrid_search + completeness)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistoryLoader } from '../../src/session-resume/history-loader.js';

function makeMockSummary(sessionId: string, theme: string, timestamp: number) {
  return JSON.stringify({
    theme,
    pendingTasks: [],
    keyPoints: [],
    timestamp,
    sessionId,
    messageCount: 5,
    entities: [],
  });
}

describe('HistoryLoader v5.3.0', () => {
  describe('IT-1: hybrid_search available, completeness passes', () => {
    it('should use results directly when score >= threshold', async () => {
      const mockManager = {
        hybridSearch: vi.fn().mockResolvedValue({
          results: [
            { content: makeMockSummary('s1', 'test theme', Date.now()), score: 0.8, tags: ['session_summary'], id: 'm1' },
          ],
          completeness_score: 0.6,
        }),
        search: vi.fn(),
      };

      const loader = new HistoryLoader(mockManager as any);
      const result = await loader.load('test-session');

      expect(mockManager.hybridSearch).toHaveBeenCalledTimes(1);
      expect(mockManager.search).not.toHaveBeenCalled();
      expect(result.completeness?.assessment).toBe('use');
      expect(result.completeness?.expansionRounds).toBe(0);
      expect(result.entries).toHaveLength(1);
    });
  });

  describe('IT-2: hybrid_search available, triggers expansion round 1', () => {
    it('should expand when completeness < threshold', async () => {
      const mockManager = {
        hybridSearch: vi.fn()
          .mockResolvedValueOnce({
            results: [
              { content: makeMockSummary('s1', 'theme1', Date.now()), score: 0.8, tags: ['session_summary'], id: 'm1' },
            ],
            completeness_score: 0.3,
          })
          .mockResolvedValueOnce({
            results: [
              { content: makeMockSummary('s2', 'theme2', Date.now()), score: 0.7, tags: ['session_summary'], id: 'm2' },
            ],
            completeness_score: 0.5,
          }),
        search: vi.fn(),
      };

      const loader = new HistoryLoader(mockManager as any);
      const result = await loader.load('test-session');

      expect(mockManager.hybridSearch).toHaveBeenCalledTimes(2);
      expect(result.completeness?.expansionRounds).toBe(1);
      expect(result.entries.length).toBeGreaterThan(0);
    });
  });

  describe('IT-3: hybrid_search available, triggers round 2 max', () => {
    it('should use max params when score < critical', async () => {
      const mockManager = {
        hybridSearch: vi.fn()
          .mockResolvedValue({
            results: [],
            completeness_score: 0.1,
          }),
        search: vi.fn(),
      };

      const loader = new HistoryLoader(mockManager as any);
      const result = await loader.load('test-session');

      // With max_expand, should jump to round 2 immediately
      expect(result.completeness?.assessment).toBe('max_expand');
    });
  });

  describe('IT-4: hybrid_search unavailable, graceful degradation', () => {
    it('should fall back to search when hybridSearch not present', async () => {
      const mockManager = {
        search: vi.fn().mockResolvedValue([
          { content: makeMockSummary('s1', 'theme', Date.now()), score: 0.8, tags: ['session_summary'], id: 'm1' },
        ]),
        // No hybridSearch method
      };

      const loader = new HistoryLoader(mockManager as any);
      const result = await loader.load('test-session');

      expect(mockManager.search).toHaveBeenCalled();
      expect(result.completeness?.assessment).toBe('use');
      expect(result.entries).toHaveLength(1);
    });

    it('should fall back to search when hybridSearch throws', async () => {
      const mockManager = {
        hybridSearch: vi.fn().mockRejectedValue(new Error('RPC not supported')),
        search: vi.fn().mockResolvedValue([
          { content: makeMockSummary('s1', 'theme', Date.now()), score: 0.8, tags: ['session_summary'], id: 'm1' },
        ]),
      };

      const loader = new HistoryLoader(mockManager as any);
      const result = await loader.load('test-session');

      expect(mockManager.search).toHaveBeenCalled();
      expect(result.entries).toHaveLength(1);
    });
  });

  describe('IT-5: hybrid_search returns score but no breakdown', () => {
    it('should work correctly without breakdown', async () => {
      const mockManager = {
        hybridSearch: vi.fn().mockResolvedValue({
          results: [
            { content: makeMockSummary('s1', 'theme', Date.now()), score: 0.8, tags: ['session_summary'], id: 'm1' },
          ],
          completeness_score: 0.5,
          // No metadata/breakdown
        }),
        search: vi.fn(),
      };

      const loader = new HistoryLoader(mockManager as any);
      const result = await loader.load('test-session');

      expect(result.completeness?.score).toBe(0.5);
      expect(result.completeness?.breakdown).toBeUndefined();
    });
  });

  describe('IT-6: Expansion results dedup with original', () => {
    it('should dedup by ID when merging results', async () => {
      const mockManager = {
        hybridSearch: vi.fn()
          .mockResolvedValueOnce({
            results: [
              { content: makeMockSummary('s1', 'theme1', Date.now()), score: 0.8, tags: ['session_summary'], id: 'm1' },
            ],
            completeness_score: 0.2, // Trigger expansion
          })
          .mockResolvedValueOnce({
            results: [
              // Duplicate ID - should be deduped
              { content: makeMockSummary('s1', 'theme1-dup', Date.now()), score: 0.9, tags: ['session_summary'], id: 'm1' },
              { content: makeMockSummary('s2', 'theme2', Date.now()), score: 0.7, tags: ['session_summary'], id: 'm2' },
            ],
            completeness_score: 0.5,
          }),
        search: vi.fn(),
      };

      const loader = new HistoryLoader(mockManager as any);
      const result = await loader.load('test-session');

      // Should dedup by ID
      const ids = result.entries.map(e => e.memoryId);
      const uniqueIds = [...new Set(ids)];
      expect(ids.length).toBe(uniqueIds.length);
    });
  });

  describe('IT-7: Legacy search still works', () => {
    it('should work with search-only manager', async () => {
      const mockManager = {
        search: vi.fn().mockResolvedValue([
          { content: makeMockSummary('s1', 'theme1', Date.now()), score: 0.8, tags: ['session_summary'], id: 'm1' },
          { content: makeMockSummary('s2', 'theme2', Date.now()), score: 0.7, tags: ['session_summary'], id: 'm2' },
        ]),
      };

      const loader = new HistoryLoader(mockManager as any);
      const result = await loader.load('test-session');

      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.formatted).toContain('Previous Session');
    });
  });

  describe('IT-8: Completeness report included in result', () => {
    it('should include completeness metadata in result', async () => {
      const mockManager = {
        hybridSearch: vi.fn().mockResolvedValue({
          results: [
            { content: makeMockSummary('s1', 'theme', Date.now()), score: 0.8, tags: ['session_summary'], id: 'm1' },
          ],
          completeness_score: 0.65,
          metadata: {
            breakdown: { coverage: 0.7, diversity: 0.6, confidence: 0.8 },
          },
        }),
        search: vi.fn(),
      };

      const loader = new HistoryLoader(mockManager as any);
      const result = await loader.load('test-session');

      expect(result.completeness).toBeDefined();
      expect(result.completeness?.score).toBe(0.65);
      expect(result.completeness?.assessment).toBe('use');
      expect(result.completeness?.breakdown).toBeDefined();
    });
  });

  describe('Backward compatibility', () => {
    it('should work with existing config without new fields', async () => {
      const mockManager = {
        search: vi.fn().mockResolvedValue([
          { content: makeMockSummary('s1', 'theme', Date.now()), score: 0.8, tags: ['session_summary'], id: 'm1' },
        ]),
      };

      const loader = new HistoryLoader(mockManager as any, {
        maxHistorySessions: 3,
        maxAgeHours: 48,
        injectMode: 'compact',
      });

      const result = await loader.load('test-session');
      expect(result.entries).toHaveLength(1);
      expect(result.formatted).toContain('Previous Sessions');
    });
  });
});
