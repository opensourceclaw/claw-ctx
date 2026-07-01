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
 * claw-ctx session-resume module — Entry Point
 *
 * v1.0.0: Initial implementation
 * v5.1.0: Added CheckpointManager
 */

export type {
  SessionSummary,
  SessionResumeConfig,
  SessionSnapshot,
  CheckpointConfig,
  HistoryEntry,
  HistoryLoadResult,
  CompletenessReport,
  BucketLevel,
  HierarchicalHistory,
} from "./types.js";
export { DEFAULT_SESSION_RESUME_CONFIG } from "./types.js";
export { SummaryGenerator } from "./summary-generator.js";
export { HistoryLoader } from "./history-loader.js";
export { SessionResumeManager } from "./bootstrap.js";
export { CheckpointManager } from "./checkpoint.js";
// v5.3.0: Completeness gate and adaptive expansion
export {
  CompletenessGate,
  type CompletenessAssessment,
  type CompletenessBreakdown,
  type CompletenessGateConfig,
} from "./completeness-gate.js";
export {
  AdaptiveExpansion,
  type ExpansionParams,
  type ExpansionResult,
  type AdaptiveExpansionConfig,
} from "./adaptive-expansion.js";
// v5.4.0: Hierarchical loader
export {
  TimeBucket,
  type BucketResult,
  type TimeBucketConfig,
  DEFAULT_TIME_BUCKET_CONFIG,
} from "./time-bucket.js";
export {
  BucketConsolidator,
  type ConsolidatedLevel,
  type ConsolidationResult,
  type BucketConsolidatorConfig,
  DEFAULT_CONSOLIDATOR_CONFIG,
} from "./bucket-consolidator.js";
export {
  HierarchicalLoader,
  type HierarchicalLoaderConfig,
} from "./hierarchical-loader.js";
// v5.5.0: Adaptive Context Assembler
export {
  type AssemblyStrategyType,
  type AssemblyParams,
  type ContextStrategy,
  STRATEGY_DEFINITIONS,
  getStrategy,
} from "./context-strategy.js";
export { StrategyRouter } from "./strategy-router.js";
export {
  ContextAssembler,
  type AssemblyResult as ContextAssemblyResult,
  type ContextAssemblerConfig,
} from "./context-assembler.js";
// v5.6.0: Context Quality Evaluator
export {
  ContextQualityEvaluator,
  type ContextQualityReport,
  type QualityEvaluatorConfig,
  DEFAULT_QUALITY_CONFIG,
} from "./context-quality-evaluator.js";
export { CoverageEvaluator, type CoverageResult } from "./coverage-evaluator.js";
export { RedundancyEvaluator, type RedundancyResult } from "./redundancy-evaluator.js";
export { FreshnessEvaluator, type FreshnessResult } from "./freshness-evaluator.js";
