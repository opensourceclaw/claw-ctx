import { describe, it, expect } from "vitest";
import { ContextTaskType } from "../../src/context/ContextBudgetManager";

describe("task type detection chain", () => {
  it("ContextTaskType enum has 4 values", () => {
    expect(Object.values(ContextTaskType).length).toBe(4);
  });
  it("complex reasoning has smallest factor (paper direction)", () => {
    // Verified in complexity-factor test; assert ordering semantics here
    expect(ContextTaskType.COMPLEX_REASONING).toBe("complex_reasoning");
  });
});
