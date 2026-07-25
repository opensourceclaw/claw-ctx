/**
 * Tests for OptimizerObserver
 * claw-ctx v5.16.1
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { OptimizerObserver, optimizerObserver, type IEventBus } from '../src/obs/optimizer-observer.js';

describe('OptimizerObserver', () => {
  let observer: OptimizerObserver;
  let mockEventBus: IEventBus;
  let emittedEvents: Array<{ event: string; data: unknown }>;

  beforeEach(() => {
    emittedEvents = [];
    mockEventBus = {
      emit: (event: string, data: unknown) => {
        emittedEvents.push({ event, data });
      },
    };
    observer = new OptimizerObserver(mockEventBus);
  });

  describe('emitStrategyUsed()', () => {
    it('should emit strategy used event', () => {
      observer.emitStrategyUsed('static-prefix', 'deepseek-v3');

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].event).toBe('ctx.strategy.used');
      const data = emittedEvents[0].data as { strategy: string; modelId: string };
      expect(data.strategy).toBe('static-prefix');
      expect(data.modelId).toBe('deepseek-v3');
    });
  });

  describe('emitOptimizeDuration()', () => {
    it('should emit optimize duration event', () => {
      observer.emitOptimizeDuration(15, 'gpt-4o');

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].event).toBe('ctx.optimize.duration');
      const data = emittedEvents[0].data as { duration: number; modelId: string };
      expect(data.duration).toBe(15);
      expect(data.modelId).toBe('gpt-4o');
    });
  });

  describe('emitCacheResult()', () => {
    it('should emit cache hit event', () => {
      observer.emitCacheResult(true, 'deepseek-v3');

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].event).toBe('ctx.cache.result');
      const data = emittedEvents[0].data as { hit: boolean; modelId?: string };
      expect(data.hit).toBe(true);
      expect(data.modelId).toBe('deepseek-v3');
    });
  });

  describe('emitTokensSaved()', () => {
    it('should emit tokens saved event', () => {
      observer.emitTokensSaved(5000, 'claude-3.5-sonnet');

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].event).toBe('ctx.tokens.saved');
      const data = emittedEvents[0].data as { tokens: number };
      expect(data.tokens).toBe(5000);
    });
  });

  describe('emitBudgetAllocated()', () => {
    it('should emit budget allocation event', () => {
      observer.emitBudgetAllocated('gpt-4o', 100000, 36000, 54000, 10000);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].event).toBe('ctx.budget.allocated');
      const data = emittedEvents[0].data as { modelId: string; totalBudget: number };
      expect(data.modelId).toBe('gpt-4o');
      expect(data.totalBudget).toBe(100000);
    });
  });

  describe('emitCompressionTriggered()', () => {
    it('should emit compression triggered event', () => {
      observer.emitCompressionTriggered('gpt-5', 150000, 100000);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].event).toBe('ctx.compression.triggered');
      const data = emittedEvents[0].data as { modelId: string; tokensBefore: number };
      expect(data.modelId).toBe('gpt-5');
      expect(data.tokensBefore).toBe(150000);
    });
  });

  describe('setEnabled()', () => {
    it('should disable event emission', () => {
      observer.setEnabled(false);
      observer.emitStrategyUsed('static-prefix', 'model');
      expect(emittedEvents).toHaveLength(0);
    });
  });
});

describe('optimizerObserver singleton', () => {
  it('should be an OptimizerObserver instance', () => {
    expect(optimizerObserver).toBeInstanceOf(OptimizerObserver);
  });
});
