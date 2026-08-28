/**
 * claw-ctx — Context Engine for OpenClaw
 *
 * Copyright 2026 Peter Cheng
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * claw-ctx session-resume module — History Loader
 *
 * Loads recent session summaries from claw-mem, deduplicates, filters,
 * sorts by recency, and formats for system prompt injection.
 *
 * v1.0.0: Initial implementation
 * v5.3.0: Added hybrid_search support with completeness gate and adaptive expansion
 * v5.4.0: Added hierarchical history loading mode
 */

import type { SessionResumeConfig, HistoryEntry, HistoryLoadResult, SessionSummary } from "./types.js";
import { DEFAULT_SESSION_RESUME_CONFIG } from "./types.js";
import { CompletenessGate, type CompletenessAssessment, type CompletenessBreakdown } from "./completeness-gate.js";
import { AdaptiveExpansion, type ExpansionParams } from "./adaptive-expansion.js";
import { HierarchicalLoader } from "./hierarchical-loader.js";

// Duck-typed MemoryManager interface
interface HybridSearchResult {
  results: Array<{
    content: string;
    score: number;
    tags?: string[];
    id?: string;
    timestamp?: number;
  }>;
  completeness_score?: number;
  metadata?: {
    semanticCount?: number;
    keywordCount?: number;
    afterFilterCount?: number;
    latencyMs?: number;
    breakdown?: CompletenessBreakdown;
  };
}

interface HybridSearchOptions {
  topK?: number;
  filters?: {
    tags?: string[];
    type?: string;
    timeRange?: { start?: string; end?: string };
  };
  includeCompleteness?: boolean;
}

interface MemoryManager {
  search(query: string, opts?: any, topK?: number): Promise<Array<{ content: string; score: number; tags?: string[]; id?: string; timestamp?: number }>>;
  // v5.3.0: Optional hybrid_search from claw-mem >= v6.29.0
  hybridSearch?(query: string, options?: HybridSearchOptions): Promise<HybridSearchResult>;
}

export class HistoryLoader {
  private _manager: MemoryManager;
  private _config: SessionResumeConfig;
  // v5.3.0: Completeness gate and adaptive expansion
  private _completenessGate: CompletenessGate;
  private _adaptiveExpansion: AdaptiveExpansion;

  constructor(manager: MemoryManager, config?: Partial<SessionResumeConfig>) {
    this._manager = manager;
    this._config = { ...DEFAULT_SESSION_RESUME_CONFIG, ...config };
    // v5.3.0: Initialize completeness components
    this._completenessGate = new CompletenessGate({
      threshold: config?.completenessThreshold ?? 0.4,
    });
    this._adaptiveExpansion = new AdaptiveExpansion();
  }

  /**
   * v5.3.0: Unified search with hybrid_search fallback.
   * Prefers hybrid_search when available (claw-mem >= v6.29.0).
   */
  private async _performSearch(params: ExpansionParams): Promise<{
    results: Array<{ content: string; score: number; tags?: string[]; id?: string; timestamp?: number }>;
    completenessScore?: number;
    breakdown?: CompletenessBreakdown;
    usedHybridSearch: boolean;
  }> {
    // Try hybrid_search if available
    if (typeof this._manager.hybridSearch === "function") {
      try {
        const result = await this._manager.hybridSearch("session_summary", {
          topK: params.topK,
          filters: {
            tags: ["session_summary"],
            type: "episodic",
          },
          includeCompleteness: true,
        });

        return {
          results: result.results,
          completenessScore: result.completeness_score,
          breakdown: result.metadata?.breakdown,
          usedHybridSearch: true,
        };
      } catch {
        // Fall through to legacy search
      }
    }

    // Legacy search fallback
    const results = await this._manager.search("session_summary", undefined, params.topK);
    return { results, usedHybridSearch: false };
  }

