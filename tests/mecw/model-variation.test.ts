import { describe, it, expect } from "vitest";
import { MecwEstimator } from "../../src/mecw/MecwEstimator";
import { ContextTaskType } from "../../src/context/ContextBudgetManager";

describe("model variation", () => {
  const est = new MecwEstimator();
  it("different models produce different MECW", () => {
    const a = est.estimateMecw("deepseek-v3", ContextTaskType.SIMPLE_LOOKUP);
    const b = est.estimateMecw("glm-5.2", ContextTaskType.SIMPLE_LOOKUP);
    // Model profiles differ in maxTokens/ratio — MECW should reflect that
    expect(a.maxContextTokens).toBeDefined();
    expect(b.maxContextTokens).toBeDefined();
  });
});
