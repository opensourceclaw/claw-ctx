/**
 * claw-ctx — Optimizer Observer
 *
 * Integrates with claw-obs for observability.
 * Emits events for strategy usage, performance metrics, and cache stats.
 *
 * v5.16.1: Initial implementation
 */

import type { OptimizationStrategy } from "../model-profile.js";

/**
 * Event types emitted by OptimizerObserver
 */
export interface OptimizerEvents {
  "ctx.strategy.used": { strategy: OptimizationStrategy; modelId: string; timestamp: number };
  "ctx.optimize.duration": { duration: number; modelId: string; timestamp: number };
  "ctx.cache.result": { hit: boolean; modelId?: string; timestamp: number };
  "ctx.tokens.saved": { tokens: number; modelId?: string; timestamp: number };
  "ctx.budget.allocated": { modelId: string; totalBudget: number; stable: number; dynamic: number; reserve: number; timestamp: number };
  "ctx.compression.triggered": { modelId: string; tokensBefore: number; threshold: number; timestamp: number };
}

export type OptimizerEventName = keyof OptimizerEvents;
export type OptimizerEventData<E extends OptimizerEventName> = OptimizerEvents[E];

/**
 * EventBus interface (compatible with claw-obs EventBus)
 */
export interface IEventBus {
  emit(event: string, data: unknown): void;
  on?(event: string, listener: (data: unknown) => void): void;
  off?(event: string, listener: (data: unknown) => void): void;
}

/**
 * No-op event bus for when claw-obs is not available
 */
class NoOpEventBus implements IEventBus {
  emit(_event: string, _data: unknown): void {}
}

/**
 * Optimizer Observer
 */
export class OptimizerObserver {
  private eventBus: IEventBus;
  private enabled: boolean = true;

  constructor(eventBus?: IEventBus) {
    this.eventBus = eventBus ?? this.tryLoadEventBus();
  }

  private tryLoadEventBus(): IEventBus {
    try {
      const clawObs = require("claw-obs");
      if (clawObs.EventBus) {
        return new clawObs.EventBus();
      }
    } catch {
      // claw-obs not available
    }
    return new NoOpEventBus();
  }

  setEventBus(eventBus: IEventBus): void {
    this.eventBus = eventBus;
  }

  getEventBus(): IEventBus {
    return this.eventBus;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  emitStrategyUsed(strategy: OptimizationStrategy, modelId: string): void {
    if (!this.enabled) return;
    this.eventBus.emit("ctx.strategy.used", { strategy, modelId, timestamp: Date.now() });
  }

  emitOptimizeDuration(duration: number, modelId: string): void {
    if (!this.enabled) return;
    this.eventBus.emit("ctx.optimize.duration", { duration, modelId, timestamp: Date.now() });
  }

  emitCacheResult(hit: boolean, modelId?: string): void {
    if (!this.enabled) return;
    this.eventBus.emit("ctx.cache.result", { hit, modelId, timestamp: Date.now() });
  }

  emitTokensSaved(tokens: number, modelId?: string): void {
    if (!this.enabled) return;
    this.eventBus.emit("ctx.tokens.saved", { tokens, modelId, timestamp: Date.now() });
  }

  emitBudgetAllocated(
    modelId: string,
    totalBudget: number,
    stable: number,
    dynamic: number,
    reserve: number
  ): void {
    if (!this.enabled) return;
    this.eventBus.emit("ctx.budget.allocated", {
      modelId, totalBudget, stable, dynamic, reserve, timestamp: Date.now()
    });
  }

  emitCompressionTriggered(modelId: string, tokensBefore: number, threshold: number): void {
    if (!this.enabled) return;
    this.eventBus.emit("ctx.compression.triggered", {
      modelId, tokensBefore, threshold, timestamp: Date.now()
    });
  }

  emit<E extends OptimizerEventName>(event: E, data: OptimizerEventData<E>): void {
    if (!this.enabled) return;
    this.eventBus.emit(event, data);
  }
}

export const optimizerObserver = new OptimizerObserver();
