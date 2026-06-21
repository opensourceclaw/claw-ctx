import { describe, it, expect } from "vitest";
import { VersionHistory } from "../../src/evolution/version-history.js";
import type { ContextSnapshot } from "../../src/evolution/types.js";

function makeSnapshot(overrides?: Partial<ContextSnapshot>): ContextSnapshot {
  return {
    id: "snap-1",
    sessionId: "sess-1",
    timestamp: 1000,
    strategy: "selective_recall",
    taskType: "coding",
    input: { query: "test", budget: 4000, topK: 10 },
    output: { selectedItems: [], tokenCount: 0, itemKeys: [] },
    ...overrides,
  };
}

describe("VersionHistory", () => {
  it("append and getLatest roundtrip", () => {
    const vh = new VersionHistory();
    const snap = makeSnapshot({ id: "s1" });
    vh.append(snap);
    expect(vh.size()).toBe(1);
    expect(vh.getLatest()).toEqual(snap);
  });

  it("max snapshots sliding window", () => {
    const vh = new VersionHistory();
    for (let i = 0; i < 210; i++) {
      vh.append(makeSnapshot({ id: `s${i}`, timestamp: i }));
    }
    expect(vh.size()).toBe(200);
    // Oldest (id "s0") should be dropped
    expect(vh.getLatest()!.id).toBe("s209");
  });

  it("getBySession filters correctly", () => {
    const vh = new VersionHistory();
    vh.append(makeSnapshot({ id: "a", sessionId: "sess-A" }));
    vh.append(makeSnapshot({ id: "b", sessionId: "sess-B" }));
    vh.append(makeSnapshot({ id: "c", sessionId: "sess-A" }));
    expect(vh.getBySession("sess-A")).toHaveLength(2);
    expect(vh.getBySession("sess-B")).toHaveLength(1);
  });

  it("getByTimeRange filters correctly", () => {
    const vh = new VersionHistory();
    vh.append(makeSnapshot({ id: "a", timestamp: 100 }));
    vh.append(makeSnapshot({ id: "b", timestamp: 200 }));
    vh.append(makeSnapshot({ id: "c", timestamp: 300 }));
    expect(vh.getByTimeRange(150, 250)).toHaveLength(1);
    expect(vh.getByTimeRange(150, 250)[0].id).toBe("b");
  });

  it("getByStrategy filters correctly", () => {
    const vh = new VersionHistory();
    vh.append(makeSnapshot({ id: "a", strategy: "aggressive_recall" }));
    vh.append(makeSnapshot({ id: "b", strategy: "minimal_context" }));
    vh.append(makeSnapshot({ id: "c", strategy: "aggressive_recall" }));
    expect(vh.getByStrategy("aggressive_recall")).toHaveLength(2);
    expect(vh.getByStrategy("drift_adaptive")).toHaveLength(0);
  });

  it("getAll returns copy", () => {
    const vh = new VersionHistory();
    vh.append(makeSnapshot({ id: "a" }));
    const all = vh.getAll();
    all.push(makeSnapshot({ id: "b" }));
    expect(vh.size()).toBe(1); // original unchanged
  });

  it("export returns valid JSON", () => {
    const vh = new VersionHistory();
    vh.append(makeSnapshot({ id: "s1" }));
    vh.append(makeSnapshot({ id: "s2" }));
    const json = vh.export();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).toBe("s1");
  });

  it("reset clears all", () => {
    const vh = new VersionHistory();
    vh.append(makeSnapshot());
    vh.reset();
    expect(vh.size()).toBe(0);
    expect(vh.getLatest()).toBeUndefined();
  });
});
