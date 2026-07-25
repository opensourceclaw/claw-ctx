/**
 * claw-ctx — Model Profile
 *
 * Defines model-specific characteristics for context optimization.
 * Different models have different caching mechanisms, context windows,
 * and optimal loading strategies.
 *
 * v5.16.0: Initial implementation with 35 built-in model profiles
 */

/**
 * Optimization strategy type
 */
export type OptimizationStrategy = 'static-prefix' | 'dynamic-load' | 'hybrid';

/**
 * Model profile interface
 * Defines characteristics for context optimization
 */
export interface ModelProfile {
  /** Unique model identifier (e.g., "deepseek-v3", "gpt-4o") */
  id: string;

  /** Display name */
  name: string;

  /** Provider name */
  provider: string;

  /** Cache characteristics */
  cache: {
    /** Whether static prefix improves cache hit rate */
    staticPrefixBonus: boolean;
    /** Whether caching is supported */
    supported: boolean;
  };

  /** Context characteristics */
  context: {
    /** Maximum context window in tokens */
    maxTokens: number;
    /** Effective window ratio (0-1), accounts for system prompt, etc. */
    effectiveWindowRatio: number;
    /** Whether model prefers summary over full context */
    prefersSummary: boolean;
  };

  /** Optimization settings */
  optimization: {
    /** Optimization strategy to use */
    strategy: OptimizationStrategy;
    /** Priority order for preloading (e.g., ["docs", "tests", "code"]) */
    preloadPriority: string[];
    /** Token threshold to trigger compression */
    compressionThreshold: number;
  };
}

/**
 * Built-in model profiles (35 models)
 *
 * Strategy mapping:
 * - static-prefix: DeepSeek, GLM, Qwen, Claude, Gemini, Mistral, GPT-4x
 * - dynamic-load: MiniMax, Kimi, OpenAI o-series
 * - hybrid: Default fallback
 */
