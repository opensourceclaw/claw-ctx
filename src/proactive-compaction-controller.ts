/**
 * claw-ctx — Proactive Compaction Controller
 *
 * v5.16.0: Proactive compaction triggered by token threshold, not just errors
 * 
 * This module provides proactive compression triggers to prevent context overflow
 * instead of waiting for model errors.
 */

import { ModelAwareOptimizer, type OptimizationHint } from "./model-aware-optimizer.js";
import { MecwEstimator } from "./mecw/MecwEstimator.js";
import { ContextTaskType } from "./context/ContextBudgetManager.js";
import { ContextEfficiencyMetrics, contextEfficiencyMetrics } from "./efficiency/ContextEfficiencyMetrics.js";

/**
 * Compaction trigger configuration
 */
export interface CompactionTriggerConfig {
  /** Token usage ratio to trigger proactive compaction (0-1) */
  proactiveRatio: number;

  /** Minimum tokens before considering compaction */
  minTokens: number;

  /** Cooldown between proactive compactions (ms) */
  cooldownMs: number;

  /** Maximum proactive compactions per session */
  maxCompactionsPerSession: number;

  /** Whether to use model-specific thresholds */
  useModelThresholds: boolean;
}

/**
 * Default trigger configuration
 */
export const DEFAULT_COMPACTION_TRIGGER_CONFIG: CompactionTriggerConfig = {
  proactiveRatio: 0.75, // Trigger at 75% of context window
  minTokens: 50000, // Minimum 50k tokens
  cooldownMs: 300000, // 5 minutes cooldown
  maxCompactionsPerSession: 5,
  useModelThresholds: true,
};

/**
 * Compaction recommendation
 */
export interface CompactionRecommendation {
  /** Whether compaction should be triggered */
  shouldCompact: boolean;

  /** Reason for recommendation */
  reason: string;

  /** Current token count */
  currentTokens: number;

  /** Threshold that triggered the recommendation */
  threshold: number;

  /** Recommended target tokens after compaction */
  targetTokens: number;

  /** Model-specific hint */
  modelHint?: OptimizationHint;
}

/**
 * Session state for compaction tracking
 */
interface SessionState {
  lastCompactionTime: number | null;
  compactionCount: number;
  lastTokenCount: number;
}

/**
 * Proactive Compaction Controller
 * 
 * Monitors token usage and triggers compaction proactively based on
 * model-specific thresholds and usage patterns.
 */
export class ProactiveCompactionController {
  private optimizer: ModelAwareOptimizer;
  private config: CompactionTriggerConfig;
  private sessionStates: Map<string, SessionState> = new Map();
  // v6.6.0: pure-observability metrics — injected for tests, defaults to singleton.
  private metrics: ContextEfficiencyMetrics;

  constructor(
    optimizer?: ModelAwareOptimizer,
    config?: Partial<CompactionTriggerConfig>,
    metrics?: ContextEfficiencyMetrics,
  ) {
    this.optimizer = optimizer ?? new ModelAwareOptimizer();
    this.config = { ...DEFAULT_COMPACTION_TRIGGER_CONFIG, ...config };
    this.metrics = metrics ?? contextEfficiencyMetrics;
  }

  /**
   * Check if compaction should be triggered
   * 
   * @param sessionId - Session identifier
   * @param modelId - Model identifier (e.g., "deepseek-v3", "gpt-4o")
   * @param currentTokens - Current token count
   * @returns Compaction recommendation
   */
  shouldCompact(
    sessionId: string,
    modelId: string,
    currentTokens: number,
    taskType?: ContextTaskType
  ): CompactionRecommendation {
    // Get or create session state
    let state = this.sessionStates.get(sessionId);
    if (!state) {
      state = {
        lastCompactionTime: null,
        compactionCount: 0,
        lastTokenCount: 0,
      };
      this.sessionStates.set(sessionId, state);
    }

    // Get model-specific optimization hint
    const modelHint = this.optimizer.getOptimizationHint(modelId);

    // Determine threshold
    let threshold: number;
    if (taskType) {
      // v6.5.0: MECW-aware threshold — MECW = maxTokens × ratio × complexityFactor
      const estimator = new MecwEstimator(this.optimizer);
      threshold = estimator.estimateMecw(modelId, taskType).mecwTokens;
    } else if (this.config.useModelThresholds) {
      // Use model-specific compression threshold from profile
      threshold = modelHint.compressionThreshold;
    } else {
      // Use ratio of max context window
      const maxTokens = modelHint.maxContextTokens;
      threshold = Math.floor(maxTokens * this.config.proactiveRatio);
    }

    // Ensure minimum threshold
    threshold = Math.max(threshold, this.config.minTokens);

    // Check if compaction should be triggered
    let shouldCompact = false;
    let reason = "";

    // 1. Check token threshold
    if (currentTokens >= threshold) {
      shouldCompact = true;
      reason = `Token count ${currentTokens} exceeds threshold ${threshold}`;
    } else if (currentTokens < this.config.minTokens) {
      // v6.4.0 fix: report below-minimum even when threshold not exceeded
      reason = `Token count below minimum (${currentTokens} < ${this.config.minTokens})`;
    }

    // 2. Check session compaction limit (before cooldown — limit is a hard cap, v6.4.0)
    if (shouldCompact && state.compactionCount >= this.config.maxCompactionsPerSession) {
      shouldCompact = false;
      reason = `Session compaction limit reached (${state.compactionCount}/${this.config.maxCompactionsPerSession})`;
    }

    // 3. Check cooldown
    if (shouldCompact && state.lastCompactionTime !== null) {
      const elapsed = Date.now() - state.lastCompactionTime;
      if (elapsed < this.config.cooldownMs) {
        shouldCompact = false;
        reason = `Cooldown active (${Math.floor((this.config.cooldownMs - elapsed) / 1000)}s remaining)`;
      }
    }

    // 4. Check minimum tokens
    if (shouldCompact && currentTokens < this.config.minTokens) {
      shouldCompact = false;
      reason = `Token count below minimum (${currentTokens} < ${this.config.minTokens})`;
    }

    // Calculate target tokens (70% of threshold for safety margin)
    const targetTokens = shouldCompact
      ? Math.floor(threshold * 0.7)
      : currentTokens;

    // v6.6.0: efficiency checkpoint (pure observation — no decision impact)
    this.metrics.recordCheckpoint(sessionId, modelId, currentTokens, threshold, taskType);

    return {
      shouldCompact,
      reason,
      currentTokens,
      threshold,
      targetTokens,
      modelHint,
    };
  }

