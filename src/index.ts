/**
 * claw-ctx — Context Engine for OpenClaw
 *
 * Copyright 2026 Peter Cheng
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
 * claw-ctx v5.9.2 Plugin for OpenClaw
 * Standalone Context Engine with claw-mem integration,
 * C2 confidence gating, RL experience injection, governance signal pass-through,
 * and cross-domain signal injection.
 */
import { VERSION } from "./version.js";
import { createClawContextEngine } from "./engine.js";
import { modelProfileRegistry } from "./model-profile.js";
import { ContextCapability } from "./capability/index.js";
import { Type } from "@sinclair/typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

// v5.17.0 Context Budget API
export { ContextBudgetManager, ContextTaskType } from "./context/ContextBudgetManager.js";
export type { ContextBudget, BudgetStatus } from "./context/ContextBudgetManager.js";
export { ContextTaskDetector } from "./detection/TaskTypeDetector.js";
export { loadContextBudgetConfig, DEFAULT_CONTEXT_BUDGET_CONFIG } from "./config/ContextBudgetConfig.js";
export type { ContextBudgetConfig } from "./config/ContextBudgetConfig.js";

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
// v5.10.0 Performance Optimization
export {
  TokenCountCache,
  BatchTokenCounter,
  getTokenCountCache,
  resetTokenCountCache,
  createBatchTokenCounter,
  type CacheEntry,
  type CacheStats,
  type BatchTokenResult as CachedBatchTokenResult,
} from "./token-count-cache.js";
export {
  ImportanceScorer,
  IncrementalCompressor,
  StreamingCompressor,
  getImportanceScorer,
  getIncrementalCompressor,
  resetScorerInstances,
  DEFAULT_SCORER_CONFIG,
  DEFAULT_INCREMENTAL_CONFIG,
  type ScorerConfig,
  type IncrementalConfig,
  type CompressionChunk,
} from "./importance-scorer.js";
export { SessionResumeManager, SummaryGenerator, HistoryLoader, DEFAULT_SESSION_RESUME_CONFIG, type SessionSummary, type SessionResumeConfig, type HistoryLoadResult } from "./session-resume/mod.js";
export { QualityEvaluator, type QualityEvaluationResult, type QualityDimensionResult, type QualityEvaluatorConfig, DEFAULT_QUALITY_EVALUATOR_CONFIG } from "./self-refinement/mod.js";
export type { ReasoningStrategy as ReasoningStrategyInterface } from "./self-refinement/reasoning-strategies/base.js";
export { ChainOfThoughtStrategy } from "./self-refinement/reasoning-strategies/chain-of-thought.js";
export { TreeOfThoughtsStrategy } from "./self-refinement/reasoning-strategies/tree-of-thoughts.js";
export { GraphOfThoughtsStrategy } from "./self-refinement/reasoning-strategies/graph-of-thoughts.js";
export { PromptStyleEngine, type PromptStyle, type StyleConfig, type StyleApplication, DEFAULT_STYLE_TEMPLATES, TASK_STYLE_MAP, resolveStyle } from "./prompt-style/index.js";
export { ContextPredictor, PredictionEngine, PreloadManager, type PredictedItem, type PredictionResult, type ContextHistory } from "./predictive/index.js";
export { VersionHistory, ChangePatternAnalyzer, type ContextItem, type ContextStrategy, type ContextSnapshot, type ModifiedItem, type ChangeReport } from "./evolution/index.js";

// v5.16.0 Model-aware context optimization
export {
  ModelProfileRegistry,
  BUILTIN_MODEL_PROFILES,
  modelProfileRegistry,
  type ModelProfile,
  type OptimizationStrategy,
} from "./model-profile.js";
export {
  ModelAwareOptimizer,
  modelAwareOptimizer,
  DEFAULT_STRATEGY_CONFIGS,
  type OptimizationHint,
  type StrategyConfig,
} from "./model-aware-optimizer.js";

// v5.16.1 Metrics collection
export {
  OptimizerMetricsCollector,
  optimizerMetricsCollector,
  type OptimizerMetrics,
  type StrategyUsageStat,
  type ModelCallStat,
  type PerformanceStat,
} from "./metrics/optimizer-metrics.js";

// v5.16.1 Observability (claw-obs integration)
export {
  OptimizerObserver,
  optimizerObserver,
  type IEventBus,
  type OptimizerEvents,
  type OptimizerEventName,
  type OptimizerEventData,
} from "./obs/optimizer-observer.js";

// v5.16.0 Proactive compaction controller
export {
  ProactiveCompactionController,
  proactiveCompactionController,
  DEFAULT_COMPACTION_TRIGGER_CONFIG,
  type CompactionTriggerConfig,
  type CompactionRecommendation,
} from "./proactive-compaction-controller.js";

// v5.16.0 CLI entry point (run via: claw-ctx <command>)
// CLI is available via bin entry in package.json

