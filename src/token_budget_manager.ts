/**
 * claw-ctx v4.0.0 — Token Budget Manager
 *
 * Manages token budget allocation across context categories.
 * v3.0.0: Base + CrossDomain + Buffer
 * v4.0.0: adds CI/CD signal budget
 */

export interface BudgetAllocation {
  /** Total available token budget */
  total: number;
  /** Base context (memories, system prompt) */
  baseContext: number;
  /** Cross-domain signals */
  crossDomainSignals: number;
  /** CI/CD signals */
  ciSignals: number;
  /** Buffer / margin */
  buffer: number;
}

export interface BudgetConfig {
  totalBudget?: number;
  baseContextPct?: number;
  crossDomainPct?: number;
  ciPct?: number;
  bufferPct?: number;
  minBaseContext?: number;
  maxCrossDomain?: number;
  maxCI?: number;
}

export interface BudgetResult {
  allocation: BudgetAllocation;
  effectiveBaseBudget: number;
  crossDomainBudget: number;
  ciBudget: number;
}

export class TokenBudgetManager {
  private config: Required<BudgetConfig>;

  // Default budget percentages (v4.0.0: 60/10/10/20)
  private static readonly DEFAULTS: Required<BudgetConfig> = {
    totalBudget: 8000,
    baseContextPct: 60,
    crossDomainPct: 10,
    ciPct: 10,
    bufferPct: 20,
    minBaseContext: 1000,
    maxCrossDomain: 2000,
    maxCI: 2000,
  };

  constructor(config: BudgetConfig = {}) {
    this.config = { ...TokenBudgetManager.DEFAULTS, ...config };

    // Validate percentages sum to 100
    const sum = this.config.baseContextPct + this.config.crossDomainPct + this.config.ciPct + this.config.bufferPct;
    if (Math.abs(sum - 100) > 0.1) {
      throw new Error(
        `Budget percentages must sum to 100, got: base=${this.config.baseContextPct} + cross=${this.config.crossDomainPct} + ci=${this.config.ciPct} + buffer=${this.config.bufferPct} = ${sum}`
      );
    }
  }

  /**
   * Calculate budget allocation based on total budget and percentages.
   */
  calculate(totalBudget?: number): BudgetResult {
    const total = totalBudget ?? this.config.totalBudget;

    let baseContext = Math.floor((total * this.config.baseContextPct) / 100);
    let crossDomain = Math.floor((total * this.config.crossDomainPct) / 100);
    let ciSignals = Math.floor((total * this.config.ciPct) / 100);
    let buffer = total - baseContext - crossDomain - ciSignals;

    // Enforce minimums and maximums
    if (baseContext < this.config.minBaseContext && total >= this.config.minBaseContext) {
      baseContext = this.config.minBaseContext;
      crossDomain = Math.min(this.config.maxCrossDomain, total - baseContext - ciSignals - Math.floor(total * this.config.bufferPct / 100));
      buffer = total - baseContext - crossDomain - ciSignals;
    }

    if (crossDomain > this.config.maxCrossDomain) {
      crossDomain = this.config.maxCrossDomain;
      buffer = total - baseContext - crossDomain - ciSignals;
    }

    if (ciSignals > this.config.maxCI) {
      ciSignals = this.config.maxCI;
      buffer = total - baseContext - crossDomain - ciSignals;
    }

    const allocation: BudgetAllocation = {
      total,
      baseContext,
      crossDomainSignals: crossDomain,
      ciSignals,
      buffer,
    };

    return {
      allocation,
      effectiveBaseBudget: baseContext,
      crossDomainBudget: crossDomain,
      ciBudget: ciSignals,
    };
  }

  /**
   * Calculate reserve needed for cross-domain signals in compact().
   */
  reserveForCrossDomain(crossDomainEnabled: boolean): number {
    if (!crossDomainEnabled) return 0;
    return Math.floor((this.config.totalBudget * this.config.crossDomainPct) / 100);
  }

  /**
   * Calculate reserve needed for CI signals in compact().
   */
  reserveForCI(ciEnabled: boolean): number {
    if (!ciEnabled) return 0;
    return Math.floor((this.config.totalBudget * this.config.ciPct) / 100);
  }

  /**
   * Check if there's enough budget remaining.
   */
  canFit(usedTokens: number, requestedTokens: number, budgetType: "base" | "crossDomain" | "ci"): boolean {
    const allocation = this.calculate();
    const budget = budgetType === "crossDomain"
      ? allocation.crossDomainBudget
      : budgetType === "ci"
        ? allocation.ciBudget
        : allocation.effectiveBaseBudget;
    return usedTokens + requestedTokens <= budget;
  }

  /**
   * Get the maximum remaining budget for a given type.
   */
  remaining(usedTokens: number, budgetType: "base" | "crossDomain" | "ci"): number {
    const allocation = this.calculate();
    const budget = budgetType === "crossDomain"
      ? allocation.crossDomainBudget
      : budgetType === "ci"
        ? allocation.ciBudget
        : allocation.effectiveBaseBudget;
    return Math.max(0, budget - usedTokens);
  }

  /** Update config at runtime */
  updateConfig(config: Partial<BudgetConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Get current config */
  getConfig(): Required<BudgetConfig> {
    return { ...this.config };
  }
}
