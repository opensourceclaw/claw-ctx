import { describe, it, expect } from "vitest";
import { ChangePatternAnalyzer } from "../../src/evolution/change-analyzer.js";
import type { ContextSnapshot } from "../../src/evolution/types.js";

function makeSnap(overrides?: Partial<ContextSnapshot>): ContextSnapshot {
  return {
    id: "snap-1",
    sessionId: "sess-1",
    timestamp: 1000,
    strategy: "selective_recall",
    taskType: "coding",
    input: { query: "test", budget: 4000, topK: 10 },
    output: {
      selectedItems: [],
      tokenCount: 0,
      itemKeys: [],
    },
    ...overrides,
  };
}

describe("ChangePatternAnalyzer", () => {
  const analyzer = new ChangePatternAnalyzer();

  it("diff detects additions", () => {
    const prev = makeSnap({
      output: { selectedItems: [{ content: "old", score: 0.9 }], tokenCount: 0, itemKeys: ["old"] },
    });
    const curr = makeSnap({
      id: "snap-2",
      output: {
        selectedItems: [
          { content: "old", score: 0.9 },
          { content: "new item", score: 0.7 },
        ],
        tokenCount: 0,
        itemKeys: ["old", "new item"],
      },
    });
    const report = analyzer.diff(prev, curr);
    expect(report.additions).toHaveLength(1);
    expect(report.additions[0].content).toBe("new item");
    expect(report.deletions).toHaveLength(0);
  });

  it("diff detects deletions", () => {
    const prev = makeSnap({
      output: {
        selectedItems: [
          { content: "keep", score: 0.8 },
          { content: "drop", score: 0.3 },
        ],
        tokenCount: 0,
        itemKeys: ["keep", "drop"],
      },
    });
    const curr = makeSnap({
      id: "snap-2",
      output: { selectedItems: [{ content: "keep", score: 0.8 }], tokenCount: 0, itemKeys: ["keep"] },
    });
    const report = analyzer.diff(prev, curr);
    expect(report.deletions).toHaveLength(1);
    expect(report.deletions[0]).toContain("drop");
  });

  it("diff detects modifications (score delta > 0.01)", () => {
    const prev = makeSnap({
      output: { selectedItems: [{ content: "item", score: 0.5 }], tokenCount: 0, itemKeys: ["item"] },
    });
    const curr = makeSnap({
      id: "snap-2",
      output: { selectedItems: [{ content: "item", score: 0.8 }], tokenCount: 0, itemKeys: ["item"] },
    });
    const report = analyzer.diff(prev, curr);
    expect(report.modifications).toHaveLength(1);
    expect(report.modifications[0].key).toContain("item");
    expect(report.modifications[0].delta).toBeCloseTo(0.3, 1);
  });

  it("diff ignores tiny score changes (≤0.01)", () => {
    const prev = makeSnap({
      output: { selectedItems: [{ content: "item", score: 0.500 }], tokenCount: 0, itemKeys: ["item"] },
    });
    const curr = makeSnap({
      id: "snap-2",
      output: { selectedItems: [{ content: "item", score: 0.505 }], tokenCount: 0, itemKeys: ["item"] },
    });
    const report = analyzer.diff(prev, curr);
    expect(report.modifications).toHaveLength(0);
    expect(report.stability).toBe(1);
  });

  it("diff stability = 1 for identical snapshots", () => {
    const items = [{ content: "same", score: 0.5 }];
    const prev = makeSnap({ output: { selectedItems: items, tokenCount: 0, itemKeys: ["same"] } });
    const curr = makeSnap({ id: "snap-2", output: { selectedItems: items, tokenCount: 0, itemKeys: ["same"] } });
    const report = analyzer.diff(prev, curr);
    expect(report.stability).toBe(1);
    expect(report.additions).toHaveLength(0);
    expect(report.deletions).toHaveLength(0);
  });

  it("diff empty items", () => {
    const prev = makeSnap();
    const curr = makeSnap({ id: "snap-2" });
    const report = analyzer.diff(prev, curr);
    expect(report.stability).toBe(1);
    expect(report.additions).toHaveLength(0);
    expect(report.deletions).toHaveLength(0);
  });

  it("analyzeSeries computes avg stability", () => {
    const s1 = makeSnap({ output: { selectedItems: [{ content: "a", score: 0.5 }], tokenCount: 0, itemKeys: ["a"] } });
    const s2 = makeSnap({ id: "s2", timestamp: 2000, output: { selectedItems: [{ content: "a", score: 0.5 }], tokenCount: 0, itemKeys: ["a"] } });
    const s3 = makeSnap({ id: "s3", timestamp: 3000, output: { selectedItems: [{ content: "b", score: 0.5 }], tokenCount: 0, itemKeys: ["b"] } });
    const result = analyzer.analyzeSeries([s1, s2, s3]);
    expect(result.totalSnapshots).toBe(3);
    expect(result.avgStability).toBeLessThan(1); // s2→s3 has change
    expect(result.volatilityTrend).toHaveLength(2);
  });

  it("analyzeSeries single snapshot", () => {
    const s1 = makeSnap();
    const result = analyzer.analyzeSeries([s1]);
    expect(result.totalSnapshots).toBe(1);
    expect(result.avgStability).toBe(1);
    expect(result.volatilityTrend).toHaveLength(0);
  });

  it("analyzeSeries tracks frequent additions", () => {
    const items_a = [{ content: "always-there", score: 0.5 }, { content: "added-1", score: 0.3 }];
    const items_b = [{ content: "always-there", score: 0.5 }, { content: "added-2", score: 0.3 }];
    const s1 = makeSnap({ output: { selectedItems: [{ content: "always-there", score: 0.5 }], tokenCount: 0, itemKeys: ["always-there"] } });
    const s2 = makeSnap({ id: "s2", timestamp: 2000, output: { selectedItems: items_a, tokenCount: 0, itemKeys: ["always-there", "added-1"] } });
    const s3 = makeSnap({ id: "s3", timestamp: 3000, output: { selectedItems: items_b, tokenCount: 0, itemKeys: ["always-there", "added-2"] } });
    const result = analyzer.analyzeSeries([s1, s2, s3]);
    expect(result.frequentAdditions.length).toBeGreaterThan(0);
    expect(result.frequentDeletions.length).toBeGreaterThan(0);
  });
});