const plugin: ReturnType<typeof definePluginEntry> = definePluginEntry({
  id: "claw-ctx",
  name: "Claw Context Engine",
  description: "Context Engine with C2 gating, RL injection, governance signals, cross-domain injection, CI/CD signals, and self-refinement for OpenClaw agents",

  register(api: any) {
    const pluginConfig = (api as { pluginConfig?: Record<string, unknown> }).pluginConfig ?? {};
    const config: { workspaceDir?: string; topK: number; debug: boolean } = {
      workspaceDir: typeof pluginConfig.workspaceDir === "string" ? pluginConfig.workspaceDir : undefined,
      topK: typeof pluginConfig.topK === "number" ? (pluginConfig.topK as number) : 10,
      debug: pluginConfig.debug === true,
    };

    try {
      (api as any).registerContextEngine("claw-ctx", (_ctx: any) => {
        return createClawContextEngine(config as any, api.logger);
      });
      api.logger.info(`[claw-ctx] v${VERSION} registered`);
    } catch (e) {
      api.logger.warn("[claw-ctx] registration failed:", e);
    }

    // v6.5.1: register contract tools — names must match openclaw.plugin.json
    // contracts.tools exactly. Implements the real ContextCapability API.
    if (typeof (api as any).registerTool === "function") {
      const capability = new ContextCapability();

      (api as any).registerTool({
        name: "ctx_compact",
        description: "Manually trigger context compaction for a session",
        parameters: Type.Object({
          sessionId: Type.String({ description: "Target session ID" }),
          strategy: Type.Optional(Type.Union([Type.Literal("aggressive"), Type.Literal("balanced"), Type.Literal("conservative")], { description: "Compaction strategy" })),
          threshold: Type.Optional(Type.Number({ description: "Target token budget (context window size in tokens)" })),
          force: Type.Optional(Type.Boolean({ description: "Force compaction" })),
        }),
        async execute(_toolCallId: string, params: { sessionId: string; strategy?: "aggressive" | "balanced" | "conservative"; threshold?: number; force?: boolean }) {
          const result = await capability.compact({
            sessionId: params.sessionId,
            strategy: params.strategy ?? "balanced",
            targetBudget: params.threshold,
            force: params.force ?? false,
          });
          return result;
        },
      });

      (api as any).registerTool({
        name: "ctx_build",
        description: "Assemble context according to configuration",
        parameters: Type.Object({
          sessionId: Type.String({ description: "Target session ID" }),
          budget: Type.Optional(Type.Number({ description: "Token budget" })),
          model: Type.Optional(Type.String({ description: "Target model" })),
        }),
        async execute(_toolCallId: string, params: { sessionId: string; budget?: number; model?: string }) {
          const result = await capability.assemble({
            sessionId: params.sessionId,
            tokenBudget: params.budget,
            model: params.model,
          });
          return {
            estimatedTokens: result.estimatedTokens,
            messageCount: result.messages.length,
            confidenceReport: result.confidenceReport,
            autoCompact: result.autoCompact,
            // v6.8.0: Role-aware injection reports (new fields, non-breaking)
            ...(result.roleConflicts !== undefined ? { roleConflicts: result.roleConflicts } : {}),
            ...(result.roleBreakdown !== undefined ? { roleBreakdown: result.roleBreakdown } : {}),
          };
        },
      });

      (api as any).registerTool({
        name: "ctx_inject",
        description: "Inject content into a target session context",
        parameters: Type.Object({
          targetSessionId: Type.String({ description: "Target session ID" }),
          content: Type.String({ description: "Content to inject" }),
          position: Type.Optional(Type.Union([Type.Literal("prepend"), Type.Literal("append"), Type.Literal("replace")], { description: "Injection position" })),
        }),
        async execute(_toolCallId: string, params: { targetSessionId: string; content: string; position?: "prepend" | "append" | "replace" }) {
          const result = await capability.inject({
            targetSessionId: params.targetSessionId,
            content: params.content,
            position: params.position ?? "append",
          });
          return result;
        },
      });
    }
  },
});

// v5.16.5 Model Config Sync API
export interface ModelConfig {
  contextWindow: number;
  compressionThreshold: number;
  effectiveWindowRatio: number;
  proactiveThreshold: number;
}

export function getModelConfigs(): Record<string, ModelConfig> {
  const configs: Record<string, ModelConfig> = {};
  for (const id of modelProfileRegistry.getAllIds()) {
    const profile = modelProfileRegistry.get(id);
    if (!profile) continue;
    configs[profile.id] = {
      contextWindow: profile.context.maxTokens,
      compressionThreshold: profile.optimization.compressionThreshold,
      effectiveWindowRatio: profile.context.effectiveWindowRatio,
      proactiveThreshold: Math.floor(profile.context.maxTokens * 0.75),
    };
  }
  return configs;
}

// v6.0.0: Capability Layer
export { ContextCapability } from "./capability/index.js";
export type {
  IContextCapability,
  BootstrapParams, BootstrapResult,
  IngestParams,
  AssembleParams, AssembleResult,
  CompactParams, CompactResult,
  InjectParams, InjectResult,
} from "./capability/index.js";

// v6.5.0: MECW
export { MecwEstimator, DEFAULT_COMPLEXITY_FACTORS } from "./mecw/index.js";
export type { MecwEstimate } from "./mecw/index.js";

// v6.6.0: Context Efficiency Metrics (pure observability)
export { ContextEfficiencyMetrics, contextEfficiencyMetrics } from "./efficiency/index.js";
export type { EfficiencyMetric, WasteMetric, EfficiencyReport } from "./efficiency/index.js";

export default plugin;
