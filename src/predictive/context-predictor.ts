import type { TaskType } from "../adaptive/task-type-detector.js";
import type { PredictedItem, PredictionResult, ContextHistory } from "./types.js";
import { PredictionEngine } from "./prediction-engine.js";

/** ContextPredictor — predicts future context needs from history. */
export class ContextPredictor {
  private engine: PredictionEngine;

  constructor(engine?: PredictionEngine) {
    this.engine = engine ?? new PredictionEngine();
  }

  predict(taskType: TaskType, topK?: number): PredictionResult {
    const k = topK ?? 10;
    const freqItems = this.engine.getTopFrequent(taskType, k);
    const coItems = this.engine.getCoOccurring(taskType, Math.ceil(k / 2));

    // ponytail: merge + dedup by key, O(n) with Set
    const seen = new Set<string>();
    const merged: PredictedItem[] = [];
    for (const item of [...freqItems, ...coItems]) {
      if (!seen.has(item.key)) {
        seen.add(item.key);
        merged.push(item);
      }
    }
    merged.sort((a, b) => b.confidence - a.confidence);
    return {
      items: merged.slice(0, k),
      taskType,
      timestamp: Date.now(),
    };
  }

  update(history: ContextHistory[]): void {
    this.engine.ingest(history);
  }
}
