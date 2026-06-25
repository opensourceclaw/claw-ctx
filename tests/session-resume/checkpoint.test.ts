import { describe, it, expect, vi } from "vitest";
import { CheckpointManager } from "../../src/session-resume/checkpoint.js";
import type { SessionState } from "../../src/session-state-extractor.js";

function makeMockManager(overrides?: Partial<{
  sessionSnapshot: unknown;
  sessionGetLatest: unknown;
  sessionClose: unknown;
  sessionGetUnclosed: unknown;
}>) {
  return {
    sessionSnapshot: vi.fn().mockResolvedValue({ stored: true, id: "snap_1" }),
    sessionGetLatest: vi.fn().mockResolvedValue(null),
    sessionClose: vi.fn().mockResolvedValue({ closed: true }),
    sessionGetUnclosed: vi.fn().mockResolvedValue({ sessions: [] }),
    ...overrides,
  };
}

function makeSessionState(overrides?: Partial<SessionState>): SessionState {
  return {
    sessionId: "sess_test",
    startedAt: Date.now() - 3600_000,
    entities: [{ name: "checkpoint.ts", type: "file", mentions: 5, firstSeen: "" }],
    decisions: [{ description: "Use feature detection", actor: "Jarvis", confidence: 0.9, context: "" }],
    topics: [{ label: "session", weight: 1.0, firstMentioned: Date.now() }],
    actions: [],
    lastUpdated: Date.now(),
    messageCount: 10,
    ...overrides,
  };
}

describe("CheckpointManager", () => {
  // 1
  it("supported returns true when claw-mem >= v6.27.0", () => {
    const mgr = makeMockManager();
    const cm = new CheckpointManager(mgr);
    expect(cm.supported).toBe(true);
  });

  // 2
  it("supported returns false when methods missing", () => {
    const mgr = makeMockManager({
      sessionSnapshot: undefined,
      sessionGetUnclosed: undefined,
    });
    const cm = new CheckpointManager(mgr as any);
    expect(cm.supported).toBe(false);
  });

  // 3
  it("checkpoint calls sessionSnapshot when supported", () => {
    const mgr = makeMockManager();
    const state = makeSessionState();
    const cm = new CheckpointManager(mgr, undefined, () => state);
    const ok = cm.checkpoint();
    expect(ok).toBe(true);
    expect(mgr.sessionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot: expect.objectContaining({ sessionId: "sess_test" }) }),
    );
  });

  // 4
  it("checkpoint returns false when unsupported", () => {
    const mgr = makeMockManager({ sessionSnapshot: undefined });
    const cm = new CheckpointManager(mgr as any);
    expect(cm.checkpoint(makeSessionState())).toBe(false);
  });

  // 5
  it("checkpoint returns false when disabled", () => {
    const mgr = makeMockManager();
    const cm = new CheckpointManager(mgr, { mode: "disabled" });
    expect(cm.checkpoint(makeSessionState())).toBe(false);
  });

  // 6
  it("checkpoint obeys every_n_turns interval", () => {
    const mgr = makeMockManager();
    const state = makeSessionState();
    const cm = new CheckpointManager(mgr, { mode: "every_n_turns", interval: 3 }, () => state);

    expect(cm.checkpoint()).toBe(false);  // turn 1
    expect(cm.checkpoint()).toBe(false);  // turn 2
    expect(cm.checkpoint()).toBe(true);   // turn 3
    expect(mgr.sessionSnapshot).toHaveBeenCalledTimes(1);
  });

  // 7
  it("checkpoint returns false with null state", () => {
    const mgr = makeMockManager();
    const cm = new CheckpointManager(mgr, undefined, () => null);
    expect(cm.checkpoint()).toBe(false);
  });

  // 8
  it("getRecoveryContext returns null when unsupported", async () => {
    const mgr = makeMockManager({ sessionGetUnclosed: undefined });
    const cm = new CheckpointManager(mgr as any);
    expect(await cm.getRecoveryContext()).toBeNull();
  });

  // 9
  it("getRecoveryContext returns null when no unclosed sessions", async () => {
    const mgr = makeMockManager();
    const cm = new CheckpointManager(mgr);
    expect(await cm.getRecoveryContext()).toBeNull();
  });

  // 10
  it("getRecoveryContext formats unclosed sessions", async () => {
    const mgr = makeMockManager({
      sessionGetUnclosed: vi.fn().mockResolvedValue({
        sessions: [{
          sessionId: "prev",
          startedAt: Date.now() - 7200_000,
          lastActiveAt: Date.now() - 1000,
          turnCount: 8,
          currentTopic: "Testing",
          recentDecisions: ["Decided to test"],
          pendingItems: ["Write more tests"],
          keyEntities: ["vitest"],
          isClosed: false,
        }],
      }),
    });
    const cm = new CheckpointManager(mgr);
    const ctx = await cm.getRecoveryContext();
    expect(ctx).not.toBeNull();
    expect(ctx).toContain("[Session Recovery]");
    expect(ctx).toContain("Testing");
    expect(ctx).toContain("Decided to test");
    expect(ctx).toContain("Write more tests");
  });

  // 11
  it("bootstrap pre-fetches recovery context", async () => {
    const mgr = makeMockManager({
      sessionGetUnclosed: vi.fn().mockResolvedValue({
        sessions: [{
          sessionId: "interrupted",
          startedAt: Date.now() - 10000,
          lastActiveAt: Date.now() - 500,
          turnCount: 3,
          currentTopic: "Debugging",
          recentDecisions: [],
          pendingItems: [],
          keyEntities: [],
          isClosed: false,
        }],
      }),
    });
    const cm = new CheckpointManager(mgr);
    await cm.bootstrap("new-session");
    const recovery = cm.consumeRecovery();
    expect(recovery).not.toBeNull();
    expect(recovery).toContain("Debugging");
    // second consume returns null (already consumed)
    expect(cm.consumeRecovery()).toBeNull();
  });

  // 12
  it("consumeRecovery returns null without bootstrap", () => {
    const mgr = makeMockManager();
    const cm = new CheckpointManager(mgr);
    expect(cm.consumeRecovery()).toBeNull();
  });

  // 13
  it("closeSession calls sessionClose when supported", async () => {
    const mgr = makeMockManager();
    const cm = new CheckpointManager(mgr);
    expect(await cm.closeSession("sess_x")).toBe(true);
    expect(mgr.sessionClose).toHaveBeenCalledWith({ sessionId: "sess_x" });
  });

  // 14
  it("closeSession returns false when unsupported", async () => {
    const mgr = makeMockManager({ sessionClose: undefined });
    const cm = new CheckpointManager(mgr as any);
    expect(await cm.closeSession("sess_x")).toBe(false);
  });

  // 15
  it("buildSnapshot uses startedAt from state", () => {
    const mgr = makeMockManager();
    const state = makeSessionState({ startedAt: 1719888000000 });
    const cm = new CheckpointManager(mgr, undefined, () => state);
    cm.checkpoint();
    expect(mgr.sessionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({ startedAt: 1719888000000 }),
      }),
    );
  });
});
