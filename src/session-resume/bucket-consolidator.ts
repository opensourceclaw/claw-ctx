/**
 * claw-ctx session-resume module — Bucket Consolidator
 *
 * Conservative merge strategies for hierarchical history.
 * Based on F9: conservative > aggressive, timely integration.
 *
 * v5.4.0: Initial implementation
 */

import type { SessionSummary } from "./types.js";

export interface ConsolidatedLevel {
  /** Original or merged summaries */
  summaries: SessionSummary[];
  /** Consolidated pending tasks (all levels) */
  allPendingTasks: string[];
  /** Aggregated entities with frequency */
  entities: Map<string, number>;
  /** Whether consolidation was applied */
  wasConsolidated: boolean;
}

export interface ConsolidationResult {
  level1: ConsolidatedLevel;  // Pass-through (no consolidation)
  level2: ConsolidatedLevel;  // Daily grouped, conservative merge
  level3: ConsolidatedLevel;  // Monthly compressed
}

export interface BucketConsolidatorConfig {
  /** Semantic similarity threshold for dedup (default: 0.7) */
  dedupThreshold: number;
  /** Maximum keyPoints to keep per level (default: 10 for L2, 5 for L3) */
  maxKeyPointsLevel2: number;
  maxKeyPointsLevel3: number;
  /** Maximum entities to report (default: 15) */
  maxEntities: number;
}

export const DEFAULT_CONSOLIDATOR_CONFIG: BucketConsolidatorConfig = {
  dedupThreshold: 0.7,
  maxKeyPointsLevel2: 10,
  maxKeyPointsLevel3: 5,
  maxEntities: 15,
};

export class BucketConsolidator {
  private _config: BucketConsolidatorConfig;

  constructor(config?: Partial<BucketConsolidatorConfig>) {
    this._config = { ...DEFAULT_CONSOLIDATOR_CONFIG, ...config };
  }

  /**
   * Consolidate all three bucket levels.
   */
  consolidate(
    recent: SessionSummary[],
    thisWeek: SessionSummary[],
    older: SessionSummary[]
  ): ConsolidationResult {
    return {
      level1: this._consolidateLevel1(recent),
      level2: this._consolidateLevel2(thisWeek),
      level3: this._consolidateLevel3(older),
    };
  }

  /**
   * Level 1: Pass-through (no consolidation).
   * Full detail preserved for recent sessions.
   */
  private _consolidateLevel1(summaries: SessionSummary[]): ConsolidatedLevel {
    const allPendingTasks = summaries.flatMap(s => s.pendingTasks);
    const entities = this._aggregateEntities(summaries);

    return {
      summaries,
      allPendingTasks,
      entities,
      wasConsolidated: false,
    };
  }

  /**
   * Level 2: Conservative merge for this week.
   * - Group by date (daily)
   * - Dedup keyPoints by semantic similarity
   * - Keep ALL pendingTasks
   * - Merge entities
   */
  private _consolidateLevel2(summaries: SessionSummary[]): ConsolidatedLevel {
    if (summaries.length === 0) {
      return { summaries: [], allPendingTasks: [], entities: new Map(), wasConsolidated: false };
    }

    // Group by day
    const byDay = this._groupByDay(summaries);

    // Merge each day's summaries
    const mergedSummaries: SessionSummary[] = [];
    const allPendingTasks: string[] = [];
    const allEntities = new Map<string, number>();

    for (const [day, daySummaries] of byDay) {
      const merged = this._mergeDaily(day, daySummaries);
      mergedSummaries.push(merged);
      allPendingTasks.push(...merged.pendingTasks);
    }

    // Aggregate entities
    for (const summary of summaries) {
      for (const entity of summary.entities) {
        allEntities.set(entity, (allEntities.get(entity) || 0) + 1);
      }
    }

    return {
      summaries: mergedSummaries,
      allPendingTasks,
      entities: allEntities,
      wasConsolidated: true,
    };
  }

  /**
   * Level 3: Monthly compression for older sessions.
   * - Group by month
   * - Extract top themes per month
   * - Aggregate entities (top N by frequency)
   * - Drop pendingTasks (likely completed)
   */
  private _consolidateLevel3(summaries: SessionSummary[]): ConsolidatedLevel {
    if (summaries.length === 0) {
      return { summaries: [], allPendingTasks: [], entities: new Map(), wasConsolidated: false };
    }

    // Group by month
    const byMonth = this._groupByMonth(summaries);

    // Create monthly summaries
    const monthlySummaries: SessionSummary[] = [];
    const allEntities = new Map<string, number>();

    for (const [month, monthSummaries] of byMonth) {
      const compressed = this._compressMonthly(month, monthSummaries);
      monthlySummaries.push(compressed);
    }

    // Aggregate entities (top N by frequency)
    for (const summary of summaries) {
      for (const entity of summary.entities) {
        allEntities.set(entity, (allEntities.get(entity) || 0) + 1);
      }
    }

    // Note: pendingTasks intentionally dropped for level 3
    return {
      summaries: monthlySummaries,
      allPendingTasks: [],  // Empty for level 3
      entities: allEntities,
      wasConsolidated: true,
    };
  }

