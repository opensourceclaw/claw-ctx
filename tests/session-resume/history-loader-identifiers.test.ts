// claw-ctx v6.14.1 — identifier rendering in [Session History].
//
// New handoff payloads carry pendingFiles/pendingIds; the loader renders them
// as "Open items". Pre-v6.14.1 payloads (no new fields) must keep parsing and
// simply omit the line — additive only, no break.

import { describe, it, expect, vi } from "vitest";
import { HistoryLoader } from "../../src/session-resume/history-loader.js";
import type { SessionSummary } from "../../src/session-resume/types.js";

function summary(overrides: Partial<SessionSummary> & { sessionId: string }): SessionSummary {
  return {
    theme: "test theme",
    pendingTasks: [],
    keyPoints: [],
    timestamp: Date.now(),
    messageCount: 3,
    entities: [],
    ...overrides,
  };
}

function managerFor(payload: SessionSummary) {
  return {
    search: vi.fn().mockResolvedValue([
      { content: JSON.stringify(payload), score: 1, tags: ["session_summary"], id: "m1" },
    ]),
  };
}

describe("HistoryLoader — v6.14.1 identifier surface", () => {
  it("renders Open items from pendingFiles + pendingIds (full mode)", async () => {
    const loader = new HistoryLoader(
      managerFor(
        summary({
          sessionId: "s1",
          pendingFiles: ["inbox/inbox-results/回执-edith-wiring-batch-B-acceptance-20261102.md"],
          pendingIds: ["task-MY_MARKER-1"],
        })
      )
    );
    const result = await loader.load("s1");
    expect(result.formatted).toContain(
      "Open items: inbox/inbox-results/回执-edith-wiring-batch-B-acceptance-20261102.md, task-MY_MARKER-1"
    );
  });

  it("dedupes the same value across files and ids", async () => {
    const loader = new HistoryLoader(
      managerFor(
        summary({
          sessionId: "s1",
          pendingFiles: ["a.md", "b.md"],
          pendingIds: ["b.md", "task-1"],
        })
      )
    );
    const result = await loader.load("s1");
    expect(result.formatted).toContain("Open items: a.md, b.md, task-1");
  });

  it("parses pre-v6.14.1 payloads and omits the line (no break)", async () => {
    const loader = new HistoryLoader(managerFor(summary({ sessionId: "s1" })));
    const result = await loader.load("s1");
    expect(result.entries).toHaveLength(1);
    expect(result.formatted).toContain("Theme: test theme");
    expect(result.formatted).not.toContain("Open items:");
  });

  it("renders a compact open-items note in compact mode", async () => {
    const loader = new HistoryLoader(
      managerFor(
        summary({
          sessionId: "s1",
          pendingFiles: ["a.md"],
          pendingIds: ["task-1"],
        })
      ),
      { injectMode: "compact" }
    );
    const result = await loader.load("s1");
    expect(result.formatted).toContain("| open: a.md, task-1");
  });
});
