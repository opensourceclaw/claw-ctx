/**
 * claw-ctx v4.24.0 — Self-Refinement Module Types
 */

export interface QualityDimensionResult {
  name: string;
  score: number;
  weight: number;
  issues: string[];
  suggestions: string[];
}

export interface QualityEvaluationResult {
  dimensions: QualityDimensionResult[];
  overallScore: number;
  passed: boolean;
  issues: string[];
  suggestions: string[];
}

export interface QualityEvaluatorConfig {
  completenessWeight: number;
  accuracyWeight: number;
  consistencyWeight: number;
  readabilityWeight: number;
  qualityThreshold: number;
}

export const DEFAULT_QUALITY_EVALUATOR_CONFIG: QualityEvaluatorConfig = {
  completenessWeight: 0.25,
  accuracyWeight: 0.30,
  consistencyWeight: 0.25,
  readabilityWeight: 0.20,
  qualityThreshold: 0.7,
};