export const BUILTIN_MODEL_PROFILES: ModelProfile[] = [
  // ── 国内模型 (16) ─────────────────────────────────────────────

  // MiniMax (dynamic-load)
  {
    id: "minimax-m2.5",
    name: "MiniMax M2.5",
    provider: "MiniMax",
    cache: { staticPrefixBonus: false, supported: true },
    context: { maxTokens: 128000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "dynamic-load", preloadPriority: ["code", "docs"], compressionThreshold: 100000 }
  },
  {
    id: "minimax-m3",
    name: "MiniMax M3",
    provider: "MiniMax",
    cache: { staticPrefixBonus: false, supported: true },
    context: { maxTokens: 256000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "dynamic-load", preloadPriority: ["code", "docs"], compressionThreshold: 200000 }
  },

  // Kimi (dynamic-load)
  {
    id: "kimi-k1.5",
    name: "Kimi k1.5",
    provider: "Kimi",
    cache: { staticPrefixBonus: false, supported: true },
    context: { maxTokens: 200000, effectiveWindowRatio: 0.8, prefersSummary: false },
    optimization: { strategy: "dynamic-load", preloadPriority: ["docs", "code"], compressionThreshold: 150000 }
  },
  {
    id: "kimi-k2",
    name: "Kimi k2",
    provider: "Kimi",
    cache: { staticPrefixBonus: false, supported: true },
    context: { maxTokens: 320000, effectiveWindowRatio: 0.8, prefersSummary: false },
    optimization: { strategy: "dynamic-load", preloadPriority: ["docs", "code"], compressionThreshold: 250000 }
  },

  // DeepSeek (static-prefix)
  {
    id: "deepseek-v3",
    name: "DeepSeek V3",
    provider: "DeepSeek",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 128000, effectiveWindowRatio: 0.9, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code", "tests"], compressionThreshold: 100000 }
  },
  {
    id: "deepseek-r1",
    name: "DeepSeek R1",
    provider: "DeepSeek",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 128000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code", "tests"], compressionThreshold: 100000 }
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    provider: "DeepSeek",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 128000, effectiveWindowRatio: 0.9, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code"], compressionThreshold: 100000 }
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "DeepSeek",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 256000, effectiveWindowRatio: 0.9, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code", "tests"], compressionThreshold: 200000 }
  },

  // Qwen (static-prefix)
  {
    id: "qwen-3",
    name: "Qwen 3",
    provider: "Qwen",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 128000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code"], compressionThreshold: 100000 }
  },
  {
    id: "qwen-3.5",
    name: "Qwen 3.5",
    provider: "Qwen",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 128000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code"], compressionThreshold: 100000 }
  },
  {
    id: "qwen-3.6",
    name: "Qwen 3.6",
    provider: "Qwen",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 128000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code"], compressionThreshold: 100000 }
  },
  {
    id: "qwen-3.7",
    name: "Qwen 3.7",
    provider: "Qwen",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 128000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code"], compressionThreshold: 100000 }
  },
  {
    id: "qwen-3.8",
    name: "Qwen 3.8",
    provider: "Qwen",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 256000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code", "tests"], compressionThreshold: 200000 }
  },

  // GLM (static-prefix)
  {
    id: "glm-5",
    name: "GLM 5",
    provider: "GLM",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 128000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code"], compressionThreshold: 100000 }
  },
  {
    id: "glm-5.1",
    name: "GLM 5.1",
    provider: "GLM",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 128000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code"], compressionThreshold: 100000 }
  },
  {
    id: "glm-5.2",
    name: "GLM 5.2",
    provider: "GLM",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 256000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code", "tests"], compressionThreshold: 200000 }
  },

  // ── 国际模型 (19) ─────────────────────────────────────────────

  // Mistral (static-prefix)
  {
    id: "mistral-large-2",
    name: "Mistral Large 2",
    provider: "Mistral",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 128000, effectiveWindowRatio: 0.9, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code"], compressionThreshold: 100000 }
  },

  // OpenAI GPT series (static-prefix)
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 128000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code"], compressionThreshold: 100000 }
  },
  {
    id: "gpt-4.5",
    name: "GPT-4.5",
    provider: "OpenAI",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 128000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code"], compressionThreshold: 100000 }
  },
  {
    id: "gpt-5",
    name: "GPT-5",
    provider: "OpenAI",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 256000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code", "tests"], compressionThreshold: 200000 }
  },
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    provider: "OpenAI",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 256000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code", "tests"], compressionThreshold: 200000 }
  },
  {
    id: "gpt-5.6",
    name: "GPT-5.6",
    provider: "OpenAI",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 512000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code", "tests"], compressionThreshold: 400000 }
  },

  // OpenAI o-series (dynamic-load)
  {
    id: "o1",
    name: "OpenAI o1",
    provider: "OpenAI",
    cache: { staticPrefixBonus: false, supported: true },
    context: { maxTokens: 200000, effectiveWindowRatio: 0.7, prefersSummary: true },
    optimization: { strategy: "dynamic-load", preloadPriority: ["code", "docs"], compressionThreshold: 150000 }
  },
  {
    id: "o2",
    name: "OpenAI o2",
    provider: "OpenAI",
    cache: { staticPrefixBonus: false, supported: true },
    context: { maxTokens: 200000, effectiveWindowRatio: 0.7, prefersSummary: true },
    optimization: { strategy: "dynamic-load", preloadPriority: ["code", "docs"], compressionThreshold: 150000 }
  },
  {
    id: "o3",
    name: "OpenAI o3",
    provider: "OpenAI",
    cache: { staticPrefixBonus: false, supported: true },
    context: { maxTokens: 256000, effectiveWindowRatio: 0.7, prefersSummary: true },
    optimization: { strategy: "dynamic-load", preloadPriority: ["code", "docs"], compressionThreshold: 200000 }
  },

  // Claude (static-prefix)
  {
    id: "claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "Claude",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 200000, effectiveWindowRatio: 0.9, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code", "tests"], compressionThreshold: 160000 }
  },
  {
    id: "claude-3.7-sonnet",
    name: "Claude 3.7 Sonnet",
    provider: "Claude",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 200000, effectiveWindowRatio: 0.9, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code", "tests"], compressionThreshold: 160000 }
  },
  {
    id: "claude-opus-4",
    name: "Claude Opus 4",
    provider: "Claude",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 200000, effectiveWindowRatio: 0.9, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code", "tests"], compressionThreshold: 160000 }
  },
  {
    id: "claude-4.6",
    name: "Claude 4.6",
    provider: "Claude",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 256000, effectiveWindowRatio: 0.9, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code", "tests"], compressionThreshold: 200000 }
  },
  {
    id: "claude-5",
    name: "Claude 5",
    provider: "Claude",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 512000, effectiveWindowRatio: 0.9, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code", "tests"], compressionThreshold: 400000 }
  },

  // Gemini (static-prefix)
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "Gemini",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 128000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code"], compressionThreshold: 100000 }
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "Gemini",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 256000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code", "tests"], compressionThreshold: 200000 }
  },
  {
    id: "gemini-3",
    name: "Gemini 3",
    provider: "Gemini",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 256000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code", "tests"], compressionThreshold: 200000 }
  },
  {
    id: "gemini-3.5",
    name: "Gemini 3.5",
    provider: "Gemini",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 512000, effectiveWindowRatio: 0.85, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code", "tests"], compressionThreshold: 400000 }
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    provider: "Gemini",
    cache: { staticPrefixBonus: true, supported: true },
    context: { maxTokens: 1024000, effectiveWindowRatio: 0.9, prefersSummary: false },
    optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code", "tests"], compressionThreshold: 800000 }
  },
];

