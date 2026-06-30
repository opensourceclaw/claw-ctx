/**
 * Tests for ContextStrategy (v5.5.0)
 */

import { describe, it, expect } from 'vitest';
import {
  STRATEGY_DEFINITIONS,
  getStrategy,
  type AssemblyStrategyType,
  type ContextStrategy,
} from '../../src/session-resume/context-strategy.js';

describe('ContextStrategy', () => {
  describe('STRATEGY_DEFINITIONS', () => {
    it('CS-1: all 5 strategies defined', () => {
      const strategies = Object.keys(STRATEGY_DEFINITIONS);
      expect(strategies).toHaveLength(5);
      expect(strategies).toContain('factual_recall');
      expect(strategies).toContain('temporal_reasoning');
      expect(strategies).toContain('procedural_execution');
      expect(strategies).toContain('compositional_reasoning');
      expect(strategies).toContain('balanced');
    });

    it('CS-2: factual_recall has historyMode="flat"', () => {
      expect(STRATEGY_DEFINITIONS.factual_recall.params.historyMode).toBe('flat');
    });

    it('CS-3: temporal_reasoning has historyMode="hierarchical"', () => {
      expect(STRATEGY_DEFINITIONS.temporal_reasoning.params.historyMode).toBe('hierarchical');
    });

    it('CS-4: balanced has completenessThreshold=0.4', () => {
      expect(STRATEGY_DEFINITIONS.balanced.params.completenessThreshold).toBe(0.4);
    });

    it('CS-5: compositional_reasoning has highest completeness', () => {
      const threshold = STRATEGY_DEFINITIONS.compositional_reasoning.params.completenessThreshold;
      expect(threshold).toBe(0.7);
      // Verify it's the highest
      const allThresholds = Object.values(STRATEGY_DEFINITIONS).map(s => s.params.completenessThreshold);
      expect(Math.max(...allThresholds)).toBe(threshold);
    });

    it('CS-6: all strategies have required params', () => {
      for (const [name, strategy] of Object.entries(STRATEGY_DEFINITIONS)) {
        expect(strategy.type, `${name} should have type`).toBeDefined();
        expect(strategy.params, `${name} should have params`).toBeDefined();
        expect(strategy.description, `${name} should have description`).toBeDefined();
        expect(strategy.formatTemplate, `${name} should have formatTemplate`).toBeDefined();

        // Check required params
        const params = strategy.params;
        expect(params.historyMode, `${name} should have historyMode`).toBeDefined();
        expect(params.maxHistorySessions, `${name} should have maxHistorySessions`).toBeDefined();
        expect(params.maxAgeHours, `${name} should have maxAgeHours`).toBeDefined();
        expect(params.sortBy, `${name} should have sortBy`).toBeDefined();
        expect(params.includeEntities, `${name} should have includeEntities`).toBeDefined();
        expect(params.preserveTimestamps, `${name} should have preserveTimestamps`).toBeDefined();
        expect(params.completenessThreshold, `${name} should have completenessThreshold`).toBeDefined();
      }
    });

    it('CS-7: each strategy has correct type field', () => {
      for (const [name, strategy] of Object.entries(STRATEGY_DEFINITIONS)) {
        expect(strategy.type).toBe(name as AssemblyStrategyType);
      }
    });

    it('CS-8: all strategies have valid formatTemplate', () => {
      const validTemplates = ['facts', 'timeline', 'procedural', 'evidence', 'default'];
      for (const [name, strategy] of Object.entries(STRATEGY_DEFINITIONS)) {
        expect(validTemplates, `${name} should have valid formatTemplate`).toContain(strategy.formatTemplate);
      }
    });
  });

  describe('getStrategy', () => {
    it('returns correct strategy for valid type', () => {
      const strategy = getStrategy('factual_recall');
      expect(strategy.type).toBe('factual_recall');
    });

    it('returns balanced for unknown type', () => {
      const strategy = getStrategy('unknown_strategy' as AssemblyStrategyType);
      expect(strategy.type).toBe('balanced');
    });

    it('returns balanced for undefined', () => {
      const strategy = getStrategy(undefined as unknown as AssemblyStrategyType);
      expect(strategy.type).toBe('balanced');
    });
  });
});
