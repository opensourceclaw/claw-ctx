import { describe, it, expect } from "vitest";
import { ContextCapability } from "../../../src/capability/context-capability";

describe("ctx_build tool mapping", () => {
  it("assembles with budget", async () => {
    const cap = new ContextCapability({});
    const r = await cap.assemble({ sessionId: "s1", tokenBudget: 1000 });
    expect(r).toHaveProperty("estimatedTokens");
    expect(Array.isArray(r.messages)).toBe(true);
    await cap.dispose();
  });
});
