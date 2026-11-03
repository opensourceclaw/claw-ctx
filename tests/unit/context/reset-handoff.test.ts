// claw-ctx v6.14.0 — reset-boundary handoff (2026-11-03 incident).
//
// Reproduces the trigger: OpenClaw daily reset drops the live window
// (transcript event {type:"reset", reason:"daily"}), and claw-ctx had no
// session summary to re-inject. The before_reset hook now persists one.

import { describe, it, expect } from "vitest";
import { ResetHandoff, RESET_HANDOFF_TAG } from "../../../src/reset-handoff.js";

interface Stored {
  content: string;
  type: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

function fakeManager() {
  const stored: Stored[] = [];
  return {
    stored,
    async store(content: string, type: string, tags?: string[], metadata?: Record<string, unknown>) {
      stored.push({ content, type, tags, metadata });
      return { id: `mem-${stored.length}` };
    },
  };
}

const RESET_MESSAGES = [
  { role: "user", content: "目前除了 Karen 在进行的发布，还有哪些未完成的任务？" },
  {
    role: "assistant",
    content: [
      { type: "thinking", text: "定性完成。结论分四类。" },
      { type: "text", text: "需要继续检查被改的 10-27 回执 diff，确认动了什么。" },
    ],
  },
  { role: "user", content: "需要" },
  { role: "assistant", content: "要我先查那份被改的 10-27 回执 diff、确认动了什么吗？" },
];

describe("ResetHandoff", () => {
  it("stores a session_summary that HistoryLoader can inject after reset", async () => {
    const manager = fakeManager();
    const handoff = new ResetHandoff(manager);
    const result = await handoff.capture({
      sessionId: "797c85e0-bf81-4b01-9adf-e943891e6b9c",
      sessionKey: "agent:main:tui",
      reason: "daily",
      messages: RESET_MESSAGES,
    });

    expect(result.stored).toBe(true);
    expect(manager.stored).toHaveLength(1);
    const entry = manager.stored[0];
    expect(entry.type).toBe("episodic");
    expect(entry.tags).toEqual([RESET_HANDOFF_TAG, "session_summary", "continuity"]);
    expect(entry.metadata).toMatchObject({
      sessionId: "797c85e0-bf81-4b01-9adf-e943891e6b9c",
      resetReason: "daily",
    });

    const summary = JSON.parse(entry.content);
    expect(summary.sessionId).toBe("797c85e0-bf81-4b01-9adf-e943891e6b9c");
    expect(summary.handoffReason).toBe("daily");
    expect(
      [...summary.pendingTasks, ...summary.keyPoints].join("\n")
    ).toContain("回执 diff");
  });

  it("does not store when there is not enough evidence", async () => {
    const manager = fakeManager();
    const result = await new ResetHandoff(manager).capture({
      sessionId: "s1",
      messages: [{ role: "user", content: "需要" }],
    });
    expect(result.stored).toBe(false);
    expect(result.reason).toContain("too few messages");
    expect(manager.stored).toHaveLength(0);
  });

  it("requires a session id and never throws on store failure", async () => {
    const manager = fakeManager();
    expect(
      (await new ResetHandoff(manager).capture({ sessionId: "  ", messages: RESET_MESSAGES })).stored
    ).toBe(false);

    const failing = {
      async store() {
        throw new Error("claw-mem down");
      },
    };
    const result = await new ResetHandoff(failing).capture({
      sessionId: "s1",
      messages: RESET_MESSAGES,
    });
    expect(result.stored).toBe(false);
    expect(result.reason).toContain("claw-mem down");
  });
});
