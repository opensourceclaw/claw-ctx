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
 * claw-ctx v4.22.0 Plugin for OpenClaw
 * Standalone Context Engine with claw-mem integration,
 * C2 confidence gating, RL experience injection, governance signal pass-through,
 * and cross-domain signal injection.
 */
import { createClawContextEngine } from "./engine.js";

export { ConfidenceGate, type ConfidenceMode, type ConfidenceReport } from "./confidence_gate.js";
export { RLInjector, MockRLProvider, type RLExperience, type RLProvider } from "./rl_injector.js";
export { GovernanceInjector, MockGovernanceProvider, type GovernanceSignal, type GovernanceProvider, type GovernanceLayer } from "./governance_injector.js";
export { CrossDomainInjector, MockCrossDomainProvider, type InjectedSignal, type CrossDomainProvider } from "./cross_domain_injector.js";
export { CIInjector, MockCIProvider, type CISignal, type CIProvider } from "./ci_injector.js";
export { TokenBudgetManager, type BudgetAllocation, type BudgetConfig, type BudgetResult } from "./token_budget_manager.js";
export { TiktokenCounter, FallbackCounter, createTokenCounter, type TiktokenEncodingName, type TokenCounterResult, type BatchTokenResult, type TokenStats, type TokenBudget } from "./token-counter.js";
export { DriftDetector, TopicModel, DEFAULT_DRIFT_CONFIG, type Topic, type DriftAlert, type Action, type DriftConfig, type DriftReport } from "./drift-detector.js";
export { SmartBudgetAllocator, TaskTypeDetector, QualityBasedAdjuster, DEFAULT_BUDGET_CONFIG, TASK_BUDGET_PROFILES, type TaskType, type BudgetConfig as SmartBudgetAllocatorConfig, type BudgetAllocation as SmartBudgetAllocation, type AllocationHistory, type TaskBudgetProfile } from "./smart-budget-allocator.js";
export { SessionStateExtractor, type SessionState, type Entity, type Decision, type TopicTag } from "./session-state-extractor.js";
export { LongTermDependencyTracker, type EntityMention, type DependencyChain, type GraphNode, type GraphEdge, type Graph } from "./long-term-dependency-tracker.js";
export { SelfRefiner, type SelfRefinerConfig, type EvaluationResult, type SelfRefinementResult, DEFAULT_SELF_REFINER_CONFIG } from "./self_refiner.js";
export { PromptStrategyController, type ReasoningStrategy, type PromptStrategyConfig, DEFAULT_STRATEGY_CONFIG } from "./prompt_strategy_controller.js";
export { PositionOptimizer, type PositionOptimizerConfig, type KeyInfo, DEFAULT_POSITION_CONFIG } from "./position_optimizer.js";
export { StructuredContextHandler, type StructuredDataType, type StructuredDataConfig, type QueryResult, type Relation, DEFAULT_STRUCTURED_CONFIG } from "./structured_context_handler.js";
export { MultimodalContextHandler, type MultimodalContent, type MultimodalConfig, type ModalType, DEFAULT_MULTIMODAL_CONFIG } from "./multimodal_context_handler.js";
export { AutoCompactController, DEFAULT_AUTO_COMPACT_CONFIG, type AutoCompactConfig } from "./auto-compact.js";
export { AutoSessionController, DEFAULT_AUTO_SESSION_CONFIG, type AutoSessionConfig } from "./auto-session.js";
export { SemanticCompressor, type MessageImportance, type CompressionResult } from "./semantic-compressor.js";
export { SessionResumeManager, SummaryGenerator, HistoryLoader, DEFAULT_SESSION_RESUME_CONFIG, type SessionSummary, type SessionResumeConfig, type HistoryLoadResult } from "./session-resume/mod.js";
export { QualityEvaluator, type QualityEvaluationResult, type QualityDimensionResult, type QualityEvaluatorConfig, DEFAULT_QUALITY_EVALUATOR_CONFIG } from "./self-refinement/mod.js";
export type { ReasoningStrategy as ReasoningStrategyInterface } from "./self-refinement/reasoning-strategies/base.js";
export { ChainOfThoughtStrategy } from "./self-refinement/reasoning-strategies/chain-of-thought.js";
export { TreeOfThoughtsStrategy } from "./self-refinement/reasoning-strategies/tree-of-thoughts.js";
export { GraphOfThoughtsStrategy } from "./self-refinement/reasoning-strategies/graph-of-thoughts.js";

const plugin = {
  id: "claw-ctx",
  name: "Claw Context Engine",
  description: "Context Engine with C2 gating, RL injection, governance signals, cross-domain injection, CI/CD signals, and self-refinement for OpenClaw agents",
  version: "4.26.0",
  kind: "context-engine",

  register(api: any) {
    const config = {
      workspaceDir: api.pluginConfig?.workspaceDir || api.config?.workspaceDir,
      topK: api.pluginConfig?.topK ?? 10,
      debug: api.pluginConfig?.debug ?? false,
    };

    try {
      (api as any).registerContextEngine("claw-ctx", (_ctx: any) => {
        return createClawContextEngine(config, api.logger);
      });
      api.logger.info("[claw-ctx] v4.26.0 registered");
    } catch (e) {
      api.logger.warn("[claw-ctx] registration failed:", e);
    }
  },
};

export default plugin;
