/**
 * claw-ctx session-resume module — Context Quality Evaluator
 *
 * Orchestrates quality evaluation across 3 dimensions:
 * - Coverage: how well context covers query keywords
 * - Redundancy: how much duplicate/irrelevant content
 * - Freshness: how recent the context is
 *
 * v5.6.0: Initial implementation
 */

import type { HistoryEntry } from "./types.js";
import { CoverageEvaluator } from "./coverage-evaluator.js";
import { RedundancyEvaluator } from "./redundancy-evaluator.js";
import { FreshnessEvaluator } from "./freshness-evaluator.js";

/**
 * v5.6.0: Quality evaluator configuration.
 */
export interface QualityEvaluatorConfig {
  /** Weight for coverage dimension (default: 0.4) */
  coverageWeight: number;
  /** Weight for redundancy dimension (default: 0.35) */
  redundancyWeight: number;
  /** Weight for freshness dimension (default: 0.25) */
  freshnessWeight: number;
  /** Threshold for "good" quality (default: 0.7) */
  goodThreshold: number;
  /** Threshold for "acceptable" quality (default: 0.4) */
  acceptableThreshold: number;
  /** Half-life for freshness decay in hours (default: 24) */
  freshnessHalfLifeHours: number;
}

export const DEFAULT_QUALITY_CONFIG: QualityEvaluatorConfig = {
  coverageWeight: 0.4,
  redundancyWeight: 0.35,
  freshnessWeight: 0.25,
  goodThreshold: 0.7,
  acceptableThreshold: 0.4,
  freshnessHalfLifeHours: 24,
};

/**
 * v5.6.0: Context quality evaluation report.
 * Attached to AssemblyResult.quality.
 */
export interface ContextQualityReport {
  /** Overall quality score (weighted average) */
  overall: number;

  /** Dimension scores */
  dimensions: {
    /** Coverage: how well context covers query keywords */
    coverage: number;
    /** Redundancy: how much duplicate/irrelevant content */
    redundancy: number;
    /** Freshness: how recent the context is */
    freshness: number;
  };

  /** Quality assessment */
  assessment: "good" | "acceptable" | "poor";

  /** Evaluation metadata */
  metadata: {
    /** Time spent on evaluation (ms) */
    evalTimeMs: number;
    /** Number of entries evaluated */
    entryCount: number;
    /** Query keyword count (for coverage) */
    queryKeywordCount: number;
    /** Covered keyword count */
    coveredKeywordCount: number;
    /** Duplicate line count (for redundancy) */
    duplicateLineCount: number;
    /** Total line count */
    totalLineCount: number;
    /** v6.8.0: Rubric-role blocks participating in the evaluation */
    rubricCount: number;
  };
}

export class ContextQualityEvaluator {
  private _coverageEval: CoverageEvaluator;
  private _redundancyEval: RedundancyEvaluator;
  private _freshnessEval: FreshnessEvaluator;
  private _config: QualityEvaluatorConfig;

  constructor(config?: Partial<QualityEvaluatorConfig>) {
    this._config = { ...DEFAULT_QUALITY_CONFIG, ...config };
    this._coverageEval = new CoverageEvaluator();
    this._redundancyEval = new RedundancyEvaluator();
    this._freshnessEval = new FreshnessEvaluator(this._config.freshnessHalfLifeHours);
  }

  /**
   * Evaluate context quality.
   *
   * @param entries - History entries being injected
   * @param formatted - Formatted context string
   * @param query - Original user query (optional)
   * @param rubricBlocks - v6.8.0: rubric-role injection blocks (e.g. drift
   *   quality signals) participating in the evaluation; counted in metadata
   * @returns ContextQualityReport
   */
  evaluate(
    entries: HistoryEntry[],
    formatted: string,
    query?: string,
    rubricBlocks?: string[]
  ): ContextQualityReport {
    const startTime = Date.now();

    // Evaluate each dimension
    const coverage = this._coverageEval.evaluate(entries, formatted, query);
    const redundancy = this._redundancyEval.evaluate(entries, formatted);
    const freshness = this._freshnessEval.evaluate(entries);

    // Calculate overall score
    const overall =
      this._config.coverageWeight * coverage.score +
      this._config.redundancyWeight * redundancy.score +
      this._config.freshnessWeight * freshness.score;

    // Determine assessment
    const assessment = this._assess(overall);

    return {
      overall,
      dimensions: {
        coverage: coverage.score,
        redundancy: redundancy.score,
        freshness: freshness.score,
      },
      assessment,
      metadata: {
        evalTimeMs: Date.now() - startTime,
        entryCount: entries.length,
        queryKeywordCount: coverage.queryKeywordCount,
        coveredKeywordCount: coverage.coveredKeywordCount,
        duplicateLineCount: redundancy.duplicateLineCount,
        totalLineCount: redundancy.totalLineCount,
        rubricCount: rubricBlocks?.length ?? 0,
      },
    };
  }

  private _assess(score: number): "good" | "acceptable" | "poor" {
    if (score >= this._config.goodThreshold) return "good";
    if (score >= this._config.acceptableThreshold) return "acceptable";
    return "poor";
  }
}
