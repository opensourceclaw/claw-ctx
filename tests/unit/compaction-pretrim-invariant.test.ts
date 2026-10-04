// v6.10.1 — compaction pipeline invariant: trigger evaluation must see the
// pre-trim view (evaluate before trim/assembly), asserted from outside.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createClawContextEngine } from "../../src/engine.js";

const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

describe("compaction pre-trim evaluation invariant (v6.10.1)", () => {
  let tmpDir: string;
  let sessionFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-ctx-pretrim-"));
    sessionFile = path.join(tmpDir, "session.jsonl");
    // 60 sizable messages → well above the compaction target
    const lines: string[] = [];
    for (let i = 0; i < 60; i++) {
      lines.push(
        JSON.stringify({
          type: "message",
          id: `m${i}`,
          message: {
            role: i % 2 === 0 ? "user" : "assistant",
            content: `message ${i} ` + "lorem ipsum dolor sit amet consectetur ".repeat(12),
          },
        })
      );
    }
    fs.writeFileSync(sessionFile, lines.join("\n") + "\n", "utf-8");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("evaluate sees the pre-trim volume (view === tokensBefore, larger than tokensAfter)", async () => {
    const engine = createClawContextEngine({ workspaceDir: tmpDir, sessionResume: false }, mockLogger);

    const result = await engine.compact({
      sessionId: "pretrim-1",
      sessionFile,
      tokenBudget: 2000, // target = 1500 tokens → forces a trim
      force: true,
      triggerReason: "force",
    });

    expect(result.ok).toBe(true);
    expect(result.compacted).toBe(true);
    const tokensBefore = result.result!.tokensBefore!;
    const tokensAfter = result.result!.tokensAfter!;

    // The evaluation view must equal the pre-trim volume the trim started from
    expect(engine.lastEvaluationView).not.toBeNull();
    expect(engine.lastEvaluationView!.preTrimTokens).toBe(tokensBefore);
    expect(engine.lastEvaluationView!.preTrimTokens).toBeGreaterThan(tokensAfter);
  });

  it("view refreshes to the pre-trim volume of each compaction attempt", async () => {
    const engine = createClawContextEngine({ workspaceDir: tmpDir, sessionResume: false }, mockLogger);

    await engine.compact({
      sessionId: "pretrim-2",
      sessionFile,
      tokenBudget: 2000,
      force: true,
      triggerReason: "force",
    });
    const first = engine.lastEvaluationView!.preTrimTokens;

    // Second attempt on the now-compacted file: evaluation re-runs on the
    // new (smaller) file — the view must reflect that pre-trim volume.
    const second = await engine.compact({
      sessionId: "pretrim-2",
      sessionFile,
      tokenBudget: 2000,
      force: true,
      triggerReason: "force",
    });
    // v6.10.2 E1: precondition — the second compact must actually succeed
    // (verified against the real engine.compact() return shape: {ok, compacted, result})
    expect(second.compacted).toBe(true);
    expect(second.result).toBeDefined();

    // v6.10.2 E1: independent expected value — no ?? fallback to mask failures
    const expectedSecond = second.result!.tokensBefore;
    expect(engine.lastEvaluationView!.preTrimTokens).toBe(expectedSecond);

    // v6.10.2 E1: strictly smaller than the first pre-trim volume
    expect(engine.lastEvaluationView!.preTrimTokens).toBeLessThan(first);
  });
});
