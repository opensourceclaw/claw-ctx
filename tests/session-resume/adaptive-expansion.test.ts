/**
 * Tests for AdaptiveExpansion (v5.3.0)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AdaptiveExpansion } from '../../src/session-resume/adaptive-expansion.js';
import type { CompletenessAssessment } from '../../src/session-resume/completeness-gate.js';

describe('AdaptiveExpansion', () => {
  let expansion: AdaptiveExpansion;

  beforeEach(() => {
    expansion = new AdaptiveExpansion();
  });

  describe('expand', () => {
    it('AE-1: Round 1 doubles topK, keeps same time window', () => {
      const assessment: CompletenessAssessment = {
        score: 0.3,
        isSufficient: false,
        recommendation: 'expand',
      };
      const result = expansion.expand(10, 48, assessment);

      expect(result.params.topK).toBe(20);
      expect(result.params.maxAgeHours).toBe(48);
      expect(result.round).toBe(1);
      expect(result.isExhausted).toBe(false);
    });

    it('AE-2: Round 2 triples topK and expands time window', () => {
      const assessment: CompletenessAssessment = {
        score: 0.3,
        isSufficient: false,
        recommendation: 'expand',
      };

      expansion.expand(10, 48, assessment); // Round 1
      const result = expansion.expand(10, 48, assessment); // Round 2

      expect(result.params.topK).toBe(30);
      expect(result.params.maxAgeHours).toBe(168);
      expect(result.round).toBe(2);
      expect(result.isExhausted).toBe(true);
    });

    it('AE-3: max_expand jumps to max immediately', () => {
      const assessment: CompletenessAssessment = {
        score: 0.1,
        isSufficient: false,
        recommendation: 'max_expand',
      };

      const result = expansion.expand(10, 48, assessment);

      expect(result.params.topK).toBe(30);
      expect(result.params.maxAgeHours).toBe(168);
      expect(result.round).toBe(2);
      expect(result.isExhausted).toBe(true);
    });

    it('AE-4: exhausted returns same params', () => {
      const assessment: CompletenessAssessment = {
        score: 0.3,
        isSufficient: false,
        recommendation: 'expand',
      };

      expansion.expand(10, 48, assessment); // Round 1
      expansion.expand(10, 48, assessment); // Round 2
      const result = expansion.expand(10, 48, assessment); // Round 3 (exhausted)

      expect(result.round).toBe(2);
      expect(result.isExhausted).toBe(true);
    });

    it('AE-5: reset clears state', () => {
      const assessment: CompletenessAssessment = {
        score: 0.3,
        isSufficient: false,
        recommendation: 'expand',
      };

      expansion.expand(10, 48, assessment); // Round 1
      expansion.reset();
      const result = expansion.expand(10, 48, assessment);

      expect(result.round).toBe(1);
    });

    it('AE-6: custom multipliers work', () => {
      const customExpansion = new AdaptiveExpansion({ maxTopKMultiplier: 5 });
      const assessment: CompletenessAssessment = {
        score: 0.1,
        isSufficient: false,
        recommendation: 'max_expand',
      };

      const result = customExpansion.expand(10, 48, assessment);

      expect(result.params.topK).toBe(50); // 10 * 5
    });
  });

  describe('getCurrentRound', () => {
    it('returns current round number', () => {
      expect(expansion.getCurrentRound()).toBe(0);

      const assessment: CompletenessAssessment = {
        score: 0.3,
        isSufficient: false,
        recommendation: 'expand',
      };
      expansion.expand(10, 48, assessment);
      expect(expansion.getCurrentRound()).toBe(1);
    });
  });

  describe('isExhausted', () => {
    it('returns true after round 2', () => {
      expect(expansion.isExhausted()).toBe(false);

      const assessment: CompletenessAssessment = {
        score: 0.3,
        isSufficient: false,
        recommendation: 'expand',
      };
      expansion.expand(10, 48, assessment);
      expect(expansion.isExhausted()).toBe(false);

      expansion.expand(10, 48, assessment);
      expect(expansion.isExhausted()).toBe(true);
    });
  });
});
