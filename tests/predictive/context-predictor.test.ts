import { describe, it, expect } from "vitest";
import { ContextPredictor } from "../../src/predictive/context-predictor.js";
import { PredictionEngine } from "../../src/predictive/prediction-engine.js";

describe("ContextPredictor", () => {
  it("predict merges frequency and co-occurrence items", () => {
    const engine = new PredictionEngine();
    engine.ingest([
      { taskType: "coding", contextUsed: ["typescript", "compile"], timestamp: 1 },
      { taskType: "coding", contextUsed: ["typescript", "compile"], timestamp: 2 },
      { taskType: "coding", contextUsed: ["typescript", "deploy"], timestamp: 3 },
    ]);
    const predictor = new ContextPredictor(engine);
    const result = predictor.predict("coding", 10);
    expect(result.taskType).toBe("coding");
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.timestamp).toBeGreaterThan(0);
    // Should be deduped and sorted by confidence
    for (let i = 1; i < result.items.length; i++) {
      expect(result.items[i - 1].confidence).toBeGreaterThanOrEqual(result.items[i].confidence);
    }
  });

  it("empty engine returns empty prediction", () => {
    const predictor = new ContextPredictor();
    const result = predictor.predict("question", 5);
    expect(result.items).toEqual([]);
    expect(result.taskType).toBe("question");
  });

  it("update delegates to engine", () => {
    const predictor = new ContextPredictor();
    predictor.update([
      { taskType: "debugging", contextUsed: ["error", "stacktrace"], timestamp: 1 },
    ]);
    const result = predictor.predict("debugging", 5);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.some((r) => r.key === "error")).toBe(true);
  });

  it("topK limits result count", () => {
    const engine = new PredictionEngine();
    const history = [
      { taskType: "coding" as const, contextUsed: ["a", "b", "c", "d", "e", "f"], timestamp: 1 },
    ];
    engine.ingest(history);
    const predictor = new ContextPredictor(engine);
    expect(predictor.predict("coding", 3).items.length).toBeLessThanOrEqual(3);
    expect(predictor.predict("coding", 10).items.length).toBeLessThanOrEqual(6);
  });
});
