/**
 * claw-ctx session-resume module — Freshness Evaluator
 *
 * Evaluates freshness: how recent the context is.
 *
 * v5.6.0: Initial implementation
 */

import type { HistoryEntry } from "./types.js";

export interface FreshnessResult {
  score: number;
}

export class FreshnessEvaluator {
  private _halfLifeMs: number;

  /**
   * @param halfLifeHours - Half-life for exponential decay in hours
   */
  constructor(halfLifeHours: number = 24) {
    this._halfLifeMs = halfLifeHours * 60 * 60 * 1000;
  }

  /**
   * Evaluate freshness: how recent the context is.
   *
   * Algorithm:
   * 1. For each entry, compute age = now − timestamp
   * 2. Apply exponential decay: weight = e^(−age / halfLife)
   * 3. Score = sum(weights) / entry_count
   */
  evaluate(entries: HistoryEntry[]): FreshnessResult {
    // Edge case: no entries
    if (entries.length === 0) {
      return { score: 1.0 };
    }

    const now = Date.now();
    let totalWeight = 0;

    for (const entry of entries) {
      const timestamp = entry.summary.timestamp;

      // Edge case: missing or invalid timestamp
      if (!timestamp || timestamp <= 0 || timestamp > now) {
        // Treat as fresh (weight = 1)
        totalWeight += 1.0;
        continue;
      }

      const ageMs = now - timestamp;

      // Exponential decay: weight = e^(-age / halfLife)
      const weight = Math.exp(-ageMs / this._halfLifeMs);
      totalWeight += weight;
    }

    // Average weight across entries
    const score = totalWeight / entries.length;

    return { score };
  }
}