  /**
   * Load and process session history from claw-mem.
   * v5.3.0: Uses hybrid_search when available, with adaptive expansion.
   * v5.4.0: Supports hierarchical mode for time-based bucketing.
   */
  async load(sessionId: string, config?: SessionResumeConfig): Promise<HistoryLoadResult> {
    const cfg = config ?? this._config;
    const now = Date.now();

    if (cfg.injectMode === "disabled") {
      return { entries: [], formatted: "", totalSessions: 0, filteredByAge: 0 };
    }

    // v5.4.0: Branch based on historyMode
    if (cfg.historyMode === "hierarchical") {
      return this._loadHierarchical(cfg, now);
    }

    // Existing flat mode logic (unchanged)

    // v5.3.0: Reset expansion state for new load cycle
    this._adaptiveExpansion.reset();

    // Initial search parameters
    const initialParams: ExpansionParams = {
      topK: cfg.maxHistorySessions * 5,
      maxAgeHours: cfg.maxAgeHours,
    };

    // v5.3.0: Perform initial search
    const searchResult = await this._performSearch(initialParams);

    // v5.3.0: Assess completeness
    const assessment = this._completenessGate.assess(
      searchResult.completenessScore,
      searchResult.breakdown
    );

    let expansionRounds = 0;
    const allResults = [...searchResult.results];
    const seenIds = new Set(searchResult.results.map(r => r.id).filter(Boolean));

    // v5.3.0: Adaptive expansion if enabled and needed
    if (cfg.adaptiveExpansion !== false && !assessment.isSufficient) {
      while (!this._adaptiveExpansion.isExhausted()) {
        const expanded = this._adaptiveExpansion.expand(
          initialParams.topK,
          initialParams.maxAgeHours,
          assessment
        );

        expansionRounds = expanded.round;

        // Perform expanded search
        const expandedResult = await this._performSearch(expanded.params);

        // Merge and dedup by ID
        for (const r of expandedResult.results) {
          if (r.id && !seenIds.has(r.id)) {
            seenIds.add(r.id);
            allResults.push(r);
          }
        }

        // Re-assess with combined results
        if (expandedResult.completenessScore !== undefined) {
          const newAssessment = this._completenessGate.assess(expandedResult.completenessScore);
          if (newAssessment.isSufficient) {
            break;
          }
        }

        if (expanded.isExhausted) {
          break;
        }
      }
    }

    // Filter by tag
    const tagged = allResults.filter((r) => r.tags?.includes?.("session_summary"));
    if (tagged.length === 0) {
      return {
        entries: [],
        formatted: "",
        totalSessions: 0,
        filteredByAge: 0,
        completeness: {
          score: searchResult.completenessScore,
          assessment: assessment.recommendation,
          expansionRounds,
        },
      };
    }

    // Parse summaries
    const raw: Array<{ summary: SessionSummary; memoryId: string; storedAt: number; score: number }> = [];
    for (const r of tagged) {
      let summary: SessionSummary | null = null;
      try {
        summary = JSON.parse(r.content) as SessionSummary;
      } catch {
        // Legacy text format: try to parse loosely
        summary = this._parseLegacySummary(r.content, r.id ?? "");
      }
      if (!summary) continue;

      // Age filter
      const ageHours = (now - summary.timestamp) / 3600000;
      if (ageHours > cfg.maxAgeHours) continue;

      // v5.6.0: Include relevance score from search result
      raw.push({ summary, memoryId: r.id ?? "", storedAt: summary.timestamp, score: r.score });
    }

    // Deduplicate by sessionId (keep most recent)
    const dedupMap = new Map<string, typeof raw[0]>();
    for (const entry of raw) {
      const existing = dedupMap.get(entry.summary.sessionId);
      if (!existing || entry.summary.timestamp > existing.summary.timestamp) {
        dedupMap.set(entry.summary.sessionId, entry);
      }
    }

    // Sort by recency descending
    // v5.6.0: Include relevanceScore in HistoryEntry
    const entries: HistoryEntry[] = [...dedupMap.values()]
      .sort((a, b) => b.summary.timestamp - a.summary.timestamp)
      .slice(0, cfg.maxHistorySessions)
      .map(item => ({
        summary: item.summary,
        memoryId: item.memoryId,
        storedAt: item.storedAt,
        relevanceScore: item.score,  // v5.6.0: Pass through relevance score
      }));

    // Format
    const formatted = this._formatEntries(entries, cfg.injectMode as "full" | "compact");

    return {
      entries,
      formatted,
      totalSessions: raw.length,
      filteredByAge: tagged.length - raw.length,
      // v5.3.0: Completeness metadata
      completeness: {
        score: searchResult.completenessScore,
        assessment: assessment.recommendation,
        expansionRounds,
        breakdown: searchResult.breakdown,
      },
    };
  }

