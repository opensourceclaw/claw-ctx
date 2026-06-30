/**
 * claw-ctx session-resume module — Hierarchical Loader
 *
 * Orchestrates time-based bucketing and consolidation of session history.
 * Main entry point for hierarchical history loading.
 *
 * v5.4.0: Initial implementation
 */

import type { SessionSummary } from "./types.js";
import { TimeBucket, type BucketResult, type TimeBucketConfig, DEFAULT_TIME_BUCKET_CONFIG } from "./time-bucket.js";
import { BucketConsolidator, type ConsolidationResult, type BucketConsolidatorConfig, DEFAULT_CONSOLIDATOR_CONFIG } from "./bucket-consolidator.js";

export interface HierarchicalLoaderConfig {
  timeBucket?: Partial<TimeBucketConfig>;
  consolidator?: Partial<BucketConsolidatorConfig>;
  /** Format mode for output (default: "full") */
  injectMode: "full" | "compact";
}

export interface HierarchicalHistory {
  level1: SessionSummary[];
  level2: SessionSummary[];
  level3: SessionSummary[];
  allPendingTasks: string[];
  entities: Map<string, number>;
}

export class HierarchicalLoader {
  private _timeBucket: TimeBucket;
  private _consolidator: BucketConsolidator;
  private _injectMode: "full" | "compact";

  constructor(config?: Partial<HierarchicalLoaderConfig>) {
    this._timeBucket = new TimeBucket(config?.timeBucket);
    this._consolidator = new BucketConsolidator(config?.consolidator);
    this._injectMode = config?.injectMode ?? "full";
  }

  /**
   * Load and process session summaries into hierarchical history.
   *
   * @param summaries - Raw session summaries from claw-mem
   * @param now - Current timestamp (for testing)
   * @returns HierarchicalHistory with formatted result
   */
  load(summaries: SessionSummary[], now: number = Date.now()): HierarchicalHistory {
    // Step 1: Bucket by time
    const bucketed = this._timeBucket.bucket(summaries, now);

    // Step 2: Consolidate each level
    const consolidated = this._consolidator.consolidate(
      bucketed.recent,
      bucketed.thisWeek,
      bucketed.older
    );

    // Step 3: Combine pending tasks from level 1 and level 2 (level 3 drops them)
    // Dedup pending tasks to avoid showing same task multiple times
    const allPendingTasks = [
      ...consolidated.level1.allPendingTasks,
      ...consolidated.level2.allPendingTasks,
    ];
    const uniquePendingTasks = [...new Set(allPendingTasks)];

    // Step 4: Aggregate entities from all levels
    const entities = new Map<string, number>();
    for (const [entity, count] of consolidated.level1.entities) {
      entities.set(entity, (entities.get(entity) || 0) + count);
    }
    for (const [entity, count] of consolidated.level2.entities) {
      entities.set(entity, (entities.get(entity) || 0) + count);
    }
    for (const [entity, count] of consolidated.level3.entities) {
      entities.set(entity, (entities.get(entity) || 0) + count);
    }

    return {
      level1: consolidated.level1.summaries,
      level2: consolidated.level2.summaries,
      level3: consolidated.level3.summaries,
      allPendingTasks: uniquePendingTasks,
      entities,
    };
  }

  /**
   * Format hierarchical history for system prompt injection.
   *
   * @param history - Hierarchical history from load()
   * @returns Formatted string for injection
   */
  format(history: HierarchicalHistory): string {
    const sections: string[] = [];

    // Level 1: Recent sessions
    if (history.level1.length > 0) {
      sections.push(this._formatLevel1(history.level1));
    }

    // Level 2: This week
    if (history.level2.length > 0) {
      sections.push(this._formatLevel2(history.level2, history.allPendingTasks));
    }

    // Level 3: Earlier
    if (history.level3.length > 0) {
      sections.push(this._formatLevel3(history.level3));
    }

    return sections.join('\n\n');
  }

  /**
   * Format Level 1 (recent sessions) — full detail.
   */
  private _formatLevel1(summaries: SessionSummary[]): string {
    if (this._injectMode === "compact") {
      const lines = ["[Recent Sessions]"];
      for (const s of summaries) {
        const tasks = s.pendingTasks.length > 0 ? ` | tasks: ${s.pendingTasks.slice(0, 2).join('; ')}` : '';
        lines.push(`Session ${s.sessionId}: ${s.theme}${tasks}`);
      }
      return lines.join('\n');
    }

    // Full mode
    const blocks: string[] = [];
    for (const s of summaries) {
      const lines = [`[Session: ${s.sessionId}]`, `Theme: ${s.theme}`];
      if (s.pendingTasks.length > 0) {
        lines.push(`Pending Tasks: ${s.pendingTasks.join('; ')}`);
      }
      if (s.keyPoints.length > 0) {
        lines.push(`Key Points: ${s.keyPoints.join('; ')}`);
      }
      if (s.entities.length > 0) {
        lines.push(`Entities: ${s.entities.join(', ')}`);
      }
      blocks.push(lines.join('\n'));
    }
    return blocks.join('\n---\n');
  }

  /**
   * Format Level 2 (this week) — consolidated.
   */
  private _formatLevel2(summaries: SessionSummary[], allPendingTasks: string[]): string {
    const lines = ["[This Week — Key Activity]"];

    // List each day's theme
    for (const s of summaries) {
      lines.push(`• ${s.theme}`);
      if (s.keyPoints.length > 0) {
        lines.push(`  Key: ${s.keyPoints.slice(0, 3).join(', ')}`);
      }
    }

    // Combined pending tasks (already deduped in load())
    if (allPendingTasks.length > 0) {
      lines.push(`Pending: ${allPendingTasks.join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Format Level 3 (earlier) — compressed monthly.
   */
  private _formatLevel3(summaries: SessionSummary[]): string {
    const lines = ["[Earlier — Summary]"];

    for (const s of summaries) {
      const monthName = this._getMonthName(s.timestamp);
      lines.push(`${monthName}: ${s.theme}`);
    }

    // Top entities across level 3
    const allEntities = [...new Set(summaries.flatMap(s => s.entities))];
    if (allEntities.length > 0) {
      lines.push(`Key entities: ${allEntities.slice(0, 10).join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Get month name from timestamp.
   */
  private _getMonthName(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
}
