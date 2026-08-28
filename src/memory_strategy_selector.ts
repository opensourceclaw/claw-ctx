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
 * MemoryStrategySelector — RL-driven memory recall strategy selection.
 *
 * Uses claw-rl's online learning to select optimal memory strategies
 * for claw-ctx context assembly, based on:
 * - Token budget (remaining context window)
 * - Topic drift (0-1, from claw-ctx DriftDetector)
 * - Task complexity (simple/medium/complex)
 * - Session length (message count)
 *
 * v1.0.0 — Initial implementation for three-project coordination.
 */

export type MemoryStrategy =
  | "aggressive_recall"
  | "selective_recall"
  | "minimal_context"
  | "drift_adaptive";

export interface StrategyContext {
  tokenBudget: number;
  currentDrift: number;
  taskComplexity: "simple" | "medium" | "complex";
  sessionLength: number;
}

export interface StrategyResult {
  strategy: MemoryStrategy;
  confidence: number;
  topK: number;
  budgetAllocation: number;
  reasoning: string;
}

export interface StrategyStats {
  count: number;
  wins: number;
  avgReward: number;
}

export class MemoryStrategySelector {
  private stats = new Map<MemoryStrategy, StrategyStats>();
  private history: Array<{ context: StrategyContext; selected: MemoryStrategy; reward: number }> = [];
  private decayFactor = 0.95;
  private explorationRate = 0.15;

  select(context: StrategyContext): StrategyResult {
    const strategies = this.evaluateStrategies(context);

    // Epsilon-greedy exploration
    if (Math.random() < this.explorationRate) {
      const random = strategies[Math.floor(Math.random() * strategies.length)];
      return { ...random, reasoning: "exploration" };
    }

    // Exploitation: pick best
    const best = strategies.reduce((a, b) => a.confidence > b.confidence ? a : b);
    return { ...best, reasoning: "exploitation" };
  }

  private evaluateStrategies(ctx: StrategyContext): StrategyResult[] {
    const drift = ctx.currentDrift;
    const budgetRatio = ctx.tokenBudget / 80000;
    const complexityWeight = ctx.taskComplexity === "complex" ? 1.2 : ctx.taskComplexity === "medium" ? 1.0 : 0.8;

    return [
      this.evaluateAggressiveRecall(ctx, drift, budgetRatio, complexityWeight),
      this.evaluateSelectiveRecall(ctx, drift, budgetRatio, complexityWeight),
      this.evaluateMinimalContext(ctx, drift, budgetRatio, complexityWeight),
      this.evaluateDriftAdaptive(ctx, drift, budgetRatio, complexityWeight),
    ];
  }

  private evaluateAggressiveRecall(
    ctx: StrategyContext, drift: number, budget: number, cw: number,
  ): StrategyResult {
    const confidence = Math.min(1, (budget * 0.5 + (1 - drift) * 0.3 + cw * 0.2));
    const stats = this.stats.get("aggressive_recall");
    const bonus = stats ? Math.min(0.2, stats.avgReward * 0.2) : 0;
    return {
      strategy: "aggressive_recall",
      confidence: Math.min(1, confidence + bonus),
      topK: 15,
      budgetAllocation: Math.floor(ctx.tokenBudget * 0.5),
      reasoning: `High budget (${ctx.tokenBudget}) + low drift (${drift.toFixed(2)})`,
    };
  }

  private evaluateSelectiveRecall(
    ctx: StrategyContext, drift: number, budget: number, cw: number,
  ): StrategyResult {
    const confidence = Math.min(1, (budget * 0.3 + drift * 0.3 + cw * 0.3 + 0.1));
    const stats = this.stats.get("selective_recall");
    const bonus = stats ? Math.min(0.2, stats.avgReward * 0.2) : 0;
    return {
      strategy: "selective_recall",
      confidence: Math.min(1, confidence + bonus),
      topK: 8,
      budgetAllocation: Math.floor(ctx.tokenBudget * 0.3),
      reasoning: `Confidence-based filtering (drift: ${drift.toFixed(2)})`,
    };
  }

  private evaluateMinimalContext(
    ctx: StrategyContext, drift: number, budget: number, cw: number,
  ): StrategyResult {
    const confidence = Math.min(1, ((1 - budget) * 0.5 + drift * 0.3 + cw * 0.2));
    const stats = this.stats.get("minimal_context");
    const bonus = stats ? Math.min(0.2, stats.avgReward * 0.2) : 0;
    return {
      strategy: "minimal_context",
      confidence: Math.min(1, confidence + bonus),
      topK: 3,
      budgetAllocation: Math.floor(ctx.tokenBudget * 0.1),
      reasoning: `Tight budget (${ctx.tokenBudget}) strategy`,
    };
  }

  private evaluateDriftAdaptive(
    ctx: StrategyContext, drift: number, budget: number, cw: number,
  ): StrategyResult {
    const confidence = Math.min(1, (drift * 0.4 + budget * 0.3 + cw * 0.3));
    const stats = this.stats.get("drift_adaptive");
    const bonus = stats ? Math.min(0.2, stats.avgReward * 0.2) : 0;
    return {
      strategy: "drift_adaptive",
      confidence: Math.min(1, confidence + bonus),
      topK: drift > 0.5 ? 12 : 6,
      budgetAllocation: Math.floor(ctx.tokenBudget * (drift > 0.5 ? 0.4 : 0.2)),
      reasoning: `Drift-driven (${drift.toFixed(2)}) recall level`,
    };
  }

  /** Record feedback from a strategy selection for RL learning. */
  recordFeedback(strategy: MemoryStrategy, reward: number): void {
    let stats = this.stats.get(strategy);
    if (!stats) {
      stats = { count: 0, wins: 0, avgReward: 0 };
      this.stats.set(strategy, stats);
    }
    stats.count++;
    if (reward > 0) stats.wins++;
    stats.avgReward = (stats.avgReward * (stats.count - 1) + reward) / stats.count;

    // Decay exploration rate as we learn
    this.explorationRate *= this.decayFactor;
    if (this.explorationRate < 0.02) this.explorationRate = 0.02;
  }

  getStats(): Record<string, StrategyStats> {
    return Object.fromEntries(this.stats);
  }

  reset(): void {
    this.stats.clear();
    this.history = [];
    this.explorationRate = 0.15;
  }
}
