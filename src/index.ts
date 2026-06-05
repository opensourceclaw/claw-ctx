/**
 * claw-ctx v4.9.0 Plugin for OpenClaw
 * Standalone Context Engine with claw-mem integration,
 * C2 confidence gating, RL experience injection, governance signal pass-through,
 * and cross-domain signal injection.
 */
import { createClawContextEngine } from "./engine";

export { ConfidenceGate, type ConfidenceMode, type ConfidenceReport } from "./confidence_gate";
export { RLInjector, MockRLProvider, type RLExperience, type RLProvider } from "./rl_injector";
export { GovernanceInjector, MockGovernanceProvider, type GovernanceSignal, type GovernanceProvider, type GovernanceLayer } from "./governance_injector";
export { CrossDomainInjector, MockCrossDomainProvider, type InjectedSignal, type CrossDomainProvider } from "./cross_domain_injector";
export { CIInjector, MockCIProvider, type CISignal, type CIProvider } from "./ci_injector";
export { TokenBudgetManager, type BudgetAllocation, type BudgetConfig, type BudgetResult } from "./token_budget_manager";
export { TiktokenCounter, FallbackCounter, createTokenCounter, type TiktokenEncodingName, type TokenCounterResult, type BatchTokenResult, type TokenStats, type TokenBudget } from "./token-counter";
export { DriftDetector, TopicModel, DEFAULT_DRIFT_CONFIG, type Topic, type DriftAlert, type Action, type DriftConfig, type DriftReport } from "./drift-detector";
export { SmartBudgetAllocator, TaskTypeDetector, QualityBasedAdjuster, DEFAULT_BUDGET_CONFIG, TASK_BUDGET_PROFILES, type TaskType, type BudgetConfig as SmartBudgetAllocatorConfig, type BudgetAllocation as SmartBudgetAllocation, type AllocationHistory, type TaskBudgetProfile } from "./smart-budget-allocator";
export { SessionStateExtractor, type SessionState, type Entity, type Decision, type TopicTag } from "./session-state-extractor";
export { DriftBudgetLinker, DEFAULT_DRIFT_BUDGET_CONFIG, type DriftBudgetConfig, type BudgetAllocation as DriftBudgetAllocation } from "./drift-budget-linker";
export { LongTermDependencyTracker, type EntityMention, type DependencyChain, type GraphNode, type GraphEdge, type Graph } from "./long-term-dependency-tracker";

const plugin = {
  id: "claw-ctx",
  name: "Claw Context Engine",
  description: "Context Engine with C2 gating, RL injection, governance signals, cross-domain injection, and CI/CD signals for OpenClaw agents",
  version: "4.9.0",
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
      api.logger.info("[claw-ctx] v4.9.0 registered");
    } catch (e) {
      api.logger.warn("[claw-ctx] registration failed:", e);
    }
  },
};

export default plugin;
