/**
 * Tests for ModelProfile and ModelProfileRegistry
 * claw-ctx v5.16.0
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ModelProfileRegistry,
  BUILTIN_MODEL_PROFILES,
  modelProfileRegistry,
  type ModelProfile,
  type OptimizationStrategy,
} from '../src/model-profile.js';

describe('ModelProfile Types', () => {
  it('should define valid optimization strategies', () => {
    const strategies: OptimizationStrategy[] = ['static-prefix', 'dynamic-load', 'hybrid'];
    expect(strategies).toHaveLength(3);
  });
});

describe('BUILTIN_MODEL_PROFILES', () => {
  it('should have 35 built-in profiles', () => {
    expect(BUILTIN_MODEL_PROFILES).toHaveLength(35);
  });

  it('should have 16 domestic models', () => {
    const domestic = BUILTIN_MODEL_PROFILES.filter(p =>
      ['MiniMax', 'Kimi', 'DeepSeek', 'Qwen', 'GLM'].includes(p.provider)
    );
    expect(domestic).toHaveLength(16);
  });

  it('should have 19 international models', () => {
    const international = BUILTIN_MODEL_PROFILES.filter(p =>
      ['Mistral', 'OpenAI', 'Claude', 'Gemini'].includes(p.provider)
    );
    expect(international).toHaveLength(19);
  });

  it('should have valid profile structure', () => {
    for (const profile of BUILTIN_MODEL_PROFILES) {
      expect(profile.id).toBeTruthy();
      expect(profile.name).toBeTruthy();
      expect(profile.provider).toBeTruthy();
      expect(profile.cache).toBeDefined();
      expect(profile.context).toBeDefined();
      expect(profile.optimization).toBeDefined();
      expect(profile.optimization.strategy).toMatch(/^(static-prefix|dynamic-load|hybrid)$/);
      expect(profile.context.maxTokens).toBeGreaterThan(0);
      expect(profile.context.effectiveWindowRatio).toBeGreaterThan(0);
      expect(profile.context.effectiveWindowRatio).toBeLessThanOrEqual(1);
    }
  });

  it('should have correct strategy assignment', () => {
    // Dynamic-load models: MiniMax (2), Kimi (2), OpenAI o-series (3)
    const dynamicLoad = BUILTIN_MODEL_PROFILES.filter(
      p => p.optimization.strategy === 'dynamic-load'
    );
    expect(dynamicLoad.length).toBe(7);

    // Static-prefix models
    const staticPrefix = BUILTIN_MODEL_PROFILES.filter(
      p => p.optimization.strategy === 'static-prefix'
    );
    expect(staticPrefix.length).toBe(28); // 35 - 7 dynamic-load = 28

    // Hybrid models: none by default
    const hybrid = BUILTIN_MODEL_PROFILES.filter(
      p => p.optimization.strategy === 'hybrid'
    );
    expect(hybrid.length).toBe(0);
  });
});

describe('ModelProfileRegistry', () => {
  let registry: ModelProfileRegistry;

  beforeEach(() => {
    registry = new ModelProfileRegistry();
  });

  describe('get()', () => {
    it('should return profile by id', () => {
      const profile = registry.get('deepseek-v3');
      expect(profile).toBeDefined();
      expect(profile?.name).toBe('DeepSeek V3');
    });

    it('should return undefined for non-existent id', () => {
      expect(registry.get('non-existent-model')).toBeUndefined();
    });
  });

  describe('has()', () => {
    it('should return true for existing profile', () => {
      expect(registry.has('gpt-4o')).toBe(true);
    });

    it('should return false for non-existent profile', () => {
      expect(registry.has('unknown-model')).toBe(false);
    });
  });

  describe('register()', () => {
    it('should register custom profile', () => {
      const customProfile: ModelProfile = {
        id: 'custom-model',
        name: 'Custom Model',
        provider: 'Custom',
        cache: { staticPrefixBonus: false, supported: true },
        context: { maxTokens: 100000, effectiveWindowRatio: 0.8, prefersSummary: false },
        optimization: { strategy: 'hybrid', preloadPriority: ['docs'], compressionThreshold: 80000 },
      };

      registry.register(customProfile);
      expect(registry.has('custom-model')).toBe(true);
      expect(registry.get('custom-model')).toEqual(customProfile);
    });

    it('should override existing profile', () => {
      const overrideProfile: ModelProfile = {
        id: 'deepseek-v3',
        name: 'DeepSeek V3 Customized',
        provider: 'DeepSeek',
        cache: { staticPrefixBonus: true, supported: true },
        context: { maxTokens: 200000, effectiveWindowRatio: 0.95, prefersSummary: false },
        optimization: { strategy: 'static-prefix', preloadPriority: ['tests'], compressionThreshold: 150000 },
      };

      registry.register(overrideProfile);
      expect(registry.get('deepseek-v3')?.name).toBe('DeepSeek V3 Customized');
    });
  });

  describe('getAllIds()', () => {
    it('should return all profile ids', () => {
      const ids = registry.getAllIds();
      expect(ids.length).toBe(35);
      expect(ids).toContain('deepseek-v3');
      expect(ids).toContain('gpt-4o');
      expect(ids).toContain('claude-3.5-sonnet');
    });
  });

  describe('getByProvider()', () => {
    it('should return all DeepSeek profiles', () => {
      const profiles = registry.getByProvider('DeepSeek');
      expect(profiles.length).toBe(4); // v3, r1, v4-flash, v4-pro
      expect(profiles.every(p => p.provider === 'DeepSeek')).toBe(true);
    });

    it('should return all OpenAI profiles', () => {
      const profiles = registry.getByProvider('OpenAI');
      expect(profiles.length).toBe(8); // gpt-4o, 4.5, 5, 5.5, 5.6, o1, o2, o3
    });

    it('should return empty array for unknown provider', () => {
      expect(registry.getByProvider('Unknown')).toEqual([]);
    });
  });

  describe('getByStrategy()', () => {
    it('should return all static-prefix profiles', () => {
      const profiles = registry.getByStrategy('static-prefix');
      expect(profiles.length).toBe(28);
    });

    it('should return all dynamic-load profiles', () => {
      const profiles = registry.getByStrategy('dynamic-load');
      expect(profiles.length).toBe(7);
    });

    it('should return empty array for hybrid (none by default)', () => {
      const profiles = registry.getByStrategy('hybrid');
      expect(profiles.length).toBe(0);
    });
  });

  describe('resolve()', () => {
    it('should resolve by exact id', () => {
      expect(registry.resolve('deepseek-v3')?.id).toBe('deepseek-v3');
    });

    it('should resolve by case-insensitive id', () => {
      expect(registry.resolve('DEEPSEEK-V3')?.id).toBe('deepseek-v3');
      expect(registry.resolve('GPT-4O')?.id).toBe('gpt-4o');
    });

    it('should resolve by display name', () => {
      expect(registry.resolve('DeepSeek V3')?.id).toBe('deepseek-v3');
      expect(registry.resolve('Claude 3.5 Sonnet')?.id).toBe('claude-3.5-sonnet');
    });

    it('should resolve by partial match', () => {
      expect(registry.resolve('deepseek')?.provider).toBe('DeepSeek');
      expect(registry.resolve('claude')?.provider).toBe('Claude');
      expect(registry.resolve('gemini')?.provider).toBe('Gemini');
    });

    it('should return undefined for no match', () => {
      expect(registry.resolve('completely-unknown-model')).toBeUndefined();
    });
  });

  describe('getDefault()', () => {
    it('should return default profile with hybrid strategy', () => {
      const defaultProfile = registry.getDefault();
      expect(defaultProfile.id).toBe('default');
      expect(defaultProfile.optimization.strategy).toBe('hybrid');
      expect(defaultProfile.context.maxTokens).toBe(128000);
    });
  });
});

describe('modelProfileRegistry singleton', () => {
  it('should be a ModelProfileRegistry instance', () => {
    expect(modelProfileRegistry).toBeInstanceOf(ModelProfileRegistry);
  });

  it('should have all built-in profiles', () => {
    expect(modelProfileRegistry.getAllIds().length).toBe(35);
  });
});

describe('Model-specific tests', () => {
  it('DeepSeek models should have staticPrefixBonus', () => {
    const profiles = modelProfileRegistry.getByProvider('DeepSeek');
    expect(profiles.every(p => p.cache.staticPrefixBonus === true)).toBe(true);
  });

  it('MiniMax and Kimi should not have staticPrefixBonus', () => {
    const minimax = modelProfileRegistry.getByProvider('MiniMax');
    const kimi = modelProfileRegistry.getByProvider('Kimi');
    expect(minimax.every(p => p.cache.staticPrefixBonus === false)).toBe(true);
    expect(kimi.every(p => p.cache.staticPrefixBonus === false)).toBe(true);
  });

  it('OpenAI o-series should prefer summary', () => {
    const o1 = modelProfileRegistry.get('o1');
    const o2 = modelProfileRegistry.get('o2');
    const o3 = modelProfileRegistry.get('o3');
    expect(o1?.context.prefersSummary).toBe(true);
    expect(o2?.context.prefersSummary).toBe(true);
    expect(o3?.context.prefersSummary).toBe(true);
  });

  it('Gemini 1.5 Pro should have largest context window', () => {
    const gemini15 = modelProfileRegistry.get('gemini-1.5-pro');
    expect(gemini15?.context.maxTokens).toBe(1024000);
    expect(gemini15?.optimization.compressionThreshold).toBe(800000);
  });

  it('Claude models should have high effectiveWindowRatio', () => {
    const claude = modelProfileRegistry.getByProvider('Claude');
    expect(claude.every(p => p.context.effectiveWindowRatio === 0.9)).toBe(true);
  });
});
