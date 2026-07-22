import { describe, it, expect, vi } from "vitest";
import { RecapLoader } from "../../src/session-resume/recap-loader.js";

function makeMockManager(results?: any[]) {
  return {
    search: vi.fn().mockResolvedValue(results ?? []),
  };
}

describe("RecapLoader", () => {
  it("returns null when no results", async () => {
    const mgr = makeMockManager();
    const loader = new RecapLoader(mgr);
    const result = await loader.load();
    expect(result.recap).toBeNull();
    expect(result.formatted).toBeNull();
  });

  // v5.11.4: parseRecap handles JSON from SummaryGenerator
  it("v5.11.4: parseRecap handles JSON from SummaryGenerator", async () => {
    const summaryJson = JSON.stringify({
      theme: "Implementing session continuity",
      pendingTasks: ["Fix P1 recap format", "Fix P2 pendingItems"],
      keyPoints: ["JSON.parse is now primary", "Decisions feed pendingItems"],
      timestamp: 1721660000000,
      sessionId: "sess_json_test",
      messageCount: 42,
    });

    const mgr = makeMockManager([
      {
        content: summaryJson,
        score: 0.95,
        timestamp: 1721660000000,
        metadata: { session_id: "sess_json_test" },
      },
    ]);

    const loader = new RecapLoader(mgr);
    const result = await loader.load("sess_json_test");

    expect(result.recap).not.toBeNull();
    expect(result.recap?.whatWereWeDoing).toBe("Implementing session continuity");
    expect(result.recap?.whatIsNext).toBe("Fix P1 recap format");
    expect(result.formatted).toContain("Implementing session continuity");
    expect(result.formatted).toContain("Fix P1 recap format");
    expect(result.formatted).toContain("Fix P2 pendingItems");
  });

  // v5.11.4: parseRecap falls back to legacy regex for old format
  it("v5.11.4: parseRecap falls back to legacy regex for old format", async () => {
    const legacyContent = `Session Recap: Working on auth feature
Next: Complete the login flow`;

    const mgr = makeMockManager([
      {
        content: legacyContent,
        score: 0.85,
        timestamp: 1721650000000,
        metadata: { session_id: "sess_legacy" },
      },
    ]);

    const loader = new RecapLoader(mgr);
    const result = await loader.load("sess_legacy");

    expect(result.recap).not.toBeNull();
    expect(result.recap?.whatWereWeDoing).toBe("Working on auth feature");
    expect(result.recap?.whatIsNext).toBe("Complete the login flow");
  });

  it("filters by sessionId when provided", async () => {
    const mgr = makeMockManager([
      {
        content: JSON.stringify({ theme: "Session A", timestamp: 1 }),
        score: 0.9,
        metadata: { session_id: "sess_a" },
      },
      {
        content: JSON.stringify({ theme: "Session B", timestamp: 2 }),
        score: 0.9,
        metadata: { session_id: "sess_b" },
      },
    ]);

    const loader = new RecapLoader(mgr);
    const result = await loader.load("sess_b");

    expect(result.recap?.whatWereWeDoing).toBe("Session B");
  });

  it("sorts by timestamp (most recent first)", async () => {
    const mgr = makeMockManager([
      {
        content: JSON.stringify({ theme: "Old session", timestamp: 1000 }),
        score: 0.9,
        timestamp: 1000,
        metadata: {},
      },
      {
        content: JSON.stringify({ theme: "New session", timestamp: 2000 }),
        score: 0.9,
        timestamp: 2000,
        metadata: {},
      },
    ]);

    const loader = new RecapLoader(mgr);
    const result = await loader.load();

    // Should pick the newer one
    expect(result.recap?.whatWereWeDoing).toBe("New session");
  });
});
