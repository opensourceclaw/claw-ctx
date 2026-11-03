// claw-ctx v6.14.0 — cold-start re-injection after a host reset boundary.
//
// Equivalent sequence of the 2026-11-03 incident: messages exist before the
// reset, the host resets (daily), and the next assemble() receives a single
// user message. The handoff summary must come back through [Session History].

import { describe, it, expect, vi } from "vitest";
import { ResetHandoff } from "../../../src/reset-handoff.js";
import { createClawContextEngine } from "../../../src/engine.js";
import { SessionResumeManager } from "../../../src/session-resume/bootstrap.js";

const SESSION_ID = "797c85e0-bf81-4b01-9adf-e943891e6b9c";

function fakeManager() {
  const stored: Array<{ content: string; tags?: string[] }> = [];
  return {
    stored,
    sessionId: "",
    async store(content: string, _type: string, tags?: string[]) {
      stored.push({ content, tags });
      return { id: `mem-${stored.length}` };
    },
    async search(_query: string, _type?: string, topK = 10) {
      return stored
        .filter((entry) => entry.tags?.includes("session_summary"))
        .slice(-topK)
        .map((entry, index) => ({
          content: entry.content,
          score: 0.9,
          tags: entry.tags,
          id: `mem-${index}`,
          timestamp: Date.now(),
        }));
    },
    injectConstitution() {},
  };
}

const logger = {
  info: () => {},
  warn: () => {},
  debug: () => {},
  error: () => {},
};

const PRE_RESET_MESSAGES = [
  { role: "user", content: "目前除了 Karen 在进行的发布，还有哪些未完成的任务？" },
  { role: "assistant", content: "需要继续检查被改的 10-27 回执 diff，确认动了什么。" },
  {
    role: "assistant",
    content:
      "要我先查那份被改的 10-27 回执 diff、确认动了什么吗？" +
      "相关文件 inbox/inbox-results/回执-edith-wiring-batch-B-acceptance-20261102.md，" +
      "任务 task-MY_MARKER-1，标记 MY_MARKER-note.md。",
  },
];

describe("cold-start continuity injection", () => {
  it("re-injects the pre-reset handoff into a single-message post-reset turn", async () => {
    const manager = fakeManager();
    const handoff = new ResetHandoff(manager);
    expect(
      (await handoff.capture({
        sessionId: SESSION_ID,
        reason: "daily",
        messages: PRE_RESET_MESSAGES,
      })).stored
    ).toBe(true);

    const engine = createClawContextEngine(
      { workspaceDir: process.cwd() },
      logger,
      manager as never,
    );

    const result = await engine.assemble({
      sessionId: SESSION_ID,
      messages: [{ role: "user", content: "需要" }],
      tokenBudget: 100000,
    });

    const injected = result.systemPromptAddition ?? "";
    expect(injected).toContain("[Session History");
    expect(injected).toContain("回执 diff");
    // v6.14.1: concrete identifiers survive the reset and are rendered.
    expect(injected).toContain("Open items:");
    expect(injected).toContain("task-MY_MARKER-1");
    expect(injected).toContain("MY_MARKER-note.md");
    expect(injected).toContain("回执-edith-wiring-batch-B-acceptance-20261102.md");
  });

  it("bootstraps resume history at most once per session across cold turns", async () => {
    const manager = fakeManager();
    await new ResetHandoff(manager).capture({
      sessionId: SESSION_ID,
      reason: "daily",
      messages: PRE_RESET_MESSAGES,
    });

    const bootstrapSpy = vi.spyOn(SessionResumeManager.prototype, "bootstrap");
    try {
      const engine = createClawContextEngine(
        { workspaceDir: process.cwd() },
        logger,
        manager as never,
      );
      for (let i = 0; i < 3; i++) {
        await engine.assemble({
          sessionId: SESSION_ID,
          messages: [{ role: "user", content: "需要" }],
          tokenBudget: 100000,
        });
      }
      expect(bootstrapSpy).toHaveBeenCalledTimes(1);
    } finally {
      bootstrapSpy.mockRestore();
    }
  });
});
