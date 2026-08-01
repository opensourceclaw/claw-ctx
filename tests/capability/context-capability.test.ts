/** claw-ctx v6.0.0 — ContextCapability Tests */
import { describe, it, expect, beforeEach } from "vitest";
import { ContextCapability } from "../../src/capability/context-capability";

describe("ContextCapability", () => {
  let cap: ContextCapability;

  beforeEach(() => {
    cap = new ContextCapability();
  });

  it("should have name 'context'", () => {
    expect(cap.name).toBe("context");
  });

  it("should have version '6.0.0'", () => {
    expect(cap.version).toBe("6.0.0");
  });

  it("should bootstrap a session", async () => {
    const result = await cap.bootstrap({ sessionId: "test-session", sessionFile: "/tmp/test.json" });
    expect(result).toHaveProperty("bootstrapped");
  });

  it("should ingest a message", async () => {
    await cap.bootstrap({ sessionId: "test-session", sessionFile: "/tmp/test.json" });
    const result = await cap.ingest({
      sessionId: "test-session",
      message: { role: "user", content: "Hello, world!" },
    });
    expect(result).toHaveProperty("ingested");
  });

  it("should assemble context", async () => {
    await cap.bootstrap({ sessionId: "test-session", sessionFile: "/tmp/test.json" });
    const result = await cap.assemble({ sessionId: "test-session", tokenBudget: 4000 });
    expect(result).toHaveProperty("messages");
    expect(result).toHaveProperty("estimatedTokens");
  });

  it("should compact context", async () => {
    await cap.bootstrap({ sessionId: "test-session", sessionFile: "/tmp/test.json" });
    const result = await cap.compact({ sessionId: "test-session", targetTokens: 2000 });
    expect(result).toHaveProperty("ok");
  });

  it("should close a session", async () => {
    await cap.bootstrap({ sessionId: "test-session", sessionFile: "/tmp/test.json" });
    await cap.closeSession("test-session");
  });

  it("should check health", async () => {
    const result = await cap.healthCheck();
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("score");
  });

  it("should dispose cleanly", async () => {
    await cap.dispose();
    await expect(cap.healthCheck()).rejects.toThrow("disposed");
  });

  it("dispose should be idempotent", async () => {
    await cap.dispose();
    await cap.dispose();
  });
});
