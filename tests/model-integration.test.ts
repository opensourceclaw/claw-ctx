/**
 * Integration tests for ModelAwareOptimizer integration in engine.ts
 * claw-ctx v5.16.0
 */
import { describe, it, expect } from 'vitest';
import { createClawContextEngine } from '../src/engine.js';

describe('Engine Model Integration', () => {
  const mockLogger = {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
  };

  const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger);

  describe('getModelOptimizer()', () => {
    it('should return ModelAwareOptimizer instance', () => {
      const optimizer = engine.getModelOptimizer();
      expect(optimizer).toBeDefined();
      expect(optimizer.getStrategy('deepseek-v3')).toBe('static-prefix');
    });
  });

  describe('getModelBudgetAllocation()', () => {
    it('should return budget allocation for known model', () => {
      const alloc = engine.getModelBudgetAllocation('gpt-4o', 100000);
      expect(alloc.stable).toBeGreaterThan(0);
      expect(alloc.dynamic).toBeGreaterThan(0);
      expect(alloc.reserve).toBe(10000);
    });

    it('should return budget allocation for unknown model (hybrid)', () => {
      const alloc = engine.getModelBudgetAllocation('unknown-model', 100000);
      expect(alloc.stable).toBeGreaterThan(0);
      expect(alloc.dynamic).toBeGreaterThan(0);
    });
  });

  describe('assemble() with model parameter', () => {
    it('should store optimization hint when model is provided', async () => {
      const result = await engine.assemble({
        sessionId: 'test-session-1',
        messages: [{ role: 'user', content: 'Hello world' }],
        tokenBudget: 4000,
        model: 'deepseek-v3',
      });

      expect(result.messages).toBeDefined();

      // Check that optimization hint was stored
      const hint = engine.getLastOptimizationHint();
      expect(hint).not.toBeNull();
      expect(hint?.strategy).toBe('static-prefix');
      expect(hint?.cacheStaticPrefix).toBe(true);
    });

    it('should work without model parameter', async () => {
      const result = await engine.assemble({
        sessionId: 'test-session-2',
        messages: [{ role: 'user', content: 'Test message' }],
        tokenBudget: 4000,
      });

      expect(result.messages).toBeDefined();

      // No hint stored when no model provided
      const hint = engine.getLastOptimizationHint();
      expect(hint).toBeNull();
    });

    it('should handle different model strategies', async () => {
      // Test static-prefix model
      await engine.assemble({
        sessionId: 'test-session-3',
        messages: [{ role: 'user', content: 'Test' }],
        tokenBudget: 4000,
        model: 'claude-3.5-sonnet',
      });
      let hint = engine.getLastOptimizationHint();
      expect(hint?.strategy).toBe('static-prefix');
      expect(hint?.cacheStaticPrefix).toBe(true);

      // Test dynamic-load model
      await engine.assemble({
        sessionId: 'test-session-4',
        messages: [{ role: 'user', content: 'Test' }],
        tokenBudget: 4000,
        model: 'minimax-m3',
      });
      hint = engine.getLastOptimizationHint();
      expect(hint?.strategy).toBe('dynamic-load');
      expect(hint?.cacheStaticPrefix).toBe(false);

      // Test o-series (prefers summary)
      await engine.assemble({
        sessionId: 'test-session-5',
        messages: [{ role: 'user', content: 'Test' }],
        tokenBudget: 4000,
        model: 'o1',
      });
      hint = engine.getLastOptimizationHint();
      expect(hint?.strategy).toBe('dynamic-load');
      expect(hint?.preferSummary).toBe(true);
    });
  });
});
