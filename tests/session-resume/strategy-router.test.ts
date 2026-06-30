/**
 * Tests for StrategyRouter (v5.5.0)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StrategyRouter } from '../../src/session-resume/strategy-router.js';
import type { TaskType } from '../../src/adaptive/task-type-detector.js';
import type { AssemblyStrategyType } from '../../src/session-resume/context-strategy.js';

describe('StrategyRouter', () => {
  let router: StrategyRouter;

  beforeEach(() => {
    router = new StrategyRouter();
  });

  describe('route', () => {
    it('SR-1: coding → procedural_execution', () => {
      expect(router.route('coding')).toBe('procedural_execution');
    });

    it('SR-2: debugging → factual_recall', () => {
      expect(router.route('debugging')).toBe('factual_recall');
    });

    it('SR-3: planning → compositional_reasoning', () => {
      expect(router.route('planning')).toBe('compositional_reasoning');
    });

    it('SR-4: question → factual_recall', () => {
      expect(router.route('question')).toBe('factual_recall');
    });

    it('SR-5: review → compositional_reasoning', () => {
      expect(router.route('review')).toBe('compositional_reasoning');
    });

    it('SR-6: conversation → balanced', () => {
      expect(router.route('conversation')).toBe('balanced');
    });

    it('SR-7: unknown → balanced', () => {
      expect(router.route('unknown')).toBe('balanced');
    });

    it('SR-8: null taskType → balanced', () => {
      expect(router.route(null as unknown as TaskType)).toBe('balanced');
    });

    it('SR-9: undefined taskType → balanced', () => {
      expect(router.route(undefined as unknown as TaskType)).toBe('balanced');
    });
  });

  describe('getStrategy', () => {
    it('SR-10: returns full ContextStrategy for valid taskType', () => {
      const strategy = router.getStrategy('coding');
      expect(strategy.type).toBe('procedural_execution');
      expect(strategy.params).toBeDefined();
      expect(strategy.description).toBeDefined();
      expect(strategy.formatTemplate).toBe('procedural');
    });

    it('SR-11: returns balanced strategy for unknown taskType', () => {
      const strategy = router.getStrategy('unknown');
      expect(strategy.type).toBe('balanced');
    });

    it('SR-12: each taskType maps to valid strategy', () => {
      const taskTypes: TaskType[] = ['coding', 'review', 'debugging', 'planning', 'question', 'conversation', 'unknown'];

      for (const taskType of taskTypes) {
        const strategy = router.getStrategy(taskType);
        expect(strategy).toBeDefined();
        expect(strategy.type).toBeDefined();
        expect(strategy.params).toBeDefined();
      }
    });
  });

  describe('getStrategyByType', () => {
    it('SR-13: returns correct strategy for factual_recall', () => {
      const strategy = router.getStrategyByType('factual_recall');
      expect(strategy.type).toBe('factual_recall');
      expect(strategy.formatTemplate).toBe('facts');
    });

    it('SR-14: returns correct strategy for temporal_reasoning', () => {
      const strategy = router.getStrategyByType('temporal_reasoning');
      expect(strategy.type).toBe('temporal_reasoning');
      expect(strategy.formatTemplate).toBe('timeline');
    });

    it('SR-15: returns balanced for unknown strategy type', () => {
      const strategy = router.getStrategyByType('nonexistent' as AssemblyStrategyType);
      expect(strategy.type).toBe('balanced');
    });
  });

  describe('getAvailableStrategies', () => {
    it('SR-16: returns all 5 strategy types', () => {
      const strategies = router.getAvailableStrategies();
      expect(strategies).toHaveLength(5);
      expect(strategies).toContain('factual_recall');
      expect(strategies).toContain('temporal_reasoning');
      expect(strategies).toContain('procedural_execution');
      expect(strategies).toContain('compositional_reasoning');
      expect(strategies).toContain('balanced');
    });
  });
});
