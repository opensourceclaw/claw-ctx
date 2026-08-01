/** claw-ctx v6.0.0 — IContextCapability Contract Tests */
import { describe, it, expect } from "vitest";
import { ContextCapability } from "../../src/capability/context-capability";
import type { IContextCapability } from "../../src/capability/types";

describe("IContextCapability Contract", () => {
  it("ContextCapability satisfies IContextCapability", () => {
    const cap: IContextCapability = new ContextCapability();
    expect(cap.name).toBe("context");
    expect(cap.version).toBe("6.0.0");
    expect(typeof cap.bootstrap).toBe("function");
    expect(typeof cap.ingest).toBe("function");
    expect(typeof cap.assemble).toBe("function");
    expect(typeof cap.compact).toBe("function");
    expect(typeof cap.closeSession).toBe("function");
    expect(typeof cap.healthCheck).toBe("function");
    expect(typeof cap.dispose).toBe("function");
  });

  it("all methods return Promises", async () => {
    const cap = new ContextCapability();
    const bs = cap.bootstrap({ sessionId: "t", sessionFile: "/tmp/t" });
    const ig = cap.ingest({ sessionId: "t", message: { role: "user", content: "hi" } });
    const hc = cap.healthCheck();
    expect(bs).toBeInstanceOf(Promise);
    expect(ig).toBeInstanceOf(Promise);
    expect(hc).toBeInstanceOf(Promise);
    const [bsR, igR] = await Promise.all([bs, ig]);
    expect(bsR).toHaveProperty("bootstrapped");
    expect(igR).toHaveProperty("ingested");
    await cap.dispose();
  });

  it("bootstrap result has required fields", async () => {
    const cap = new ContextCapability();
    const result = await cap.bootstrap({ sessionId: "s", sessionFile: "/tmp/s" });
    expect(typeof result.bootstrapped).toBe("boolean");
    await cap.dispose();
  });

  it("assemble result has required fields", async () => {
    const cap = new ContextCapability();
    await cap.bootstrap({ sessionId: "s", sessionFile: "/tmp/s" });
    const result = await cap.assemble({ sessionId: "s", tokenBudget: 1000 });
    expect(Array.isArray(result.messages)).toBe(true);
    expect(typeof result.estimatedTokens).toBe("number");
    await cap.dispose();
  });
});
