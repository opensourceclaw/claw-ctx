/**
 * Tests for ModelAwareOptimizer
 * claw-ctx v5.16.0
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ModelAwareOptimizer,
  modelAwareOptimizer,
  DEFAULT_STRATEGY_CONFIGS,
  type OptimizationHint,
  type StrategyConfig,
} from '../src/model-aware-optimizer.js';

describe('DEFAULT_STRATEGY_CONFIGS', () => {
  it('should have configs for all 3 strategies', () => {
    expect(DEFAULT_STRATEGY_CONFIGS['static-prefix']).toBeDefined();
    expect(DEFAULT_STRATEGY_CONFIGS['dynamic-load']).toBeDefined();
    expect(DEFAULT_STRATEGY_CONFIGS['hybrid']).toBeDefined();
  });

  it('static-prefix should have highest stable prefix ratio', () => {
    const staticConfig = DEFAULT_STRATEGY_CONFIGS['static-prefix'];
    const dynamicConfig = DEFAULT_STRATEGY_CONFIGS['dynamic-load'];
    expect(staticConfig.stablePrefixBudgetRatio).toBeGreaterThan(dynamicConfig.stablePrefixBudgetRatio);
  });

  it('dynamic-load should have batchStaticLoad disabled', () => {
    expect(DEFAULT_STRATEGY_CONFIGS['dynamic-load'].batchStaticLoad).toBe(false);
  });
});

describe('ModelAwareOptimizer', () => {
  let optimizer: ModelAwareOptimizer;

  beforeEach(() => {
    optimizer = new ModelAwareOptimizer();
  });

  describe('getStrategy()', () => {
    it('should return static-prefix for DeepSeek models', () => {
      expect(optimizer.getStrategy('deepseek-v3')).toBe('static-prefix');
      expect(optimizer.getStrategy('deepseek-r1')).toBe('static-prefix');
    });

    it('should return dynamic-load for MiniMax models', () => {
      expect(optimizer.getStrategy('minimax-m2.5')).toBe('dynamic-load');
      expect(optimizer.getStrategy('minimax-m3')).toBe('dynamic-load');
    });

    it('should return dynamic-load for Kimi models', () => {
      expect(optimizer.getStrategy('kimi-k1.5')).toBe('dynamic-load');
      expect(optimizer.getStrategy('kimi-k2')).toBe('dynamic-load');
    });

    it('should return dynamic-load for OpenAI o-series', () => {
      expect(optimizer.getStrategy('o1')).toBe('dynamic-load');
      expect(optimizer.getStrategy('o2')).toBe('dynamic-load');
      expect(optimizer.getStrategy('o3')).toBe('dynamic-load');
    });

    it('should return static-prefix for Claude models', () => {
      expect(optimizer.getStrategy('claude-3.5-sonnet')).toBe('static-prefix');
      expect(optimizer.getStrategy('claude-5')).toBe('static-prefix');
    });

    it('should return static-prefix for GPT models', () => {
      expect(optimizer.getStrategy('gpt-4o')).toBe('static-prefix');
      expect(optimizer.getStrategy('gpt-5')).toBe('static-prefix');
    });

    it('should return hybrid for unknown models', () => {
      expect(optimizer.getStrategy('unknown-model')).toBe('hybrid');
    });
  });

  describe('getPreloadPriority()', () => {
    it('should return correct priority for DeepSeek', () => {
      const priority = optimizer.getPreloadPriority('deepseek-v3');
      expect(priority).toEqual(['docs', 'code', 'tests']);
    });

    it('should return correct priority for MiniMax', () => {
      const priority = optimizer.getPreloadPriority('minimax-m3');
      expect(priority).toEqual(['code', 'docs']);
    });

    it('should return default priority for unknown models', () => {
      const priority = optimizer.getPreloadPriority('unknown');
      expect(priority).toEqual(['docs', 'code']);
    });
  });

  describe('getCompressionThreshold()', () => {
    it('should return correct threshold for DeepSeek V3', () => {
      expect(optimizer.getCompressionThreshold('deepseek-v3')).toBe(100000);
    });

    it('should return higher threshold for larger models', () => {
      const smallThreshold = optimizer.getCompressionThreshold('gpt-4o');
      const largeThreshold = optimizer.getCompressionThreshold('gpt-5.6');
      expect(largeThreshold).toBeGreaterThan(smallThreshold);
    });

    it('should return default threshold for unknown models', () => {
      expect(optimizer.getCompressionThreshold('unknown')).toBe(100000);
    });
  });

  describe('isCacheSupported()', () => {
    it('should return true for all known models', () => {
      expect(optimizer.isCacheSupported('deepseek-v3')).toBe(true);
      expect(optimizer.isCacheSupported('gpt-4o')).toBe(true);
      expect(optimizer.isCacheSupported('minimax-m3')).toBe(true);
    });

    it('should return true for unknown models (default)', () => {
      expect(optimizer.isCacheSupported('unknown')).toBe(true);
    });
  });

  describe('hasStaticPrefixBonus()', () => {
    it('should return true for DeepSeek models', () => {
      expect(optimizer.hasStaticPrefixBonus('deepseek-v3')).toBe(true);
      expect(optimizer.hasStaticPrefixBonus('deepseek-r1')).toBe(true);
    });

    it('should return false for MiniMax models', () => {
      expect(optimizer.hasStaticPrefixBonus('minimax-m2.5')).toBe(false);
    });

    it('should return false for Kimi models', () => {
      expect(optimizer.hasStaticPrefixBonus('kimi-k1.5')).toBe(false);
    });

    it('should return false for unknown models', () => {
      expect(optimizer.hasStaticPrefixBonus('unknown')).toBe(false);
    });
  });

  describe('getContextWindow()', () => {
    it('should return correct window for GPT-4o', () => {
      const window = optimizer.getContextWindow('gpt-4o');
      expect(window.max).toBe(128000);
      expect(window.effective).toBe(Math.floor(128000 * 0.85));
    });

    it('should return correct window for Gemini 1.5 Pro', () => {
      const window = optimizer.getContextWindow('gemini-1.5-pro');
      expect(window.max).toBe(1024000);
      expect(window.effective).toBe(Math.floor(1024000 * 0.9));
    });

    it('should return default window for unknown models', () => {
      const window = optimizer.getContextWindow('unknown');
      expect(window.max).toBe(128000);
      expect(window.effective).toBe(Math.floor(128000 * 0.8));
    });
  });

  describe('getOptimizationHint()', () => {
    it('should return complete hint for DeepSeek V3', () => {
      const hint = optimizer.getOptimizationHint('deepseek-v3');
      expect(hint.strategy).toBe('static-prefix');
      expect(hint.cacheStaticPrefix).toBe(true);
      expect(hint.preferSummary).toBe(false);
      expect(hint.maxContextTokens).toBe(128000);
      expect(hint.compressionThreshold).toBe(100000);
    });

    it('should return complete hint for o1', () => {
      const hint = optimizer.getOptimizationHint('o1');
      expect(hint.strategy).toBe('dynamic-load');
      expect(hint.cacheStaticPrefix).toBe(false);
      expect(hint.preferSummary).toBe(true);
    });

    it('should return default hint for unknown models', () => {
      const hint = optimizer.getOptimizationHint('unknown');
      expect(hint.strategy).toBe('hybrid');
      expect(hint.cacheStaticPrefix).toBe(false);
    });
  });

  describe('prefersSummary()', () => {
    it('should return true for OpenAI o-series', () => {
      expect(optimizer.prefersSummary('o1')).toBe(true);
      expect(optimizer.prefersSummary('o2')).toBe(true);
      expect(optimizer.prefersSummary('o3')).toBe(true);
    });

    it('should return false for GPT models', () => {
      expect(optimizer.prefersSummary('gpt-4o')).toBe(false);
      expect(optimizer.prefersSummary('gpt-5')).toBe(false);
    });

    it('should return false for unknown models', () => {
      expect(optimizer.prefersSummary('unknown')).toBe(false);
    });
  });

  describe('calculateBudgetAllocation()', () => {
    it('should allocate higher stable budget for static-prefix models', () => {
      const staticAlloc = optimizer.calculateBudgetAllocation('deepseek-v3', 100000);
      const dynamicAlloc = optimizer.calculateBudgetAllocation('minimax-m3', 100000);
      expect(staticAlloc.stable).toBeGreaterThan(dynamicAlloc.stable);
    });

    it('should allocate reserve budget for all models', () => {
      const alloc = optimizer.calculateBudgetAllocation('gpt-4o', 100000);
      expect(alloc.reserve).toBeGreaterThan(0);
      expect(alloc.reserve).toBe(10000); // 10% of 100000
    });

    it('should respect total budget', () => {
      const alloc = optimizer.calculateBudgetAllocation('gpt-4o', 100000);
      // Note: preload is a subset of stable, so don't add it separately
      const total = alloc.stable + alloc.dynamic + alloc.reserve;
      expect(total).toBeLessThanOrEqual(100000);
      expect(alloc.preload).toBeLessThanOrEqual(alloc.stable);
    });
  });

  describe('shouldPreload()', () => {
    it('should preload high-priority content types', () => {
      expect(optimizer.shouldPreload('deepseek-v3', 'docs')).toBe(true);
      expect(optimizer.shouldPreload('deepseek-v3', 'code')).toBe(true);
      expect(optimizer.shouldPreload('deepseek-v3', 'tests')).toBe(true);
    });

    it('should not preload low-priority content types', () => {
      // Unknown content type is not in priority list
      expect(optimizer.shouldPreload('gpt-4o', 'unknown-type')).toBe(false);
    });
  });

  describe('getPreloadOrder()', () => {
    it('should sort content types by priority', () => {
      const types = ['tests', 'docs', 'code'];
      const ordered = optimizer.getPreloadOrder('deepseek-v3', types);
      expect(ordered[0]).toBe('docs'); // First in deepseek priority
    });
  });

  describe('shouldCompress()', () => {
    it('should return true when over threshold', () => {
      expect(optimizer.shouldCompress('gpt-4o', 150000)).toBe(true);
    });

    it('should return false when under threshold', () => {
      expect(optimizer.shouldCompress('gpt-4o', 50000)).toBe(false);
    });

    it('should respect model-specific thresholds', () => {
      // GPT-4o threshold is 100000, GPT-5.6 threshold is 400000
      expect(optimizer.shouldCompress('gpt-4o', 150000)).toBe(true);
      expect(optimizer.shouldCompress('gpt-5.6', 150000)).toBe(false);
    });
  });

  describe('getCompressionTargetRatio()', () => {
    it('should return 1.0 when under threshold', () => {
      expect(optimizer.getCompressionTargetRatio('gpt-4o', 50000)).toBe(1.0);
    });

    it('should return lower ratio when over threshold', () => {
      const ratio = optimizer.getCompressionTargetRatio('gpt-4o', 150000);
      expect(ratio).toBeLessThan(1.0);
      expect(ratio).toBeGreaterThan(0);
    });
  });

  describe('getSummary()', () => {
    it('should return human-readable summary', () => {
      const summary = optimizer.getSummary('deepseek-v3');
      expect(summary).toContain('DeepSeek V3');
      expect(summary).toContain('static-prefix');
      expect(summary).toContain('128,000');
    });
  });
});

describe('modelAwareOptimizer singleton', () => {
  it('should be a ModelAwareOptimizer instance', () => {
    expect(modelAwareOptimizer).toBeInstanceOf(ModelAwareOptimizer);
  });

  it('should have access to all model profiles', () => {
    const hint = modelAwareOptimizer.getOptimizationHint('claude-3.5-sonnet');
    expect(hint.strategy).toBe('static-prefix');
  });
});
