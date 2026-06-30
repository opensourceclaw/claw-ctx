/**
 * Tests for CompletenessGate (v5.3.0)
 */

import { describe, it, expect } from 'vitest';
import { CompletenessGate } from '../../src/session-resume/completeness-gate.js';

describe('CompletenessGate', () => {
  describe('assess', () => {
    it('CG-1: returns "use" when score >= threshold', () => {
      const gate = new CompletenessGate({ threshold: 0.4, criticalThreshold: 0.2 });
      const result = gate.assess(0.5);
      expect(result.recommendation).toBe('use');
      expect(result.isSufficient).toBe(true);
      expect(result.score).toBe(0.5);
    });

    it('CG-2: returns "expand" when score < threshold but >= critical', () => {
      const gate = new CompletenessGate({ threshold: 0.4, criticalThreshold: 0.2 });
      const result = gate.assess(0.3);
      expect(result.recommendation).toBe('expand');
      expect(result.isSufficient).toBe(false);
    });

    it('CG-3: returns "max_expand" when score < critical', () => {
      const gate = new CompletenessGate({ threshold: 0.4, criticalThreshold: 0.2 });
      const result = gate.assess(0.1);
      expect(result.recommendation).toBe('max_expand');
      expect(result.isSufficient).toBe(false);
    });

    it('CG-4: returns "use" for undefined score (graceful degradation)', () => {
      const gate = new CompletenessGate({ threshold: 0.4, criticalThreshold: 0.2 });
      const result = gate.assess(undefined);
      expect(result.recommendation).toBe('use');
      expect(result.isSufficient).toBe(true);
      expect(result.score).toBe(0);
    });

    it('CG-5: clamps negative score to 0', () => {
      const gate = new CompletenessGate({ threshold: 0.4, criticalThreshold: 0.2 });
      const result = gate.assess(-0.5);
      expect(result.score).toBe(0);
    });

    it('CG-6: clamps score > 1.0 to 1.0', () => {
      const gate = new CompletenessGate();
      const result = gate.assess(1.5);
      expect(result.score).toBe(1.0);
      expect(result.recommendation).toBe('use');
    });

    it('CG-7: passes through breakdown', () => {
      const gate = new CompletenessGate();
      const breakdown = { coverage: 0.5, diversity: 0.6, confidence: 0.7 };
      const result = gate.assess(0.3, breakdown);
      expect(result.breakdown).toEqual(breakdown);
    });

    it('CG-8: respects custom threshold', () => {
      const gate = new CompletenessGate({ threshold: 0.3, criticalThreshold: 0.1 });
      const result = gate.assess(0.35);
      expect(result.recommendation).toBe('use');
    });
  });

  describe('updateConfig', () => {
    it('updates threshold at runtime', () => {
      const gate = new CompletenessGate({ threshold: 0.4 });
      expect(gate.assess(0.35).recommendation).toBe('expand');

      gate.updateConfig({ threshold: 0.3 });
      expect(gate.assess(0.35).recommendation).toBe('use');
    });
  });

  describe('getConfig', () => {
    it('returns current configuration', () => {
      const gate = new CompletenessGate({ threshold: 0.5, criticalThreshold: 0.25 });
      const config = gate.getConfig();
      expect(config.threshold).toBe(0.5);
      expect(config.criticalThreshold).toBe(0.25);
    });
  });
});
