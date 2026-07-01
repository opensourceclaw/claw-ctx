/**
 * claw-ctx session-resume module — Redundancy Evaluator
 *
 * Evaluates redundancy: how much duplicate/irrelevant content.
 *
 * v5.6.0: Initial implementation
 */

import type { HistoryEntry } from "./types.js";

export interface RedundancyResult {
  score: number;
  duplicateLineCount: number;
  totalLineCount: number;
}

export class RedundancyEvaluator {
  /** Similarity threshold for considering content duplicate */
  private static readonly SIMILARITY_THRESHOLD = 0.7;

  /** Maximum entries to sample for Jaccard comparison (performance) */
  private static readonly MAX_SAMPLE_SIZE = 30;

  /**
   * Evaluate redundancy: how much duplicate/irrelevant content.
   *
   * Algorithm:
   * 1. For each pair of adjacent entries, compute Jaccard similarity on keyPoints
   * 2. If similarity > 0.7, flag as duplicate
   * 3. Count duplicate + irrelevant lines
   * 4. Score = 1 − (duplicate_lines / total_lines)
   */
  evaluate(entries: HistoryEntry[], formatted: string): RedundancyResult {
    // Edge case: no entries
    if (entries.length === 0) {
      return { score: 1.0, duplicateLineCount: 0, totalLineCount: 0 };
    }

    // Edge case: single entry
    if (entries.length === 1) {
      const lines = formatted.split("\n").filter(l => l.trim().length > 0);
      return { score: 1.0, duplicateLineCount: 0, totalLineCount: lines.length };
    }

    // Count lines in formatted output
    const lines = formatted.split("\n").filter(l => l.trim().length > 0);
    const totalLineCount = lines.length;

    // Find duplicate content via Jaccard similarity
    // Performance: sample if too many entries
    const sampleSize = Math.min(RedundancyEvaluator.MAX_SAMPLE_SIZE, entries.length);
    const sampledEntries = entries.slice(0, sampleSize);

    let duplicateLineCount = 0;

    for (let i = 0; i < sampledEntries.length - 1; i++) {
      const current = sampledEntries[i];
      const next = sampledEntries[i + 1];

      // Check keyPoints similarity
      const similarity = this._jaccardSimilarity(
        current.summary.keyPoints,
        next.summary.keyPoints
      );

      if (similarity > RedundancyEvaluator.SIMILARITY_THRESHOLD) {
        // Count lines from the less relevant entry as duplicate
        const currentLines = current.summary.keyPoints.length;
        duplicateLineCount += Math.ceil(currentLines * similarity);
      }
    }

    // Check for exact line duplicates (case-insensitive)
    const seenLines = new Set<string>();
    for (const line of lines) {
      const normalized = line.toLowerCase().trim();
      if (seenLines.has(normalized)) {
        duplicateLineCount++;
      } else {
        seenLines.add(normalized);
      }
    }

    // Calculate score (avoid division by zero)
    const score = totalLineCount > 0
      ? Math.max(0, 1 - duplicateLineCount / totalLineCount)
      : 1.0;

    return { score, duplicateLineCount, totalLineCount };
  }

  /**
   * Calculate Jaccard similarity between two string arrays.
   * Jaccard = |intersection| / |union|
   */
  private _jaccardSimilarity(a: string[], b: string[]): number {
    if (a.length === 0 && b.length === 0) return 1.0;
    if (a.length === 0 || b.length === 0) return 0.0;

    const setA = new Set(a.map(s => s.toLowerCase()));
    const setB = new Set(b.map(s => s.toLowerCase()));

    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) {
        intersection++;
      }
    }

    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0.0;
  }
}