  /**
   * Record a compaction event
   * 
   * @param sessionId - Session identifier
   * @param tokensBefore - Token count before compaction
   * @param tokensAfter - Token count after compaction
   */
  recordCompaction(
    sessionId: string,
    tokensBefore: number,
    tokensAfter: number,
    // v6.6.0: optional observability inputs (no semantic change when omitted)
    targetTokens?: number,
    threshold?: number,
  ): void {
    // get-or-create: recording a compaction before any shouldCompact call
    // must still track state (v6.4.0 fix)
    let state = this.sessionStates.get(sessionId);
    if (!state) {
      state = { lastCompactionTime: null, compactionCount: 0, lastTokenCount: 0 };
      this.sessionStates.set(sessionId, state);
    }
    state.lastCompactionTime = Date.now();
    state.compactionCount++;
    state.lastTokenCount = tokensAfter;

    // v6.6.0: waste observation (pure observation — no decision impact)
    this.metrics.recordCompaction(sessionId, tokensBefore, tokensAfter, targetTokens, threshold);
  }

  /**
   * Reset session state
   * 
   * @param sessionId - Session identifier
   */
  resetSession(sessionId: string): void {
    this.sessionStates.delete(sessionId);
  }

  /**
   * Get session state
   * 
   * @param sessionId - Session identifier
   */
  getSessionState(sessionId: string): SessionState | undefined {
    return this.sessionStates.get(sessionId);
  }

  /**
   * Get token usage ratio
   * 
   * @param modelId - Model identifier
   * @param currentTokens - Current token count
   * @returns Usage ratio (0-1)
   */
  getUsageRatio(modelId: string, currentTokens: number): number {
    const hint = this.optimizer.getOptimizationHint(modelId);
    return currentTokens / hint.maxContextTokens;
  }

  /**
   * Get proactive compaction status summary
   * 
   * @param sessionId - Session identifier
   * @param modelId - Model identifier
   * @param currentTokens - Current token count
   */
  getStatusSummary(
    sessionId: string,
    modelId: string,
    currentTokens: number
  ): string {
    const recommendation = this.shouldCompact(sessionId, modelId, currentTokens);
    const state = this.sessionStates.get(sessionId);
    const usageRatio = this.getUsageRatio(modelId, currentTokens);

    const lines = [
      `Token Usage: ${currentTokens.toLocaleString()} / ${recommendation.modelHint?.maxContextTokens.toLocaleString()} (${Math.round(usageRatio * 100)}%)`,
      `Threshold: ${recommendation.threshold.toLocaleString()} tokens`,
      `Should Compact: ${recommendation.shouldCompact ? "YES" : "NO"}`,
      `Reason: ${recommendation.reason}`,
    ];

    if (state) {
      lines.push(`Session Compactions: ${state.compactionCount}/${this.config.maxCompactionsPerSession}`);
      if (state.lastCompactionTime) {
        const elapsed = Date.now() - state.lastCompactionTime;
        const cooldownRemaining = Math.max(0, this.config.cooldownMs - elapsed);
        lines.push(`Cooldown: ${cooldownRemaining > 0 ? `${Math.floor(cooldownRemaining / 1000)}s remaining` : "Ready"}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Clear all session states
   */
  clearAllSessions(): void {
    this.sessionStates.clear();
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<CompactionTriggerConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CompactionTriggerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Singleton instance
export const proactiveCompactionController = new ProactiveCompactionController();
