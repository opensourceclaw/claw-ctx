/**
 * claw-ctx session-resume module — Time Bucket Utility
 *
 * Pure time-based bucketing logic for hierarchical history.
 * No external dependencies — fully testable in isolation.
 *
 * v5.4.0: Initial implementation
 */

import type { SessionSummary } from "./types.js";

export type BucketLevel = "recent" | "this_week" | "older";

export interface BucketResult {
  recent: SessionSummary[];    // Last N sessions (default: 3)
  thisWeek: SessionSummary[];  // Within 7 days, excluding recent
  older: SessionSummary[];     // Remaining within maxAgeDays
}

export interface TimeBucketConfig {
  /** Number of most recent sessions to treat as "recent" (default: 3) */
  recentSessionCount: number;
  /** Days threshold for "this_week" bucket (default: 7) */
  weekBoundaryDays: number;
  /** Maximum age in days for "older" bucket (default: 30) */
  maxAgeDays: number;
}

export const DEFAULT_TIME_BUCKET_CONFIG: TimeBucketConfig = {
  recentSessionCount: 3,
  weekBoundaryDays: 7,
  maxAgeDays: 30,
};

export class TimeBucket {
  private _config: TimeBucketConfig;

  constructor(config?: Partial<TimeBucketConfig>) {
    this._config = { ...DEFAULT_TIME_BUCKET_CONFIG, ...config };
  }

  /**
   * Bucket session summaries by time-based levels.
   *
   * Algorithm:
   * 1. Sort summaries by timestamp descending (most recent first)
   * 2. Take top N as "recent" (level 1)
   * 3. Filter remaining within week boundary as "this_week" (level 2)
   * 4. Filter remaining within maxAgeDays as "older" (level 3)
   *
   * @param summaries - Array of session summaries to bucket
   * @param now - Current timestamp in milliseconds (for testing)
   * @returns Bucketed summaries by level
   */
  bucket(summaries: SessionSummary[], now: number = Date.now()): BucketResult {
    if (summaries.length === 0) {
      return { recent: [], thisWeek: [], older: [] };
    }

    // Sort by timestamp descending
    const sorted = [...summaries].sort((a, b) => b.timestamp - a.timestamp);

    // Calculate time boundaries
    const weekBoundaryMs = now - this._config.weekBoundaryDays * 24 * 60 * 60 * 1000;
    const maxAgeMs = now - this._config.maxAgeDays * 24 * 60 * 60 * 1000;

    // Split into levels
    const recent = sorted.slice(0, this._config.recentSessionCount);
    const remaining = sorted.slice(this._config.recentSessionCount);

    const thisWeek: SessionSummary[] = [];
    const older: SessionSummary[] = [];

    for (const summary of remaining) {
      if (summary.timestamp < maxAgeMs) {
        // Too old, skip entirely
        continue;
      }
      if (summary.timestamp >= weekBoundaryMs) {
        thisWeek.push(summary);
      } else {
        older.push(summary);
      }
    }

    return { recent, thisWeek, older };
  }

  /**
   * Get current configuration.
   */
  getConfig(): TimeBucketConfig {
    return { ...this._config };
  }

  /**
   * Update configuration at runtime.
   */
  updateConfig(config: Partial<TimeBucketConfig>): void {
    this._config = { ...this._config, ...config };
  }
}
