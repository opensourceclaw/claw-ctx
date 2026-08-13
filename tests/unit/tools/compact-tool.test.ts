import { describe, it, expect } from "vitest";
import { ContextCapability } from "../../../src/capability/context-capability";

describe("ctx_compact tool mapping", () => {
  it("maps compact params correctly", async () => {
    const cap = new ContextCapability({});
    const r = await cap.compact({ sessionId: "s1", strategy: "balanced", force: false });
    expect(r).toHaveProperty("ok");
    await cap.dispose();
  });
});
