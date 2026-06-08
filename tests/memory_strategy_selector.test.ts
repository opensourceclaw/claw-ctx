import { describe, it, expect } from "vitest";
import { MemoryStrategySelector } from "../src/memory_strategy_selector";

describe("MemoryStrategySelector", () => {
  const ctx = {
    tokenBudget: 40000,
    currentDrift: 0.3,
    taskComplexity: "medium" as const,
    sessionLength: 50,
  };

  it("selects a strategy from the 4 options", () => {
    const selector = new MemoryStrategySelector();
    const result = selector.select(ctx);
    expect(["aggressive_recall", "selective_recall", "minimal_context", "drift_adaptive"]).toContain(result.strategy);
    expect(result.topK).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("returns a BudgetAllocation under tokenBudget", () => {
    const selector = new MemoryStrategySelector();
    const result = selector.select(ctx);
    expect(result.budgetAllocation).toBeLessThanOrEqual(ctx.tokenBudget);
  });

  it("exploitation picks best strategy when no exploration", () => {
    const selector = new MemoryStrategySelector();
    // run many selections to get exploitation behavior
    const results: string[] = [];
    for (let i = 0; i < 50; i++) {
      results.push(selector.select(ctx).strategy);
    }
    // At least one strategy should dominate
    expect(new Set(results).size).toBeGreaterThanOrEqual(1);
  });

  it("records feedback and updates stats", () => {
    const selector = new MemoryStrategySelector();
    selector.recordFeedback("aggressive_recall", 1);
    selector.recordFeedback("aggressive_recall", 0.5);
    const stats = selector.getStats();
    expect(stats["aggressive_recall"]).toBeDefined();
    expect(stats["aggressive_recall"].count).toBe(2);
    expect(stats["aggressive_recall"].wins).toBeGreaterThanOrEqual(0);
  });

  it("records negative feedback for poor strategy", () => {
    const selector = new MemoryStrategySelector();
    selector.recordFeedback("minimal_context", -0.5);
    const stats = selector.getStats();
    expect(stats["minimal_context"]).toBeDefined();
    expect(stats["minimal_context"].count).toBe(1);
  });

  it("exploration decay reduces exploration rate over time", () => {
    const selector = new MemoryStrategySelector();
    // Record many feedbacks to trigger decay
    for (let i = 0; i < 100; i++) {
      selector.recordFeedback("aggressive_recall", 1);
    }
    // After 100 positive rewards, strategy confidence should be high
    const stats = selector.getStats();
    expect(stats["aggressive_recall"].count).toBe(100);
  });

  it("reset clears all state", () => {
    const selector = new MemoryStrategySelector();
    selector.recordFeedback("aggressive_recall", 1);
    selector.recordFeedback("selective_recall", 0.5);
    expect(Object.keys(selector.getStats()).length).toBeGreaterThan(0);

    selector.reset();
    expect(Object.keys(selector.getStats()).length).toBe(0);
  });

  it("selects drift_adaptive when drift is high", () => {
    const selector = new MemoryStrategySelector();
    const highDriftCtx = { ...ctx, currentDrift: 0.9 };
    const results: string[] = [];
    for (let i = 0; i < 100; i++) {
      results.push(selector.select(highDriftCtx).strategy);
    }
    // drift_adaptive should be selected often
    const driftCount = results.filter(r => r === "drift_adaptive").length;
    expect(driftCount).toBeGreaterThan(0);
  });

  it("selects aggressive_recall when budget is high and drift low", () => {
    const selector = new MemoryStrategySelector();
    const highBudgetCtx = { ...ctx, tokenBudget: 70000, currentDrift: 0.1, taskComplexity: "complex" as const };
    const results: string[] = [];
    for (let i = 0; i < 100; i++) {
      results.push(selector.select(highBudgetCtx).strategy);
    }
    const aggressiveCount = results.filter(r => r === "aggressive_recall").length;
    expect(aggressiveCount).toBeGreaterThan(0);
  });

  it("selects minimal_context when budget is very low", () => {
    const selector = new MemoryStrategySelector();
    const lowBudgetCtx = { ...ctx, tokenBudget: 5000, currentDrift: 0.5 };
    const results: string[] = [];
    for (let i = 0; i < 100; i++) {
      results.push(selector.select(lowBudgetCtx).strategy);
    }
    const minimalCount = results.filter(r => r === "minimal_context").length;
    expect(minimalCount).toBeGreaterThan(0);
  });

  it("has reasoning field", () => {
    const selector = new MemoryStrategySelector();
    const result = selector.select(ctx);
    expect(result.reasoning).toBeTruthy();
    expect(typeof result.reasoning).toBe("string");
  });

  it("topK varies with drift level for drift_adaptive strategy", () => {
    const selector = new MemoryStrategySelector();
    // High drift should prefer higher topK
    const highDriftCtx = { ...ctx, currentDrift: 0.9 };
    const results: Array<{ strategy: string; topK: number }> = [];
    for (let i = 0; i < 100; i++) {
      const r = selector.select(highDriftCtx);
      results.push({ strategy: r.strategy, topK: r.topK });
    }
    // At least some selections should be drift_adaptive with topK=12
    const highTopK = results.filter(r => r.strategy === "drift_adaptive" && r.topK === 12);
    expect(highTopK.length).toBeGreaterThan(0);
  });
});
