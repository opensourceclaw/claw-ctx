/**
 * claw-ctx v2.0.0 — C2 Confidence Gate
 *
 * Provides confidence scoring and gating for context assembly.
 * Modes: strict | adaptive | disabled
 */
export type ConfidenceMode = "strict" | "adaptive" | "disabled";

export interface ConfidenceGateConfig {
  /** Confidence threshold (0.0–1.0), default 0.5 */
  threshold?: number;
  /** Gating mode, default "adaptive" */
  mode?: ConfidenceMode;
  /** Minimum items to keep regardless of confidence */
  minItems?: number;
  /** Adaptive pressure: how much the threshold relaxes when few items pass */
  adaptivePressure?: number;
}

export interface ConfidenceResult {
  score: number;
  passed: boolean;
  adjustedThreshold?: number;
}

export interface ConfidenceReport {
  totalItems: number;
  passedItems: number;
  avgConfidence: number;
  threshold: number;
  mode: ConfidenceMode;
}

export class ConfidenceGate {
  private threshold: number;
  private mode: ConfidenceMode;
  private minItems: number;
  private adaptivePressure: number;

  constructor(config: ConfidenceGateConfig = {}) {
    this.threshold = config.threshold ?? 0.5;
    this.mode = config.mode ?? "adaptive";
    this.minItems = config.minItems ?? 0;
    this.adaptivePressure = config.adaptivePressure ?? 0.3;
  }

  /**
   * Evaluate a single item's confidence score against the current threshold.
   */
  evaluate(score: number): ConfidenceResult {
    if (this.mode === "disabled") {
      return { score, passed: true };
    }
    return {
      score,
      passed: score >= this.threshold,
    };
  }

  /**
   * Apply gating to a list of scored items.
   * Returns the filtered list and a confidence report.
   */
  gate(items: Array<{ content: string; score: number }>): {
    passed: Array<{ content: string; score: number }>;
    report: ConfidenceReport;
  } {
    if (this.mode === "disabled") {
      return {
        passed: items,
        report: {
          totalItems: items.length,
          passedItems: items.length,
          avgConfidence: items.length > 0
            ? items.reduce((s, i) => s + i.score, 0) / items.length
            : 0,
          threshold: 0,
          mode: "disabled",
        },
      };
    }

    let effectiveThreshold = this.threshold;

    if (this.mode === "adaptive") {
      effectiveThreshold = this.computeAdaptiveThreshold(items);
    }

    const passed = items.filter((item) => item.score >= effectiveThreshold);

    // Ensure minimum items
    if (passed.length < this.minItems && items.length > 0) {
      const remaining = items
        .filter((item) => item.score < effectiveThreshold)
        .sort((a, b) => b.score - a.score);
      const needed = this.minItems - passed.length;
      passed.push(...remaining.slice(0, needed));
    }

    const report: ConfidenceReport = {
      totalItems: items.length,
      passedItems: passed.length,
      avgConfidence: items.length > 0
        ? items.reduce((s, i) => s + i.score, 0) / items.length
        : 0,
      threshold: this.mode === "strict" ? this.threshold : effectiveThreshold,
      mode: this.mode,
    };

    return { passed, report };
  }

  /**
   * Dynamic threshold adjustment for adaptive mode.
   * Relaxes threshold when items cluster below it, tightens when many exceed it.
   */
  private computeAdaptiveThreshold(items: Array<{ score: number }>): number {
    if (items.length === 0) return this.threshold;

    const scores = items.map((i) => i.score);
    const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
    const std = Math.sqrt(
      scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length
    );

    // Relax threshold when mean is low relative to threshold
    const gap = this.threshold - mean;
    const adjustment = gap > 0 ? gap * this.adaptivePressure : 0;

    // Also consider variance: high variance → slightly stricter
    const varianceAdjustment = Math.min(std * 0.1, 0.05);

    const adjusted = Math.max(0, Math.min(1, this.threshold - adjustment + varianceAdjustment));

    // Round to 2 decimal places
    return Math.round(adjusted * 100) / 100;
  }

  /** Update threshold at runtime */
  setThreshold(t: number): void {
    this.threshold = Math.max(0, Math.min(1, t));
  }

  /** Update mode at runtime */
  setMode(m: ConfidenceMode): void {
    this.mode = m;
  }

  /** Get current config */
  getConfig(): Required<ConfidenceGateConfig> {
    return {
      threshold: this.threshold,
      mode: this.mode,
      minItems: this.minItems,
      adaptivePressure: this.adaptivePressure,
    };
  }
}
