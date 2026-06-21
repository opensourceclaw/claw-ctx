import { describe, it, expect } from "vitest";
import { PredictionEngine } from "../../src/predictive/prediction-engine.js";

describe("PredictionEngine", () => {
  it("ingest builds frequency map", () => {
    const engine = new PredictionEngine();
    engine.ingest([
      { taskType: "coding", contextUsed: ["typescript", "compile"], timestamp: 1 },
      { taskType: "coding", contextUsed: ["typescript", "deploy"], timestamp: 2 },
    ]);
    const result = engine.getTopFrequent("coding", 5);
    expect(result).toHaveLength(3);
    expect(result[0].key).toBe("typescript");
    expect(result[0].confidence).toBeGreaterThan(result[1].confidence);
    expect(result[0].source).toBe("frequency");
  });

  it("getTopFrequent returns top K", () => {
    const engine = new PredictionEngine();
    engine.ingest([
      { taskType: "coding", contextUsed: ["a"], timestamp: 1 },
      { taskType: "coding", contextUsed: ["b"], timestamp: 2 },
      { taskType: "coding", contextUsed: ["c"], timestamp: 3 },
      { taskType: "coding", contextUsed: ["a", "b"], timestamp: 4 },
    ]);
    const result = engine.getTopFrequent("coding", 2);
    expect(result).toHaveLength(2);
    expect(result[0].confidence).toBeGreaterThanOrEqual(result[1].confidence);
  });

  it("empty history returns empty array", () => {
    const engine = new PredictionEngine();
    expect(engine.getTopFrequent("coding", 5)).toEqual([]);
    expect(engine.getCoOccurring("coding", 5)).toEqual([]);
  });

  it("getCoOccurring finds co-keys outside top-frequent set", () => {
    // ponytail: >10 unique keys so some co-occurring keys fall outside taskKeys top-10
    const engine = new PredictionEngine();
    // k0-k9 are common (100 occurrences each), k10-k14 are rare (1 each)
    for (let i = 0; i < 100; i++) {
      engine.ingest([{
        taskType: "coding",
        contextUsed: ["k0", "k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9"],
        timestamp: i,
      }]);
    }
    // One occurrence: k0 appears with k10 (rare, co-occurring)
    engine.ingest([{
      taskType: "coding",
      contextUsed: ["k0", "k10"],
      timestamp: 100,
    }]);
    const result = engine.getCoOccurring("coding", 5);
    // k10 co-occurs with k0 but is NOT in top-10 freq keys → should appear
    expect(result.length).toBeGreaterThan(0);
    const k10 = result.find((r) => r.key === "k10");
    expect(k10).toBeDefined();
    expect(k10!.source).toBe("co-occurrence");
    expect(k10!.confidence).toBeLessThanOrEqual(0.7);
  });

  it("getSequencePattern predicts from last keys", () => {
    const engine = new PredictionEngine();
    engine.ingest([
      { taskType: "coding", contextUsed: ["auth", "session"], timestamp: 1 },
      { taskType: "coding", contextUsed: ["auth", "session", "token"], timestamp: 2 },
    ]);
    const result = engine.getSequencePattern(["auth", "session"]);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r.source === "sequence")).toBe(true);
    expect(result.every((r) => r.confidence <= 0.5)).toBe(true);
  });

  it("getSequencePattern excludes input keys", () => {
    const engine = new PredictionEngine();
    engine.ingest([
      { taskType: "coding", contextUsed: ["auth", "token"], timestamp: 1 },
    ]);
    const result = engine.getSequencePattern(["auth"]);
    expect(result.every((r) => r.key !== "auth")).toBe(true);
  });

  it("sliding window drops oldest entries", () => {
    const engine = new PredictionEngine();
    // ponytail: maxHistory=500, force by direct access — use ingest with 500+ entries
    const history = Array.from({ length: 510 }, (_, i) => ({
      taskType: "coding" as const,
      contextUsed: [`key${i}`],
      timestamp: i,
    }));
    engine.ingest(history);
    // Should still work without error; oldest 10 entries were shifted
    const result = engine.getTopFrequent("coding", 5);
    expect(result.length).toBeGreaterThan(0);
  });

  it("reset clears all state", () => {
    const engine = new PredictionEngine();
    engine.ingest([
      { taskType: "coding", contextUsed: ["typescript"], timestamp: 1 },
    ]);
    engine.reset();
    expect(engine.getTopFrequent("coding", 5)).toEqual([]);
    expect(engine.getCoOccurring("coding", 5)).toEqual([]);
    expect(engine.getSequencePattern(["typescript"])).toEqual([]);
  });
});
