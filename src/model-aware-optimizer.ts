/**
 * claw-ctx — Model-Aware Context Optimizer
 *
 * v5.16.1: Added metrics collection and observability support
 */
import {
  ModelProfileRegistry,
  modelProfileRegistry,
  type ModelProfile,
  type OptimizationStrategy,
} from "./model-profile.js";
import {
  OptimizerMetricsCollector,
  optimizerMetricsCollector,
} from "./metrics/optimizer-metrics.js";
import {
  OptimizerObserver,
  optimizerObserver,
  type IEventBus,
} from "./obs/optimizer-observer.js";

/**
 * Optimization hint for context assembly
 */
export interface OptimizationHint {
  /** Strategy to use */
  strategy: OptimizationStrategy;

  /** Preload priority order */
  preloadPriority: string[];

  /** Whether to cache static prefix */
  cacheStaticPrefix: boolean;

  /** Whether to prefer summary over full context */
  preferSummary: boolean;

  /** Token threshold for compression trigger */
  compressionThreshold: number;

  /** Effective context window ratio */
  effectiveWindowRatio: number;

  /** Maximum context tokens */
  maxContextTokens: number;

  /** Suggested stable prefix ratio (0-1) */
  stablePrefixRatio: number;

  /** Whether dynamic loading is preferred */
  dynamicLoadingPreferred: boolean;
}

/**
 * Strategy-specific configuration
 */
export interface StrategyConfig {
  /** Ratio of budget for stable prefix (for static-prefix strategy) */
  stablePrefixBudgetRatio: number;

  /** Whether to batch load static content */
  batchStaticLoad: boolean;

  /** Delay threshold for dynamic load (ms) */
  dynamicLoadDelayMs: number;

  /** Whether to use predictive preloading */
  predictivePreload: boolean;

  /** Maximum items to preload */
  maxPreloadItems: number;
}

/**
 * Default strategy configurations
 */
export const DEFAULT_STRATEGY_CONFIGS: Record<OptimizationStrategy, StrategyConfig> = {
  "static-prefix": {
    stablePrefixBudgetRatio: 0.4,
    batchStaticLoad: true,
    dynamicLoadDelayMs: 0,
    predictivePreload: true,
    maxPreloadItems: 20,
  },
  "dynamic-load": {
    stablePrefixBudgetRatio: 0.2,
    batchStaticLoad: false,
    dynamicLoadDelayMs: 100,
    predictivePreload: false,
    maxPreloadItems: 10,
  },
  hybrid: {
    stablePrefixBudgetRatio: 0.3,
    batchStaticLoad: true,
    dynamicLoadDelayMs: 50,
    predictivePreload: true,
    maxPreloadItems: 15,
  },
};

/**
 * Model-Aware Context Optimizer
 *
 * Provides model-specific optimization hints for context assembly.
 */
export class ModelAwareOptimizer {
  private registry: ModelProfileRegistry;
  private metrics: OptimizerMetricsCollector;
  private observer: OptimizerObserver;

  constructor(
    registry?: ModelProfileRegistry,
    metrics?: OptimizerMetricsCollector,
    observer?: OptimizerObserver
  ) {
    this.registry = registry ?? modelProfileRegistry;
    this.metrics = metrics ?? optimizerMetricsCollector;
    this.observer = observer ?? optimizerObserver;
  }

  /**
   * Get the metrics collector instance
   */
  getMetrics(): OptimizerMetricsCollector {
    return this.metrics;
  }

  /**
   * Get the observer instance
   */
  getObserver(): OptimizerObserver {
    return this.observer;
  }

  /**
   * Set the event bus for observability
   */
  setEventBus(eventBus: IEventBus): void {
    this.observer.setEventBus(eventBus);
  }

