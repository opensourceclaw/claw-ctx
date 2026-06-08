// Copyright 2026 Peter Cheng
// Licensed under the Apache License, Version 2.0

/**
 * DriftBudgetLinker — connects DriftDetector and SmartBudgetAllocator for claw-ctx v4.6.0.
 *
 * When drift exceeds threshold, reallocates budget:
 * - buffer ↑ (more room for context refresh)
 * - baseContext ↓ (less budget for potentially stale context)
 * - total stays constant
 */

import type { DriftDetector } from "./drift-detector.js";
import type { BudgetAllocation as SmartBudgetAllocation } from "./smart-budget-allocator.js";

// ── Types ─────────────────────────────────────────────────────────────────

export interface DriftBudgetConfig {
  driftThreshold: number;
  bufferIncreaseRatio: number;
  enabled: boolean;
}

export const DEFAULT_DRIFT_BUDGET_CONFIG: DriftBudgetConfig = {
  driftThreshold: 0.5,
  bufferIncreaseRatio: 1.5,
  enabled: true,
};

/** Output allocation after drift adjustment. */
export interface BudgetAllocation {
  baseContext: number;
  crossDomain: number;
  ci: number;
  buffer: number;
  total: number;
  driftAdjusted: boolean;
  driftScore: number;
}

// ── DriftBudgetLinker ─────────────────────────────────────────────────────

export class DriftBudgetLinker {
  private driftDetector: DriftDetector;
  private config: DriftBudgetConfig;

  constructor(driftDetector: DriftDetector, config?: Partial<DriftBudgetConfig>) {
    this.driftDetector = driftDetector;
    this.config = { ...DEFAULT_DRIFT_BUDGET_CONFIG, ...config };
  }

  /**
   * Adjust a budget allocation based on current drift.
   * Accepts the allocator's current BudgetAllocation as input.
   */
  adjustBudget(
    currentAlloc: SmartBudgetAllocation,
    driftScore?: number,
  ): BudgetAllocation {
    const score = driftScore ?? this.driftDetector.getDriftScore();

    const current: BudgetAllocation = {
      baseContext: (currentAlloc as any).baseContext ?? 0,
      crossDomain: (currentAlloc as any).crossDomain ?? 0,
      ci: (currentAlloc as any).ci ?? 0,
      buffer: (currentAlloc as any).buffer ?? 0,
      total: (currentAlloc as any).totalBudget ?? (currentAlloc as any).total ?? 10000,
      driftAdjusted: false,
      driftScore: score,
    };

    if (!this.config.enabled || score <= this.config.driftThreshold) {
      return current;
    }

    const bufferIncrease = current.buffer * (this.config.bufferIncreaseRatio - 1);
    const adjustedBuffer = Math.min(current.total * 0.4, current.buffer + bufferIncrease);
    const actualIncrease = adjustedBuffer - current.buffer;
    const adjustedBase = Math.max(current.total * 0.2, current.baseContext - actualIncrease);

    return {
      baseContext: Math.round(adjustedBase),
      crossDomain: current.crossDomain,
      ci: current.ci,
      buffer: Math.round(adjustedBuffer),
      total: current.total,
      driftAdjusted: true,
      driftScore: score,
    };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  shouldAdjust(): boolean {
    if (!this.config.enabled) return false;
    return this.driftDetector.getDriftScore() > this.config.driftThreshold;
  }

  updateConfig(config: Partial<DriftBudgetConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): DriftBudgetConfig {
    return { ...this.config };
  }
}
