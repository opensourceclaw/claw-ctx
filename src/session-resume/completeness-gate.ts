/**
 * claw-ctx session-resume module — Completeness Gate
 *
 * Evaluates completeness scores from hybrid_search and recommends actions.
 *
 * v5.3.0: Initial implementation
 */

export interface CompletenessBreakdown {
  coverage: number;   // Keyword coverage ratio
  diversity: number;  // Result diversity score
  confidence: number; // Average relevance score
}

export interface CompletenessAssessment {
  score: number;                              // 0-1 overall score (may be 0 if unavailable)
  breakdown?: CompletenessBreakdown;
  isSufficient: boolean;                      // Meets threshold for direct use
  recommendation: "use" | "expand" | "max_expand";
}

export interface CompletenessGateConfig {
  /** Minimum score to consider evidence sufficient (default: 0.4) */
  threshold: number;
  /** Critical threshold below which maximum expansion is needed (default: 0.2) */
  criticalThreshold: number;
}

const DEFAULT_GATE_CONFIG: CompletenessGateConfig = {
  threshold: 0.4,
  criticalThreshold: 0.2,
};

export class CompletenessGate {
  private _config: CompletenessGateConfig;

  constructor(config?: Partial<CompletenessGateConfig>) {
    this._config = { ...DEFAULT_GATE_CONFIG, ...config };
  }

  /**
   * Evaluate completeness score and recommend action.
   *
   * @param completenessScore - Score from hybrid_search, may be undefined if unavailable
   * @param breakdown - Optional breakdown from hybrid_search metadata
   * @returns Assessment with recommendation
   */
  assess(
    completenessScore: number | undefined,
    breakdown?: CompletenessBreakdown
  ): CompletenessAssessment {
    // Edge case: undefined score (graceful degradation mode)
    // Treat as sufficient to avoid blocking when no score available
    if (completenessScore === undefined) {
      return {
        score: 0,
        breakdown,
        isSufficient: true,
        recommendation: "use",
      };
    }

    // Edge case: negative score (invalid, clamp to 0)
    const score = Math.max(0, completenessScore);

    // Edge case: score > 1.0 (invalid, clamp to 1.0)
    const normalizedScore = Math.min(1.0, score);

    // Determine recommendation based on thresholds
    if (normalizedScore >= this._config.threshold) {
      return {
        score: normalizedScore,
        breakdown,
        isSufficient: true,
        recommendation: "use",
      };
    }

    if (normalizedScore >= this._config.criticalThreshold) {
      return {
        score: normalizedScore,
        breakdown,
        isSufficient: false,
        recommendation: "expand",
      };
    }

    // score < criticalThreshold
    return {
      score: normalizedScore,
      breakdown,
      isSufficient: false,
      recommendation: "max_expand",
    };
  }

  /**
   * Update threshold configuration at runtime.
   */
  updateConfig(config: Partial<CompletenessGateConfig>): void {
    this._config = { ...this._config, ...config };
  }

  /**
   * Get current configuration.
   */
  getConfig(): CompletenessGateConfig {
    return { ...this._config };
  }
}