  /**
   * Format entries as a context string for system prompt injection.
   */
  private _formatEntries(entries: HistoryEntry[], mode: "full" | "compact"): string {
    if (entries.length === 0) return "";

    if (mode === "compact") {
      const lines = ["[Previous Sessions]"];
      for (const e of entries) {
        const s = e.summary;
        const tasks = s.pendingTasks.length > 0 ? ` | tasks: ${s.pendingTasks.slice(0, 2).join("; ")}` : "";
        lines.push(`Session ${s.sessionId}: ${s.theme}${tasks}`);
      }
      return lines.join("\n");
    }

    // "full" mode
    const blocks: string[] = [];
    for (const e of entries) {
      const s = e.summary;
      const lines: string[] = [
        `[Previous Session: ${s.sessionId}]`,
        `Theme: ${s.theme}`,
      ];
      if (s.pendingTasks.length > 0) {
        lines.push(`Pending Tasks: ${s.pendingTasks.join("; ")}`);
      }
      if (s.keyPoints.length > 0) {
        lines.push(`Key Points: ${s.keyPoints.join("; ")}`);
      }
      if (s.entities.length > 0) {
        lines.push(`Entities: ${s.entities.join(", ")}`);
      }
      blocks.push(lines.join("\n"));
    }
    return blocks.join("\n---\n");
  }

  /**
   * Parse legacy text-format session summary (pre-v1.0.0).
   * Old format: "Working on: code, api. Last action: ..."
   */
  private _parseLegacySummary(content: string, memoryId: string): SessionSummary | null {
    const themeMatch = content.match(/Working on:\s*(.+?)(?:\.|$)/);
    const theme = themeMatch ? themeMatch[1].trim() : "General discussion";
    return {
      theme,
      pendingTasks: [],
      keyPoints: [],
      timestamp: Date.now(),
      sessionId: memoryId || "legacy",
      messageCount: 0,
      entities: [],
    };
  }

  /**
   * v5.4.0: Load history in hierarchical mode.
   * Uses time-based bucketing and conservative consolidation.
   */
  private async _loadHierarchical(cfg: SessionResumeConfig, now: number): Promise<HistoryLoadResult> {
    // Query for wider range (topK * 3, longer age)
    const widerTopK = cfg.maxHistorySessions * 3;
    const widerMaxAgeDays = cfg.hierarchicalLoader?.level3MaxAgeDays ?? 30;
    const widerMaxAgeHours = widerMaxAgeDays * 24;

    // Use _performSearch with expanded params
    const expandedParams: ExpansionParams = {
      topK: widerTopK,
      maxAgeHours: widerMaxAgeHours,
    };

    const searchResult = await this._performSearch(expandedParams);

    // Extract summaries from results
    const summaries: SessionSummary[] = [];
    for (const result of searchResult.results) {
      if (result.tags?.includes?.("session_summary")) {
        try {
          const summary = JSON.parse(result.content) as SessionSummary;
          summaries.push(summary);
        } catch {
          // Skip unparseable
        }
      }
    }

    // Use HierarchicalLoader
    const loader = new HierarchicalLoader({
      timeBucket: {
        recentSessionCount: cfg.hierarchicalLoader?.recentSessionCount ?? 3,
        weekBoundaryDays: cfg.hierarchicalLoader?.weekBoundaryDays ?? 7,
        maxAgeDays: widerMaxAgeDays,
      },
      consolidator: {
        dedupThreshold: cfg.hierarchicalLoader?.dedupThreshold ?? 0.7,
      },
      injectMode: cfg.injectMode as "full" | "compact",
    });

    const history = loader.load(summaries, now);
    const formatted = loader.format(history);

    // Convert to HistoryEntry[] for compatibility
    const entries: HistoryEntry[] = [
      ...history.level1,
      ...history.level2,
      ...history.level3,
    ].map(summary => ({
      summary,
      memoryId: summary.sessionId,
      storedAt: summary.timestamp,
    }));

    return {
      entries,
      formatted,
      totalSessions: summaries.length,
      filteredByAge: 0,
      completeness: {
        score: searchResult.completenessScore,
        assessment: searchResult.completenessScore !== undefined ? "use" : "unavailable",
        expansionRounds: 0,
      },
    };
  }
}