  /**
   * Get optimization strategy for a model
   */
  getStrategy(modelId: string): OptimizationStrategy {
    const startTime = Date.now();
    const profile = this.registry.resolve(modelId);
    const strategy = profile?.optimization.strategy ?? "hybrid";

    // Record metrics
    this.metrics.recordStrategyUsed(strategy, modelId);
    const duration = Date.now() - startTime;
    this.metrics.recordOptimizeDuration(duration);

    // Emit observability event
    this.observer.emitStrategyUsed(strategy, modelId);
    this.observer.emitOptimizeDuration(duration, modelId);

    return strategy;
  }

  /**
   * Get preload priority for a model
   */
  getPreloadPriority(modelId: string): string[] {
    const profile = this.registry.resolve(modelId);
    return profile?.optimization.preloadPriority ?? ["docs", "code"];
  }

  /**
   * Get compression threshold for a model
   */
  getCompressionThreshold(modelId: string): number {
    const profile = this.registry.resolve(modelId);
    return profile?.optimization.compressionThreshold ?? 100000;
  }

  /**
   * Check if model supports caching
   */
  isCacheSupported(modelId: string): boolean {
    const profile = this.registry.resolve(modelId);
    return profile?.cache.supported ?? true;
  }

  /**
   * Check if static prefix improves cache for this model
   */
  hasStaticPrefixBonus(modelId: string): boolean {
    const profile = this.registry.resolve(modelId);
    return profile?.cache.staticPrefixBonus ?? false;
  }

  /**
   * Get context window information for a model
   */
  getContextWindow(modelId: string): { max: number; effective: number } {
    const profile = this.registry.resolve(modelId);
    const maxTokens = profile?.context.maxTokens ?? 128000;
    const effectiveRatio = profile?.context.effectiveWindowRatio ?? 0.8;
    return {
      max: maxTokens,
      effective: Math.floor(maxTokens * effectiveRatio),
    };
  }

  /**
   * Get strategy-specific configuration
   */
  getStrategyConfig(modelId: string): StrategyConfig {
    const strategy = this.getStrategy(modelId);
    return DEFAULT_STRATEGY_CONFIGS[strategy];
  }

  /**
   * Generate comprehensive optimization hint for context assembly
   */
  getOptimizationHint(modelId: string): OptimizationHint {
    const profile = this.registry.resolve(modelId);
    const strategy = this.getStrategy(modelId);
    const strategyConfig = this.getStrategyConfig(modelId);

    return {
      strategy,
      preloadPriority: this.getPreloadPriority(modelId),
      cacheStaticPrefix: this.hasStaticPrefixBonus(modelId),
      preferSummary: profile?.context.prefersSummary ?? false,
      compressionThreshold: this.getCompressionThreshold(modelId),
      effectiveWindowRatio: profile?.context.effectiveWindowRatio ?? 0.8,
      maxContextTokens: profile?.context.maxTokens ?? 128000,
      stablePrefixRatio: strategyConfig.stablePrefixBudgetRatio,
      dynamicLoadingPreferred: strategy === "dynamic-load",
    };
  }

  /**
   * Check if model prefers summary over full context
   */
  prefersSummary(modelId: string): boolean {
    const profile = this.registry.resolve(modelId);
    return profile?.context.prefersSummary ?? false;
  }

  /**
   * Get model profile (if available)
   */
  getProfile(modelId: string): ModelProfile | undefined {
    return this.registry.resolve(modelId);
  }

  /**
   * Get default profile for unknown models
   */
  getDefaultProfile(): ModelProfile {
    return this.registry.getDefault();
  }

