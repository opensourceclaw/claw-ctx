/**
 * Integration tests for Self-Refinement module.
 *
 * Verifies that SelfRefiner and PromptStrategyController correctly
 * delegate to the new self-refinement module.
 */
import { describe, it, expect } from "vitest";
import { SelfRefiner } from "../../src/self_refiner.js";
import { PromptStrategyController } from "../../src/prompt_strategy_controller.js";
import { QualityEvaluator } from "../../src/self-refinement/quality-evaluator.js";
import { ChainOfThoughtStrategy, TreeOfThoughtsStrategy, GraphOfThoughtsStrategy } from "../../src/self-refinement/reasoning-strategies/mod.js";

describe("SelfRefiner delegation", () => {
  it("evaluate delegates to QualityEvaluator", () => {
    const refiner = new SelfRefiner();
    const result = refiner.evaluate("Clean and complete response with no issues.");
    expect(result.score).toBeGreaterThanOrEqual(0.7);
    expect(result.passed).toBe(true);
    expect(Array.isArray(result.issues)).toBe(true);
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  it("evaluate matches QualityEvaluator results", () => {
    const refiner = new SelfRefiner();
    const evaluator = new QualityEvaluator();
    const output = "TODO: implement this function";

    const rRefiner = refiner.evaluate(output);
    const rEval = evaluator.evaluate(output);

    expect(rRefiner.passed).toBe(rEval.passed);
    expect(rRefiner.score).toBe(rEval.overallScore);
  });

  it("run still works with delegation", () => {
    const refiner = new SelfRefiner({ triggerOn: ["always"] });
    const result = refiner.run("TODO: incomplete work here.");
    expect(result.loops).toBeGreaterThanOrEqual(0);
    expect(typeof result.refinedOutput).toBe("string");
  });
});

describe("PromptStrategyController delegation", () => {
  it("applyStrategy delegates to CoT instance", () => {
    const ctrl = new PromptStrategyController();
    const result = ctrl.applyStrategy("Write code", "chain-of-thought");
    expect(result).toContain("step by step");
  });

  it("applyStrategy delegates to ToT instance", () => {
    const ctrl = new PromptStrategyController();
    const result = ctrl.applyStrategy("Design", "tree-of-thoughts");
    expect(result).toContain("multiple solution paths");
  });

  it("applyStrategy delegates to GoT instance", () => {
    const ctrl = new PromptStrategyController();
    const result = ctrl.applyStrategy("Architecture", "graph-of-thoughts");
    expect(result).toContain("network of ideas");
  });
});

describe("Module exports", () => {
  it("all strategy classes are accessible", () => {
    expect(ChainOfThoughtStrategy).toBeDefined();
    expect(TreeOfThoughtsStrategy).toBeDefined();
    expect(GraphOfThoughtsStrategy).toBeDefined();
  });

  it("QualityEvaluator is accessible", () => {
    const e = new QualityEvaluator();
    expect(e.evaluate).toBeDefined();
  });
});
