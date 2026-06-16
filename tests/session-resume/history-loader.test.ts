import { describe, it, expect, vi } from "vitest";
import { HistoryLoader } from "../../src/session-resume/history-loader.js";
import type { SessionSummary, SessionResumeConfig } from "../../src/session-resume/types.js";

function makeSummary(overrides: Partial<SessionSummary> & { sessionId: string }): SessionSummary {
  return {
    theme: "test theme",
    pendingTasks: [],
    keyPoints: [],
    timestamp: Date.now(),
    messageCount: 10,
    entities: [],
    ...overrides,
  };
}

function makeMockManager(results: Array<{ content: string; score: number; tags?: string[]; id?: string; timestamp?: number }>) {
  return {
    search: vi.fn().mockResolvedValue(results),
  };
}

describe("HistoryLoader", () => {
  it("load returns empty when no summaries found", async () => {
    const manager = makeMockManager([]);
    const loader = new HistoryLoader(manager);
    const result = await loader.load("session-1");
    expect(result.entries).toEqual([]);
    expect(result.formatted).toBe("");
    expect(result.totalSessions).toBe(0);
  });

  it("filters by session_summary tag", async () => {
    const summary = makeSummary({ sessionId: "s1" });
    const manager = makeMockManager([
      { content: JSON.stringify(summary), score: 1, tags: ["session_summary"], id: "m1" },
      { content: "untagged", score: 0.5, tags: ["other"], id: "m2" },
    ]);
    const loader = new HistoryLoader(manager);
    const result = await loader.load("session-1");
    expect(result.entries).toHaveLength(1);
    expect(result.totalSessions).toBe(1);
  });

  it("deduplicates by sessionId (keeps most recent)", async () => {
    const now = Date.now();
    const s1 = makeSummary({ sessionId: "s1", timestamp: now - 60000 });
    const s2 = makeSummary({ sessionId: "s1", timestamp: now });
    const manager = makeMockManager([
      { content: JSON.stringify(s1), score: 1, tags: ["session_summary"], id: "m1" },
      { content: JSON.stringify(s2), score: 1, tags: ["session_summary"], id: "m2" },
    ]);
    const loader = new HistoryLoader(manager);
    const result = await loader.load("session-1");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].summary.timestamp).toBe(now);
  });

  it("sorts by recency descending", async () => {
    const now = Date.now();
    const old = makeSummary({ sessionId: "s1", timestamp: now - 120000 });
    const mid = makeSummary({ sessionId: "s2", timestamp: now - 60000 });
    const recent = makeSummary({ sessionId: "s3", timestamp: now });
    const manager = makeMockManager([
      { content: JSON.stringify(mid), score: 1, tags: ["session_summary"], id: "m2" },
      { content: JSON.stringify(old), score: 1, tags: ["session_summary"], id: "m1" },
      { content: JSON.stringify(recent), score: 1, tags: ["session_summary"], id: "m3" },
    ]);
    const loader = new HistoryLoader(manager);
    const result = await loader.load("session-1");
    expect(result.entries.map((e) => e.summary.sessionId)).toEqual(["s3", "s2", "s1"]);
  });

  it("respects maxHistorySessions", async () => {
    const now = Date.now();
    const sessions = [1, 2, 3, 4, 5].map((i) =>
      makeSummary({ sessionId: `s${i}`, timestamp: now - (5 - i) * 60000 }),
    );
    const manager = makeMockManager(
      sessions.map((s, i) => ({
        content: JSON.stringify(s),
        score: 1,
        tags: ["session_summary"] as string[],
        id: `m${i}`,
      })),
    );
    const loader = new HistoryLoader(manager, { maxHistorySessions: 2 });
    const result = await loader.load("session-1");
    expect(result.entries).toHaveLength(2);
    // Most recent 2 (s5, s4)
    expect(result.entries[0].summary.sessionId).toBe("s5");
    expect(result.entries[1].summary.sessionId).toBe("s4");
  });

  it("filters by maxAgeHours", async () => {
    const old = makeSummary({ sessionId: "s1", timestamp: Date.now() - 100 * 3600000 });
    const recent = makeSummary({ sessionId: "s2", timestamp: Date.now() - 1000 });
    const manager = makeMockManager([
      { content: JSON.stringify(old), score: 1, tags: ["session_summary"], id: "m1" },
      { content: JSON.stringify(recent), score: 1, tags: ["session_summary"], id: "m2" },
    ]);
    const loader = new HistoryLoader(manager, { maxAgeHours: 24 });
    const result = await loader.load("session-1");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].summary.sessionId).toBe("s2");
    expect(result.filteredByAge).toBeGreaterThan(0);
  });

  it("format full mode creates proper blocks", () => {
    const summary = makeSummary({
      sessionId: "s1",
      theme: "deploy kubernetes",
      pendingTasks: ["fix helm chart", "update config"],
      keyPoints: ["use Redis cache"],
      entities: ["k8s", "helm"],
    });
    const loader = new HistoryLoader(makeMockManager([]));
    const formatted = (loader as any)._formatEntries(
      [{ summary, memoryId: "m1", storedAt: summary.timestamp }],
      "full",
    );
    expect(formatted).toContain("[Previous Session: s1]");
    expect(formatted).toContain("Theme: deploy kubernetes");
    expect(formatted).toContain("Pending Tasks: fix helm chart; update config");
    expect(formatted).toContain("Key Points: use Redis cache");
    expect(formatted).toContain("Entities: k8s, helm");
  });

  it("format compact mode creates single block", () => {
    const s1 = makeSummary({ sessionId: "s1", theme: "deploy", pendingTasks: ["fix bug"] });
    const s2 = makeSummary({ sessionId: "s2", theme: "testing" });
    const loader = new HistoryLoader(makeMockManager([]));
    const formatted = (loader as any)._formatEntries(
      [
        { summary: s1, memoryId: "m1", storedAt: s1.timestamp },
        { summary: s2, memoryId: "m2", storedAt: s2.timestamp },
      ],
      "compact",
    );
    expect(formatted).toContain("[Previous Sessions]");
    expect(formatted).toContain("Session s1");
    expect(formatted).toContain("Session s2");
    expect(formatted).toContain("deploy");
    expect(formatted).toContain("testing");
  });

  it("format returns empty string for empty entries", () => {
    const loader = new HistoryLoader(makeMockManager([]));
    const formatted = (loader as any)._formatEntries([], "full");
    expect(formatted).toBe("");
  });

  it("load with disabled injectMode", async () => {
    const manager = makeMockManager([]);
    const loader = new HistoryLoader(manager, { injectMode: "disabled" } as any);
    const result = await loader.load("session-1");
    expect(result.formatted).toBe("");
    expect(result.entries).toHaveLength(0);
  });
});
