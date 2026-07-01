/**
 * Tests for CoverageEvaluator (v5.6.0)
 */

import { describe, it, expect } from 'vitest';
import { CoverageEvaluator } from '../../src/session-resume/coverage-evaluator.js';
import type { HistoryEntry } from '../../src/session-resume/types.js';

function makeEntry(theme: string, entities: string[] = []): HistoryEntry {
  return {
    summary: {
      theme,
      pendingTasks: [],
      keyPoints: [],
      timestamp: Date.now(),
      sessionId: `session-${Math.random().toString(36).slice(2, 7)}`,
      messageCount: 5,
      entities,
    },
    memoryId: `mem-${Math.random().toString(36).slice(2, 7)}`,
    storedAt: Date.now(),
  };
}

describe('CoverageEvaluator', () => {
  const evaluator = new CoverageEvaluator();

  describe('evaluate', () => {
    it('CV-1: query keywords all in context → score = 1.0', () => {
      const entries = [makeEntry('API design and implementation')];
      const formatted = 'API design and implementation for the project';
      const result = evaluator.evaluate(entries, formatted, 'API design');
      expect(result.score).toBe(1.0);
      expect(result.queryKeywordCount).toBe(2); // 'api', 'design'
    });

    it('CV-2: no query keywords in context → score = 0.0', () => {
      const entries = [makeEntry('Database migration')];
      const formatted = 'Database migration completed';
      const result = evaluator.evaluate(entries, formatted, 'API endpoint authentication');
      expect(result.score).toBe(0.0);
    });

    it('CV-3: half of keywords covered → score ≈ 0.5', () => {
      const entries = [makeEntry('API design patterns')];
      const formatted = 'API design patterns for microservices';
      const result = evaluator.evaluate(entries, formatted, 'API design testing deployment');
      // 'api' and 'design' covered, 'testing' and 'deployment' not
      expect(result.score).toBe(0.5);
    });

    it('CV-4: empty query → score = 1.0', () => {
      const entries = [makeEntry('Some context')];
      const formatted = 'Some context content';
      const result = evaluator.evaluate(entries, formatted, '');
      expect(result.score).toBe(1.0);
      expect(result.queryKeywordCount).toBe(0);
    });

    it('CV-5: empty context, valid query → score = 0.0', () => {
      const result = evaluator.evaluate([], '', 'API design');
      expect(result.score).toBe(0.0);
    });

    it('CV-6: query with only stopwords → score = 1.0', () => {
      const entries = [makeEntry('Some content')];
      const formatted = 'Some content here';
      const result = evaluator.evaluate(entries, formatted, 'the is a an the');
      expect(result.score).toBe(1.0);
      expect(result.queryKeywordCount).toBe(0);
    });

    it('CV-7: entity match counts as covered', () => {
      const entries = [makeEntry('Implementation', ['UserService', 'AuthService'])];
      const formatted = 'Implementation details';
      const result = evaluator.evaluate(entries, formatted, 'UserService');
      expect(result.coveredKeywordCount).toBe(1);
      expect(result.score).toBe(1.0);
    });

    it('CV-8: case-insensitive matching', () => {
      const entries = [makeEntry('api design')];
      const formatted = 'API Design patterns';
      const result = evaluator.evaluate(entries, formatted, 'API DESIGN');
      expect(result.score).toBe(1.0);
    });
  });
});
