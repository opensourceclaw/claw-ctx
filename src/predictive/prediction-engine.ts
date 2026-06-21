import type { TaskType } from "../adaptive/task-type-detector.js";
import type { PredictedItem, ContextHistory } from "./types.js";

/** PredictionEngine — frequency, co-occurrence, and sequence analysis. */
export class PredictionEngine {
  private taskFreq = new Map<TaskType, Map<string, number>>();
  private coOccurrence = new Map<string, Map<string, number>>();
  private sequence: Array<{ taskType: TaskType; keys: string[]; ts: number }> = [];
  private maxHistory = 500; // ponytail: sliding window; upgrade to time-decay if staleness matters

  ingest(history: ContextHistory[]): void {
    for (const h of history) {
      // Frequency
      let freq = this.taskFreq.get(h.taskType);
      if (!freq) { freq = new Map(); this.taskFreq.set(h.taskType, freq); }
      for (const key of h.contextUsed) {
        freq.set(key, (freq.get(key) ?? 0) + 1);
      }

      // Co-occurrence
      for (const a of h.contextUsed) {
        let co = this.coOccurrence.get(a);
        if (!co) { co = new Map(); this.coOccurrence.set(a, co); }
        for (const b of h.contextUsed) {
          if (a !== b) co.set(b, (co.get(b) ?? 0) + 1);
        }
      }

      // Sequence
      this.sequence.push({ taskType: h.taskType, keys: h.contextUsed, ts: h.timestamp });
      if (this.sequence.length > this.maxHistory) {
        this.sequence.shift();
      }
    }
  }

  getTopFrequent(taskType: TaskType, topK: number): PredictedItem[] {
    const freq = this.taskFreq.get(taskType);
    if (!freq || freq.size === 0) return [];
    const total = [...freq.values()].reduce((s, v) => s + v, 0);
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([key, count]) => ({
        key,
        confidence: Math.min(0.95, count / (total || 1)),
        source: "frequency" as const,
      }));
  }

  getCoOccurring(taskType: TaskType, topK: number): PredictedItem[] {
    const freq = this.taskFreq.get(taskType);
    if (!freq) return [];
    const taskKeys = new Set([...freq.keys()].slice(0, 10));

    const scores = new Map<string, number>();
    for (const key of taskKeys) {
      const co = this.coOccurrence.get(key);
      if (co) {
        for (const [cokey, count] of co) {
          if (!taskKeys.has(cokey)) {
            scores.set(cokey, (scores.get(cokey) ?? 0) + count);
          }
        }
      }
    }
    const maxScore = Math.max(1, ...[...scores.values()]);
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([key, score]) => ({
        key,
        confidence: Math.min(0.7, score / maxScore),
        source: "co-occurrence" as const,
      }));
  }

  getSequencePattern(lastKeys: string[]): PredictedItem[] {
    const candidates = new Map<string, number>();
    for (const key of lastKeys.slice(-3)) {
      const co = this.coOccurrence.get(key);
      if (co) {
        for (const [cokey, count] of co) {
          if (!lastKeys.includes(cokey)) {
            candidates.set(cokey, (candidates.get(cokey) ?? 0) + count);
          }
        }
      }
    }
    const max = Math.max(1, ...[...candidates.values()]);
    return [...candidates.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, score]) => ({
        key,
        confidence: Math.min(0.5, score / max),
        source: "sequence" as const,
      }));
  }

  reset(): void {
    this.taskFreq.clear();
    this.coOccurrence.clear();
    this.sequence = [];
  }
}
