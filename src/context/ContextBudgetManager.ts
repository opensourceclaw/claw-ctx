/**
 * claw-ctx v5.17.0 — Context Budget Manager
 * Manages context window budgets based on task type (MECW research).
 */

export enum ContextTaskType {
  SIMPLE_LOOKUP = "simple_lookup",
  MULTI_LOOKUP = "multi_lookup",
  SUMMARIZATION = "summarization",
  COMPLEX_REASONING = "complex_reasoning",
}

export interface ContextBudget {
  taskType: ContextTaskType;
  maxTokens: number;
  warningThreshold: number;  // ratio 0-1
}

export interface BudgetStatus {
  withinBudget: boolean;
  currentTokens: number;
  maxTokens: number;
  usageRatio: number;
  warning: boolean;
  taskType: ContextTaskType;
}

const DEFAULT_BUDGETS: Record<ContextTaskType, ContextBudget> = {
  [ContextTaskType.SIMPLE_LOOKUP]:     { taskType: ContextTaskType.SIMPLE_LOOKUP,     maxTokens: 10000, warningThreshold: 0.8 },
  [ContextTaskType.MULTI_LOOKUP]:      { taskType: ContextTaskType.MULTI_LOOKUP,      maxTokens: 5000,  warningThreshold: 0.8 },
  [ContextTaskType.SUMMARIZATION]:     { taskType: ContextTaskType.SUMMARIZATION,     maxTokens: 3000,  warningThreshold: 0.8 },
  [ContextTaskType.COMPLEX_REASONING]: { taskType: ContextTaskType.COMPLEX_REASONING, maxTokens: 2000,  warningThreshold: 0.8 },
};

export class ContextBudgetManager {
  private budgets: Map<ContextTaskType, ContextBudget> = new Map();

  constructor() {
    for (const [type, budget] of Object.entries(DEFAULT_BUDGETS)) {
      this.budgets.set(type as ContextTaskType, { ...budget });
    }
  }

  getBudget(taskType: ContextTaskType): ContextBudget {
    return this.budgets.get(taskType) || DEFAULT_BUDGETS[ContextTaskType.SIMPLE_LOOKUP];
  }

  setCustomBudget(taskType: ContextTaskType, maxTokens: number, warningThreshold?: number): void {
    this.budgets.set(taskType, {
      taskType,
      maxTokens,
      warningThreshold: warningThreshold ?? 0.8,
    });
  }

  checkBudgetUsage(taskType: ContextTaskType, currentTokens: number): BudgetStatus {
    const budget = this.getBudget(taskType);
    const usageRatio = budget.maxTokens > 0 ? currentTokens / budget.maxTokens : 1;
    return {
      withinBudget: currentTokens <= budget.maxTokens,
      currentTokens,
      maxTokens: budget.maxTokens,
      usageRatio,
      warning: usageRatio >= budget.warningThreshold,
      taskType,
    };
  }

  getAllBudgets(): ContextBudget[] {
    return Array.from(this.budgets.values());
  }
}