/**
 * Model profile registry
 * Manages built-in and custom model profiles
 */
export class ModelProfileRegistry {
  private profiles: Map<string, ModelProfile>;

  constructor() {
    this.profiles = new Map();
    // Load built-in profiles
    for (const profile of BUILTIN_MODEL_PROFILES) {
      this.profiles.set(profile.id, profile);
    }
  }

  /**
   * Get a model profile by ID
   */
  get(id: string): ModelProfile | undefined {
    return this.profiles.get(id);
  }

  /**
   * Check if a profile exists
   */
  has(id: string): boolean {
    return this.profiles.has(id);
  }

  /**
   * Register a custom model profile
   */
  register(profile: ModelProfile): void {
    this.profiles.set(profile.id, profile);
  }

  /**
   * Get all profile IDs
   */
  getAllIds(): string[] {
    return Array.from(this.profiles.keys());
  }

  /**
   * Get profiles by provider
   */
  getByProvider(provider: string): ModelProfile[] {
    return Array.from(this.profiles.values()).filter(p => p.provider === provider);
  }

  /**
   * Get profiles by strategy
   */
  getByStrategy(strategy: OptimizationStrategy): ModelProfile[] {
    return Array.from(this.profiles.values()).filter(p => p.optimization.strategy === strategy);
  }

  /**
   * Resolve model ID from various formats
   * Handles aliases and partial matches
   */
  resolve(modelIdOrName: string): ModelProfile | undefined {
    // Direct match
    if (this.profiles.has(modelIdOrName)) {
      return this.profiles.get(modelIdOrName);
    }

    // Case-insensitive match
    const lower = modelIdOrName.toLowerCase();
    for (const [id, profile] of this.profiles) {
      if (id.toLowerCase() === lower || profile.name.toLowerCase() === lower) {
        return profile;
      }
    }

    // Partial match (e.g., "deepseek" -> "deepseek-v3")
    for (const [id, profile] of this.profiles) {
      if (id.toLowerCase().includes(lower) || profile.name.toLowerCase().includes(lower)) {
        return profile;
      }
    }

    return undefined;
  }

  /**
   * Get the default (hybrid) profile for unknown models
   */
  getDefault(): ModelProfile {
    return {
      id: "default",
      name: "Default",
      provider: "unknown",
      cache: { staticPrefixBonus: false, supported: true },
      context: { maxTokens: 128000, effectiveWindowRatio: 0.8, prefersSummary: false },
      optimization: { strategy: "hybrid", preloadPriority: ["docs", "code"], compressionThreshold: 100000 }
    };
  }
}

// Singleton instance
export const modelProfileRegistry = new ModelProfileRegistry();
