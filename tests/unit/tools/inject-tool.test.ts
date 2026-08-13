import { describe, it, expect } from "vitest";
import { ContextCapability } from "../../../src/capability/context-capability";

describe("ctx_inject tool mapping", () => {
  it("injects with default append", async () => {
    const cap = new ContextCapability({});
    const r = await cap.inject({ targetSessionId: "t1", content: "content" });
    expect(r.injected).toBe(true);
    await cap.dispose();
  });
});
