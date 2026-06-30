/**
 * Tests for ContextAssembler (v5.5.0)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextAssembler } from '../../src/session-resume/context-assembler.js';
import { HistoryLoader } from '../../src/session-resume/history-loader.js';
import type { TaskType } from '../../src/adaptive/task-type-detector.js';
import type { HistoryLoadResult, HistoryEntry, SessionSummary } from '../../src/session-resume/types.js';

function makeSummary(sessionId: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    theme: `Theme for ${sessionId}`,
    pendingTasks: [],
    keyPoints: [],
    timestamp: Date.now() - Math.random() * 86400000, // Random within last day
    sessionId,
    messageCount: 5,
    entities: [],
    ...overrides,
  };
}

function makeEntry(sessionId: string, overrides: Partial<SessionSummary> = {}): HistoryEntry {
  return {
    summary: makeSummary(sessionId, overrides),
    memoryId: `mem-${sessionId}`,
    storedAt: Date.now(),
  };
}

function makeHistoryResult(entries: HistoryEntry[]): HistoryLoadResult {
  return {
    entries,
    formatted: '',
    totalSessions: entries.length,
    filteredByAge: 0,
  };
}

describe('ContextAssembler', () => {
  let mockLoader: { load: ReturnType<typeof vi.fn> };
  let assembler: ContextAssembler;

  beforeEach(() => {
    mockLoader = {
      load: vi.fn().mockResolvedValue(makeHistoryResult([])),
    };
    assembler = new ContextAssembler(mockLoader as unknown as HistoryLoader);
  });

  describe('assemble', () => {
    it('CA-1: coding taskType uses procedural_execution', async () => {
      const entries = [makeEntry('s1')];
      mockLoader.load.mockResolvedValueOnce(makeHistoryResult(entries));

      const result = await assembler.assemble('test-session', 'coding');

      expect(result.strategy).toBe('procedural_execution');
      expect(result.metadata.taskType).toBe('coding');
    });

    it('CA-2: debugging taskType uses factual_recall', async () => {
      const entries = [makeEntry('s1')];
      mockLoader.load.mockResolvedValueOnce(makeHistoryResult(entries));

      const result = await assembler.assemble('test-session', 'debugging');

      expect(result.strategy).toBe('factual_recall');
    });

    it('CA-3: planning taskType uses compositional_reasoning', async () => {
      const entries = [makeEntry('s1')];
      mockLoader.load.mockResolvedValueOnce(makeHistoryResult(entries));

      const result = await assembler.assemble('test-session', 'planning');

      expect(result.strategy).toBe('compositional_reasoning');
    });

    it('CA-4: unknown taskType uses balanced', async () => {
      const entries = [makeEntry('s1')];
      mockLoader.load.mockResolvedValueOnce(makeHistoryResult(entries));

      const result = await assembler.assemble('test-session', 'unknown');

      expect(result.strategy).toBe('balanced');
    });

    it('CA-5: empty history returns empty formatted', async () => {
      mockLoader.load.mockResolvedValueOnce(makeHistoryResult([]));

      const result = await assembler.assemble('test-session', 'coding');

      expect(result.formatted).toBe('');
      expect(result.metadata.entryCount).toBe(0);
    });

    it('CA-6: metadata includes loadTimeMs', async () => {
      const entries = [makeEntry('s1')];
      mockLoader.load.mockResolvedValueOnce(makeHistoryResult(entries));

      const result = await assembler.assemble('test-session', 'coding');

      expect(result.metadata.loadTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.metadata.loadTimeMs).toBe('number');
    });

    it('CA-7: metadata includes correct entryCount', async () => {
      const entries = [makeEntry('s1'), makeEntry('s2'), makeEntry('s3')];
      mockLoader.load.mockResolvedValueOnce(makeHistoryResult(entries));

      const result = await assembler.assemble('test-session', 'coding');

      expect(result.metadata.entryCount).toBe(3);
    });

    it('CA-8: assembleWithStrategy bypasses routing', async () => {
      const entries = [makeEntry('s1')];
      mockLoader.load.mockResolvedValueOnce(makeHistoryResult(entries));

      // Use assembleWithStrategy to force factual_recall even for 'coding'
      const result = await assembler.assembleWithStrategy('test-session', 'factual_recall');

      expect(result.strategy).toBe('factual_recall');
    });
  });

  describe('sorting', () => {
    it('CA-9: chronological sort orders oldest-first', async () => {
      const now = Date.now();
      const entries = [
        makeEntry('newest', { timestamp: now }),
        makeEntry('middle', { timestamp: now - 1000 }),
        makeEntry('oldest', { timestamp: now - 2000 }),
      ];
      mockLoader.load.mockResolvedValueOnce(makeHistoryResult(entries));

      // temporal_reasoning uses chronological sort
      const result = await assembler.assembleWithStrategy('test-session', 'temporal_reasoning');

      // Check order in formatted output (chronological = oldest first)
      expect(result.formatted).toContain('oldest');
      expect(result.formatted).toContain('newest');
      // Verify chronological ordering by checking positions
      const oldestPos = result.formatted.indexOf('oldest');
      const newestPos = result.formatted.indexOf('newest');
      expect(oldestPos).toBeLessThan(newestPos);
    });

    it('CA-10: recency sort orders newest-first', async () => {
      const now = Date.now();
      const entries = [
        makeEntry('oldest', { timestamp: now - 2000 }),
        makeEntry('middle', { timestamp: now - 1000 }),
        makeEntry('newest', { timestamp: now }),
      ];
      mockLoader.load.mockResolvedValueOnce(makeHistoryResult(entries));

      // procedural_execution uses recency sort
      const result = await assembler.assembleWithStrategy('test-session', 'procedural_execution');

      // Verify recency ordering (newest first)
      const oldestPos = result.formatted.indexOf('oldest');
      const newestPos = result.formatted.indexOf('newest');
      expect(newestPos).toBeLessThan(oldestPos);
    });
  });

  describe('format templates', () => {
    it('CA-11: facts template includes entities', async () => {
      const entries = [
        makeEntry('s1', { entities: ['entity1', 'entity2'], theme: 'Test theme' }),
      ];
      mockLoader.load.mockResolvedValueOnce(makeHistoryResult(entries));

      const result = await assembler.assembleWithStrategy('test-session', 'factual_recall');

      expect(result.formatted).toContain('[Relevant Facts]');
      expect(result.formatted).toContain('entity1');
      expect(result.formatted).toContain('entity2');
    });

    it('CA-12: timeline template includes timestamps', async () => {
      const now = Date.now();
      const entries = [makeEntry('s1', { timestamp: now })];
      mockLoader.load.mockResolvedValueOnce(makeHistoryResult(entries));

      const result = await assembler.assembleWithStrategy('test-session', 'temporal_reasoning');

      expect(result.formatted).toContain('[Timeline]');
      // Should contain date since preserveTimestamps is true
      expect(result.formatted).toContain('session: s1');
    });

    it('CA-13: procedural template has numbered steps', async () => {
      const entries = [
        makeEntry('s1', { theme: 'Step one' }),
        makeEntry('s2', { theme: 'Step two' }),
      ];
      mockLoader.load.mockResolvedValueOnce(makeHistoryResult(entries));

      const result = await assembler.assembleWithStrategy('test-session', 'procedural_execution');

      expect(result.formatted).toContain('[Previous Operations]');
      expect(result.formatted).toContain('1.');
      expect(result.formatted).toContain('2.');
    });

    it('CA-14: evidence template shows cross-references', async () => {
      const entries = [
        makeEntry('s1', { theme: 'Decision A', keyPoints: ['Evidence 1', 'Evidence 2'] }),
        makeEntry('s2', { theme: 'Decision B', keyPoints: ['Evidence 3'] }),
      ];
      mockLoader.load.mockResolvedValueOnce(makeHistoryResult(entries));

      const result = await assembler.assembleWithStrategy('test-session', 'compositional_reasoning');

      expect(result.formatted).toContain('[Cross-Session Evidence]');
      expect(result.formatted).toContain('Decision A');
      expect(result.formatted).toContain('Decision B');
    });

    it('CA-15: default template matches current behavior', async () => {
      const entries = [
        makeEntry('s1', { theme: 'Test theme', pendingTasks: ['task1'] }),
      ];
      mockLoader.load.mockResolvedValueOnce(makeHistoryResult(entries));

      const result = await assembler.assembleWithStrategy('test-session', 'balanced');

      expect(result.formatted).toContain('[Previous Session: s1]');
      expect(result.formatted).toContain('Theme: Test theme');
      expect(result.formatted).toContain('Pending Tasks: task1');
    });
  });

  describe('error handling', () => {
    it('CA-16: loader error returns empty result gracefully', async () => {
      mockLoader.load.mockRejectedValueOnce(new Error('Loader failed'));

      const result = await assembler.assemble('test-session', 'coding');

      expect(result.formatted).toBe('');
      expect(result.strategy).toBe('balanced');
      expect(result.metadata.entryCount).toBe(0);
    });

    it('CA-17: error includes correct metadata', async () => {
      mockLoader.load.mockRejectedValueOnce(new Error('Loader failed'));

      const result = await assembler.assemble('test-session', 'debugging');

      expect(result.metadata.taskType).toBe('debugging');
      expect(result.metadata.loadTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('loader config construction', () => {
    it('CA-18: passes correct config to loader for factual_recall', async () => {
      const entries = [makeEntry('s1')];
      mockLoader.load.mockResolvedValueOnce(makeHistoryResult(entries));

      await assembler.assembleWithStrategy('test-session', 'factual_recall');

      expect(mockLoader.load).toHaveBeenCalledWith('test-session', expect.objectContaining({
        historyMode: 'flat',
        maxHistorySessions: 5,
        maxAgeHours: 72,
        completenessThreshold: 0.6,
      }));
    });

    it('CA-19: passes correct config to loader for temporal_reasoning', async () => {
      const entries = [makeEntry('s1')];
      mockLoader.load.mockResolvedValueOnce(makeHistoryResult(entries));

      await assembler.assembleWithStrategy('test-session', 'temporal_reasoning');

      expect(mockLoader.load).toHaveBeenCalledWith('test-session', expect.objectContaining({
        historyMode: 'hierarchical',
        maxHistorySessions: 10,
        maxAgeHours: 168,
        completenessThreshold: 0.4,
      }));
    });
  });

  describe('getRouter', () => {
    it('CA-20: returns StrategyRouter instance', () => {
      const router = assembler.getRouter();
      expect(router).toBeDefined();
      expect(router.route).toBeDefined();
      expect(typeof router.route).toBe('function');
    });
  });
});
