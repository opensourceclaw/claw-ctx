import { describe, it, expect } from "vitest";
import { MecwEstimator } from "../../src/mecw/MecwEstimator";
import { ContextTaskType } from "../../src/context/ContextBudgetManager";

describe("edge cases", () => {
  const est = new MecwEstimator();
  it("unknown model falls back to defaults (no throw)", () => {
    const r = est.estimateMecw("unknown-model-xyz", ContextTaskType.SIMPLE_LOOKUP);
    expect(r.maxContextTokens).toBeGreaterThan(0);
    expect(r.mecwTokens).toBeGreaterThan(0);
  });
  it("mecw is always positive", () => {
    for (const t of Object.values(ContextTaskType)) {
      const r = est.estimateMecw("deepseek-v3", t);
      expect(r.mecwTokens).toBeGreaterThan(0);
    }
  });
});
