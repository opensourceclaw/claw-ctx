import { describe, it, expect, vi } from "vitest";
import { SessionResumeManager } from "../../src/session-resume/bootstrap.js";

function makeMockManager() {
  return {
    search: vi.fn().mockResolvedValue([]),
    store: vi.fn().mockResolvedValue({}),
  };
}

function makeMessage(content: string, role = "user") {
  return { role, content };
}

describe("SessionResumeManager", () => {
  it("bootstrap loads history", async () => {
    const mgr = new SessionResumeManager(makeMockManager());
    const result = await mgr.bootstrap("session-1");
    expect(typeof result.historyLoaded).toBe("boolean");
    expect(typeof result.sessionCount).toBe("number");
  });

  it("assemble returns null when no history", () => {
    const mgr = new SessionResumeManager(makeMockManager());
    expect(mgr.assemble()).toBeNull();
  });

  it("assemble returns null in disabled mode", async () => {
    const mgr = new SessionResumeManager(makeMockManager(), { injectMode: "disabled" });
    await mgr.bootstrap("session-1");
    expect(mgr.assemble()).toBeNull();
  });

  it("afterTurn generates and stores summary", async () => {
    const mockMgr = makeMockManager();
    const mgr = new SessionResumeManager(mockMgr);
    const msgs = Array.from({ length: 5 }, (_, i) => makeMessage(`message ${i} about deploy`));
    const result = await mgr.afterTurn("session-1", msgs);
    expect(result.stored).toBe(true);
    expect(result.summary).not.toBeNull();
    expect(result.summary!.sessionId).toBe("session-1");
    expect(mockMgr.store).toHaveBeenCalledWith(
      expect.stringContaining("session-1"),
      "episodic",
      expect.arrayContaining(["session_summary", "continuity"]),
      expect.objectContaining({ sessionId: "session-1" }),
    );
  });

  it("afterTurn skips for < 3 messages", async () => {
    const mockMgr = makeMockManager();
    const mgr = new SessionResumeManager(mockMgr);
    const msgs = [makeMessage("hi")];
    const result = await mgr.afterTurn("session-1", msgs);
    expect(result.stored).toBe(false);
    expect(mockMgr.store).not.toHaveBeenCalled();
  });

  it("afterTurn skips when storeOnEveryTurn false", async () => {
    const mockMgr = makeMockManager();
    const mgr = new SessionResumeManager(mockMgr, { storeOnEveryTurn: false });
    const msgs = Array.from({ length: 5 }, () => makeMessage("test"));
    const result = await mgr.afterTurn("session-1", msgs);
    expect(result.stored).toBe(false);
    expect(mockMgr.store).not.toHaveBeenCalled();
  });

  it("getHistory returns loaded history", async () => {
    const mgr = new SessionResumeManager(makeMockManager());
    expect(mgr.getHistory()).toBeNull();
    await mgr.bootstrap("session-1");
    expect(mgr.getHistory()).not.toBeNull();
  });

  it("reset clears state", () => {
    const mgr = new SessionResumeManager(makeMockManager());
    expect(mgr.getHistory()).toBeNull();
  });

  it("updateConfig changes behavior", async () => {
    const mgr = new SessionResumeManager(makeMockManager(), { injectMode: "full" });
    await mgr.bootstrap("session-1");
    // After bootstrap with no results, assemble should return null
    expect(mgr.assemble()).toBeNull();

    // Switch to disabled
    mgr.updateConfig({ injectMode: "disabled" });
    expect(mgr.assemble()).toBeNull();
  });

  it("getConfig returns current config", () => {
    const mgr = new SessionResumeManager(makeMockManager(), { maxHistorySessions: 5 });
    const config = mgr.getConfig();
    expect(config.maxHistorySessions).toBe(5);
    expect(config.injectMode).toBe("full");
  });
});
