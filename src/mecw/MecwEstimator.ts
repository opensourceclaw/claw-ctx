/**
 * claw-ctx v6.5.0 — MECW Estimator
 * MECW = maxContextTokens × effectiveWindowRatio × complexityFactor(taskType)
 */

import { ModelAwareOptimizer } from "../model-aware-optimizer.js";
import { ContextTaskType } from "../context/ContextBudgetManager.js";

export interface MecwEstimate {
  modelId: string;
  taskType: ContextTaskType;
  maxContextTokens: number;
  effectiveWindowRatio: number;
  complexityFactor: number;
  mecwTokens: number;
}

export const DEFAULT_COMPLEXITY_FACTORS: Record<ContextTaskType, number> = {
  [ContextTaskType.SIMPLE_LOOKUP]: 1.0,
  [ContextTaskType.MULTI_LOOKUP]: 0.8,
  [ContextTaskType.SUMMARIZATION]: 0.7,
  [ContextTaskType.COMPLEX_REASONING]: 0.6,
};

export class MecwEstimator {
  private optimizer: ModelAwareOptimizer;
  private factors: Record<ContextTaskType, number>;

  constructor(optimizer?: ModelAwareOptimizer, factors?: Partial<Record<ContextTaskType, number>>) {
    this.optimizer = optimizer ?? new ModelAwareOptimizer();
    this.factors = { ...DEFAULT_COMPLEXITY_FACTORS, ...factors };
  }

  estimateMecw(modelId: string, taskType: ContextTaskType): MecwEstimate {
    const hint = this.optimizer.getOptimizationHint(modelId);
    const maxContextTokens = hint.maxContextTokens ?? 128000;
    const effectiveWindowRatio = hint.effectiveWindowRatio ?? 0.8;
    const complexityFactor = this.getComplexityFactor(taskType);
    const mecwTokens = Math.floor(maxContextTokens * effectiveWindowRatio * complexityFactor);
    return { modelId, taskType, maxContextTokens, effectiveWindowRatio, complexityFactor, mecwTokens };
  }

  getComplexityFactor(taskType: ContextTaskType): number {
    return this.factors[taskType] ?? 0.6; // unknown → conservative (complex reasoning)
  }

  getFactors(): Readonly<Record<ContextTaskType, number>> {
    return Object.freeze({ ...this.factors });
  }
}
