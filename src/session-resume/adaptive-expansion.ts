/**
 * claw-ctx session-resume module — Adaptive Expansion
 *
 * Computes expanded search parameters when completeness is insufficient.
 * Maximum 2 rounds of expansion to prevent runaway searches.
 *
 * v5.3.0: Initial implementation
 */

import type { CompletenessAssessment } from "./completeness-gate.js";

export interface ExpansionParams {
  topK: number;
  maxAgeHours: number;
}

export interface ExpansionResult {
  params: ExpansionParams;
  round: number;        // 1 or 2
  isExhausted: boolean; // true after round 2 (no more expansion possible)
}

export interface AdaptiveExpansionConfig {
  /** Maximum multiplier for topK (default: 3) */
  maxTopKMultiplier: number;
  /** Maximum age in hours for expanded search (default: 168 = 1 week) */
  maxAgeHours: number;
}

const DEFAULT_EXPANSION_CONFIG: AdaptiveExpansionConfig = {
  maxTopKMultiplier: 3,
  maxAgeHours: 168,
};

export class AdaptiveExpansion {
  private _config: AdaptiveExpansionConfig;
  private _currentRound: number = 0;
  private _originalParams: ExpansionParams | null = null;

  constructor(config?: Partial<AdaptiveExpansionConfig>) {
    this._config = { ...DEFAULT_EXPANSION_CONFIG, ...config };
  }

  /**
   * Compute expanded search parameters based on assessment.
   *
   * @param originalTopK - Original topK value
   * @param originalMaxAge - Original maxAgeHours value
   * @param assessment - Completeness assessment from gate
   * @returns Expanded parameters or exhaustion indicator
   */
  expand(
    originalTopK: number,
    originalMaxAge: number,
    assessment: CompletenessAssessment
  ): ExpansionResult {
    // Store original params on first call
    if (this._originalParams === null) {
      this._originalParams = { topK: originalTopK, maxAgeHours: originalMaxAge };
    }

    // Check if already exhausted
    if (this._currentRound >= 2) {
      return {
        params: this._getMaxParams(),
        round: 2,
        isExhausted: true,
      };
    }

    // Determine expansion level based on assessment
    if (assessment.recommendation === "max_expand") {
      // Jump to max immediately
      this._currentRound = 2;
      return {
        params: this._getMaxParams(),
        round: 2,
        isExhausted: true,
      };
    }

    // "expand" recommendation - do progressive expansion
    this._currentRound++;

    if (this._currentRound === 1) {
      // Round 1: Double topK, keep same time window
      return {
        params: {
          topK: Math.min(originalTopK * 2, this._originalParams.topK * this._config.maxTopKMultiplier),
          maxAgeHours: originalMaxAge,
        },
        round: 1,
        isExhausted: false,
      };
    }

    // Round 2: Triple topK, expand time window
    return {
      params: this._getMaxParams(),
      round: 2,
      isExhausted: true,
    };
  }

  /**
   * Reset internal state for a new load cycle.
   * Must be called before each new HistoryLoader.load() call.
   */
  reset(): void {
    this._currentRound = 0;
    this._originalParams = null;
  }

  /**
   * Get current round number (0, 1, or 2).
   */
  getCurrentRound(): number {
    return this._currentRound;
  }

  /**
   * Check if expansion is exhausted.
   */
  isExhausted(): boolean {
    return this._currentRound >= 2;
  }

  /**
   * Compute maximum expansion parameters.
   */
  private _getMaxParams(): ExpansionParams {
    return {
      topK: this._originalParams!.topK * this._config.maxTopKMultiplier,
      maxAgeHours: this._config.maxAgeHours,
    };
  }
}