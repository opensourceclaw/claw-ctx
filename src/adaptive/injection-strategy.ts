/** v5.0.0-beta.3 — InjectionStrategy */
import type { TaskType } from "./task-type-detector.js";

export type StrategyMode = "aggressive" | "balanced" | "minimal" | "contextual";

export interface StrategyConfig {
  mode: StrategyMode;
  maxTokens: number;
  topK: number;
  includeMemory: boolean;
  includeGovernance: boolean;
  includeCI: boolean;
  includeCrossDomain: boolean;
}

const STRATEGY_MAP: Record<TaskType, StrategyConfig> = {
  coding:       { mode: "aggressive", maxTokens: 4000, topK: 15, includeMemory: true, includeGovernance: true, includeCI: false, includeCrossDomain: false },
  review:       { mode: "balanced", maxTokens: 3000, topK: 10, includeMemory: true, includeGovernance: true, includeCI: true, includeCrossDomain: true },
  debugging:    { mode: "contextual", maxTokens: 5000, topK: 20, includeMemory: true, includeGovernance: false, includeCI: true, includeCrossDomain: false },
  planning:     { mode: "aggressive", maxTokens: 4000, topK: 12, includeMemory: true, includeGovernance: true, includeCI: false, includeCrossDomain: true },
  question:     { mode: "minimal", maxTokens: 1500, topK: 5, includeMemory: true, includeGovernance: false, includeCI: false, includeCrossDomain: false },
  conversation: { mode: "balanced", maxTokens: 2000, topK: 8, includeMemory: true, includeGovernance: false, includeCI: false, includeCrossDomain: false },
  unknown:      { mode: "balanced", maxTokens: 2500, topK: 10, includeMemory: true, includeGovernance: false, includeCI: false, includeCrossDomain: false },
};

export function selectStrategy(taskType: TaskType): StrategyConfig {
  return STRATEGY_MAP[taskType] ?? STRATEGY_MAP.unknown;
}

export function adjustParameters(strategy: StrategyConfig, context: { budget?: number; urgency?: string }): StrategyConfig {
  let adjusted = strategy.maxTokens;
  if (context.budget) adjusted = Math.min(adjusted, context.budget);
  if (context.urgency === "high") adjusted = Math.min(adjusted * 1.5, 8000);
  return { ...strategy, maxTokens: adjusted };
}
