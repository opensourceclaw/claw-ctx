/**
 * claw-ctx v5.17.0 — Context Budget Configuration
 */

import { ContextTaskType, type ContextBudget } from "../context/ContextBudgetManager.js";

export interface ContextBudgetConfig {
  enabled: boolean;
  taskTypes: Record<ContextTaskType, Partial<ContextBudget>>;
  detection: {
    method: "keyword" | "ml" | "hybrid";
    fallbackTaskType: ContextTaskType;
  };
}

export const DEFAULT_CONTEXT_BUDGET_CONFIG: ContextBudgetConfig = {
  enabled: true,
  taskTypes: {
    [ContextTaskType.SIMPLE_LOOKUP]:     { maxTokens: 10000 },
    [ContextTaskType.MULTI_LOOKUP]:      { maxTokens: 5000 },
    [ContextTaskType.SUMMARIZATION]:     { maxTokens: 3000 },
    [ContextTaskType.COMPLEX_REASONING]: { maxTokens: 2000 },
  },
  detection: {
    method: "keyword",
    fallbackTaskType: ContextTaskType.SIMPLE_LOOKUP,
  },
};

export function loadContextBudgetConfig(overrides?: Partial<ContextBudgetConfig>): ContextBudgetConfig {
  return { ...DEFAULT_CONTEXT_BUDGET_CONFIG, ...overrides };
}