  // --- Helper Methods ---

  /**
   * Group summaries by calendar day.
   */
  private _groupByDay(summaries: SessionSummary[]): Map<string, SessionSummary[]> {
    const groups = new Map<string, SessionSummary[]>();
    for (const summary of summaries) {
      const date = new Date(summary.timestamp);
      const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      if (!groups.has(dayKey)) {
        groups.set(dayKey, []);
      }
      groups.get(dayKey)!.push(summary);
    }
    return groups;
  }

  /**
   * Group summaries by calendar month.
   */
  private _groupByMonth(summaries: SessionSummary[]): Map<string, SessionSummary[]> {
    const groups = new Map<string, SessionSummary[]>();
    for (const summary of summaries) {
      const date = new Date(summary.timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!groups.has(monthKey)) {
        groups.set(monthKey, []);
      }
      groups.get(monthKey)!.push(summary);
    }
    return groups;
  }

  /**
   * Merge summaries for a single day.
   */
  private _mergeDaily(day: string, summaries: SessionSummary[]): SessionSummary {
    // Combine themes
    const themes = summaries.map(s => s.theme).filter(Boolean);

    // Dedup keyPoints by semantic similarity
    const allKeyPoints = summaries.flatMap(s => s.keyPoints);
    const dedupedKeyPoints = this._dedupByKeyPoints(allKeyPoints);

    // Keep ALL pending tasks
    const allPendingTasks = summaries.flatMap(s => s.pendingTasks);

    // Merge entities
    const allEntities = [...new Set(summaries.flatMap(s => s.entities))];

    // Use earliest timestamp of the day
    const earliest = Math.min(...summaries.map(s => s.timestamp));

    return {
      theme: themes.join('; '),
      pendingTasks: allPendingTasks,
      keyPoints: dedupedKeyPoints.slice(0, this._config.maxKeyPointsLevel2),
      timestamp: earliest,
      sessionId: `__merged__day-${day}`,
      messageCount: summaries.reduce((sum, s) => sum + s.messageCount, 0),
      entities: allEntities,
    };
  }

  /**
   * Compress summaries for a single month.
   */
  private _compressMonthly(month: string, summaries: SessionSummary[]): SessionSummary {
    // Extract top themes (most frequent words in themes)
    const themes = summaries.map(s => s.theme).filter(Boolean);
    const topThemes = this._extractTopThemes(themes, 3);

    // Aggregate key entities by frequency
    const entityFreq = new Map<string, number>();
    for (const summary of summaries) {
      for (const entity of summary.entities) {
        entityFreq.set(entity, (entityFreq.get(entity) || 0) + 1);
      }
    }
    const topEntities = [...entityFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, this._config.maxEntities)
      .map(([entity]) => entity);

    // Use earliest timestamp of the month
    const earliest = Math.min(...summaries.map(s => s.timestamp));

    return {
      theme: topThemes.join(', '),
      pendingTasks: [],  // Dropped for level 3
      keyPoints: [],     // Dropped for level 3 (use theme instead)
      timestamp: earliest,
      sessionId: `__merged__month-${month}`,
      messageCount: summaries.reduce((sum, s) => sum + s.messageCount, 0),
      entities: topEntities,
    };
  }

  /**
   * Dedup keyPoints by semantic similarity (Jaccard).
   */
  private _dedupByKeyPoints(keyPoints: string[]): string[] {
    if (keyPoints.length === 0) return [];

    const result: string[] = [];
    for (const kp of keyPoints) {
      const isDuplicate = result.some(existing =>
        this._jaccardSimilarity(existing, kp) > this._config.dedupThreshold
      );
      if (!isDuplicate) {
        result.push(kp);
      }
    }
    return result;
  }

  /**
   * Calculate Jaccard similarity between two strings.
   */
  private _jaccardSimilarity(a: string, b: string): number {
    const tokensA = new Set(this._tokenize(a));
    const tokensB = new Set(this._tokenize(b));

    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    const intersection = [...tokensA].filter(t => tokensB.has(t));
    const union = new Set([...tokensA, ...tokensB]);

    return intersection.length / union.size;
  }

  /**
   * Tokenize string into lowercase words.
   */
  private _tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);  // Skip very short tokens
  }

  /**
   * Extract top N themes from theme strings.
   */
  private _extractTopThemes(themes: string[], n: number): string[] {
    // Simple approach: most frequent significant words
    const wordFreq = new Map<string, number>();
    for (const theme of themes) {
      for (const word of this._tokenize(theme)) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    }

    return [...wordFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([word]) => word);
  }

  /**
   * Aggregate entities across summaries.
   */
  private _aggregateEntities(summaries: SessionSummary[]): Map<string, number> {
    const entities = new Map<string, number>();
    for (const summary of summaries) {
      for (const entity of summary.entities) {
        entities.set(entity, (entities.get(entity) || 0) + 1);
      }
    }
    return entities;
  }

  /**
   * Get current configuration.
   */
  getConfig(): BucketConsolidatorConfig {
    return { ...this._config };
  }
}
