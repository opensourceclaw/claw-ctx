/**
 * claw-ctx — Context Engine for OpenClaw
 *
 * Copyright 2026 OpenSourceClaw Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
