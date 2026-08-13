import { describe, it, expect } from "vitest";
import { MecwEstimator } from "../../src/mecw/MecwEstimator";
import { ContextTaskType } from "../../src/context/ContextBudgetManager";

describe("complexity factors", () => {
  it("configurable override", () => {
    const est = new MecwEstimator(undefined, { [ContextTaskType.SIMPLE_LOOKUP]: 0.5 });
    expect(est.getComplexityFactor(ContextTaskType.SIMPLE_LOOKUP)).toBe(0.5);
  });
  it("unknown taskType → conservative 0.6", () => {
    const est = new MecwEstimator();
    expect(est.getComplexityFactor("UNKNOWN" as ContextTaskType)).toBe(0.6);
  });
  it("getFactors returns frozen readonly", () => {
    const est = new MecwEstimator();
    const f = est.getFactors();
    expect(Object.isFrozen(f)).toBe(true);
    expect(f[ContextTaskType.SUMMARIZATION]).toBe(0.7);
  });
});
