import { describe, it, expect } from "vitest";
import { ContextCapability } from "../../../src/capability/context-capability";

describe("ContextCapability.inject", () => {
  it("injects append content", async () => {
    const cap = new ContextCapability({});
    const r = await cap.inject({ targetSessionId: "s1", content: "hello", position: "append" });
    expect(r.injected).toBe(true);
    await cap.dispose();
  });
  it("replace degrades to append with reason", async () => {
    const cap = new ContextCapability({});
    const r = await cap.inject({ targetSessionId: "s1", content: "x", position: "replace" });
    expect(r.injected).toBe(true);
    expect(r.reason).toContain("degraded");
    await cap.dispose();
  });
});