  /**
   * Calculate optimal token budget allocation
   *
   * @param modelId - Model identifier
   * @param totalBudget - Total token budget available
   * @returns Budget allocation for different context components
   */
  calculateBudgetAllocation(
    modelId: string,
    totalBudget: number
  ): {
    stable: number;
    dynamic: number;
    reserve: number;
    preload: number;
  } {
    const hint = this.getOptimizationHint(modelId);
    const strategyConfig = this.getStrategyConfig(modelId);

    // Reserve 10% for response overhead
    const effectiveBudget = Math.floor(totalBudget * 0.9);

    // Stable prefix budget (from effective budget)
    const stable = Math.floor(effectiveBudget * hint.stablePrefixRatio);

    // Preload budget (subset of stable, not additional)
    const preload = Math.min(
      Math.floor(stable * 0.5),
      strategyConfig.maxPreloadItems * 500 // ~500 tokens per item
    );

    // Dynamic content budget (remaining from effective after stable)
    const dynamic = effectiveBudget - stable;

    // Reserve for critical signals (from total budget, not effective)
    const reserve = totalBudget - effectiveBudget;

    // Emit observability event
    this.observer.emitBudgetAllocated(modelId, totalBudget, stable, dynamic, reserve);

    return { stable, dynamic, reserve, preload };
  }

  /**
   * Determine if content should be preloaded based on model and content type
   *
   * @param modelId - Model identifier
   * @param contentType - Content type (docs, code, tests, etc.)
   * @returns Whether this content should be preloaded
   */
  shouldPreload(modelId: string, contentType: string): boolean {
    const priority = this.getPreloadPriority(modelId);
    const index = priority.indexOf(contentType);
    // Preload if in top 3 priority items
    return index >= 0 && index < 3;
  }

  /**
   * Get preload order for multiple content types
   *
   * @param modelId - Model identifier
   * @param contentTypes - Array of content types
   * @returns Sorted array of content types by priority
   */
  getPreloadOrder(modelId: string, contentTypes: string[]): string[] {
    const priority = this.getPreloadPriority(modelId);
    return [...contentTypes].sort((a, b) => {
      const aIndex = priority.indexOf(a);
      const bIndex = priority.indexOf(b);
      // Unknown types go last
      const aScore = aIndex >= 0 ? aIndex : 999;
      const bScore = bIndex >= 0 ? bIndex : 999;
      return aScore - bScore;
    });
  }

  /**
   * Check if compression should be triggered
   *
   * @param modelId - Model identifier
   * @param currentTokens - Current token count
   * @returns Whether compression should be triggered
   */
  shouldCompress(modelId: string, currentTokens: number): boolean {
    const threshold = this.getCompressionThreshold(modelId);
    return currentTokens >= threshold;
  }

  /**
   * Get recommended compression ratio
   *
   * @param modelId - Model identifier
   * @param currentTokens - Current token count
   * @returns Target ratio for post-compression tokens (0-1)
   */
  getCompressionTargetRatio(modelId: string, currentTokens: number): number {
    const threshold = this.getCompressionThreshold(modelId);
    const window = this.getContextWindow(modelId);

    // If over threshold, target 70% of effective window
    if (currentTokens > threshold) {
      const targetTokens = Math.floor(window.effective * 0.7);
      return targetTokens / currentTokens;
    }

    // If approaching threshold, target 85%
    if (currentTokens > threshold * 0.85) {
      return 0.85;
    }

    // No compression needed
    return 1.0;
  }

  /**
   * Generate human-readable optimization summary
   */
  getSummary(modelId: string): string {
    const hint = this.getOptimizationHint(modelId);
    const profile = this.getProfile(modelId) ?? this.getDefaultProfile();

    const lines = [
      `Model: ${profile.name} (${profile.id})`,
      `Strategy: ${hint.strategy}`,
      `Context Window: ${hint.maxContextTokens.toLocaleString()} tokens`,
      `Effective Ratio: ${Math.round(hint.effectiveWindowRatio * 100)}%`,
      `Compression Threshold: ${hint.compressionThreshold.toLocaleString()} tokens`,
      `Cache Static Prefix: ${hint.cacheStaticPrefix ? "Yes" : "No"}`,
      `Prefers Summary: ${hint.preferSummary ? "Yes" : "No"}`,
      `Preload Priority: ${hint.preloadPriority.join(" > ")}`,
    ];

    return lines.join("\n");
  }
}

// Singleton instance
export const modelAwareOptimizer = new ModelAwareOptimizer();
