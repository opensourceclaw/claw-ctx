import { describe, it, expect } from "vitest";
import { MecwEstimator, DEFAULT_COMPLEXITY_FACTORS } from "../../src/mecw/MecwEstimator";
import { ContextTaskType } from "../../src/context/ContextBudgetManager";

describe("MecwEstimator", () => {
  const est = new MecwEstimator();
  it("MECW formula: mecw = max × ratio × factor", () => {
    const r = est.estimateMecw("deepseek-v3", ContextTaskType.SIMPLE_LOOKUP);
    expect(r.mecwTokens).toBe(Math.floor(r.maxContextTokens * r.effectiveWindowRatio * r.complexityFactor));
  });
  it("complexity factor table defaults", () => {
    expect(DEFAULT_COMPLEXITY_FACTORS[ContextTaskType.SIMPLE_LOOKUP]).toBe(1.0);
    expect(DEFAULT_COMPLEXITY_FACTORS[ContextTaskType.MULTI_LOOKUP]).toBe(0.8);
    expect(DEFAULT_COMPLEXITY_FACTORS[ContextTaskType.SUMMARIZATION]).toBe(0.7);
    expect(DEFAULT_COMPLEXITY_FACTORS[ContextTaskType.COMPLEX_REASONING]).toBe(0.6);
  });
});
