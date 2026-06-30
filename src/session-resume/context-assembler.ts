/**
 * claw-ctx session-resume module — Context Assembler
 *
 * Orchestrates context assembly based on task type.
 * Routes to appropriate strategy, loads history, formats output.
 *
 * v5.5.0: Initial implementation
 */

import type { TaskType } from "../adaptive/task-type-detector.js";
import type { HistoryEntry, HistoryLoadResult, SessionResumeConfig } from "./types.js";
import { DEFAULT_SESSION_RESUME_CONFIG } from "./types.js";
import { HistoryLoader } from "./history-loader.js";
import { StrategyRouter } from "./strategy-router.js";
import type {
  AssemblyStrategyType,
  AssemblyParams,
  ContextStrategy,
} from "./context-strategy.js";

/**
 * Output from ContextAssembler.assemble().
 * Passed to AdaptiveInjector for injection.
 */
export interface AssemblyResult {
  /** Strategy that was used */
  strategy: AssemblyStrategyType;

  /** Raw history load result from HistoryLoader */
  historyResult: HistoryLoadResult;

  /** Strategy-specific formatted context */
  formatted: string;

  /** Metadata for debugging and telemetry */
  metadata: {
    taskType: TaskType;
    strategy: AssemblyStrategyType;
    loadTimeMs: number;
    entryCount: number;
    completenessScore?: number;
  };
}

/**
 * ContextAssembler configuration.
 */
export interface ContextAssemblerConfig {
  /** Override default strategy routing */
  defaultStrategy?: AssemblyStrategyType;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * ContextAssembler — orchestrates strategy-based context assembly.
 *
 * Usage:
 *   const assembler = new ContextAssembler(historyLoader);
 *   const result = await assembler.assemble(sessionId, taskType, query);
 */
export class ContextAssembler {
  private _router: StrategyRouter;
  private _historyLoader: HistoryLoader;
  private _config: ContextAssemblerConfig;

  constructor(historyLoader: HistoryLoader, config?: ContextAssemblerConfig) {
    this._router = new StrategyRouter();
    this._historyLoader = historyLoader;
    this._config = config ?? {};
  }

  /**
   * Main entry point: assemble context for a session.
   *
   * @param sessionId - Current session ID
   * @param taskType - Detected task type from TaskTypeDetector
   * @param query - Optional query for entity extraction
   * @returns AssemblyResult with formatted context
   */
  async assemble(
    sessionId: string,
    taskType: TaskType,
    query?: string
  ): Promise<AssemblyResult> {
    const startTime = Date.now();

    try {
      // Step 1: Route to strategy
      const strategy = this._config.defaultStrategy
        ? this._router.getStrategyByType(this._config.defaultStrategy)
        : this._router.getStrategy(taskType);

      // Step 2: Load history with strategy params
      const historyResult = await this._loadHistory(sessionId, strategy);

      // Step 3: Sort entries per strategy
      const sortedEntries = this._sortEntries(
        historyResult.entries,
        strategy.params.sortBy
      );

      // Step 4: Format per strategy template
      const formatted = this._formatByTemplate(
        sortedEntries,
        strategy.formatTemplate,
        strategy.params
      );

      return {
        strategy: strategy.type,
        historyResult,
        formatted,
        metadata: {
          taskType,
          strategy: strategy.type,
          loadTimeMs: Date.now() - startTime,
          entryCount: sortedEntries.length,
          completenessScore: historyResult.completeness?.score,
        },
      };
    } catch (error) {
      // Log and return empty result with error info
      if (this._config.debug) {
        console.error(`[ContextAssembler] Error during assembly: ${error}`);
      }

      return {
        strategy: "balanced",
        historyResult: {
          entries: [],
          formatted: "",
          totalSessions: 0,
          filteredByAge: 0,
        },
        formatted: "",
        metadata: {
          taskType,
          strategy: "balanced",
          loadTimeMs: Date.now() - startTime,
          entryCount: 0,
        },
      };
    }
  }

  /**
   * Assemble with explicit strategy (bypass routing).
   */
  async assembleWithStrategy(
    sessionId: string,
    strategyType: AssemblyStrategyType,
    query?: string
  ): Promise<AssemblyResult> {
    const startTime = Date.now();

    try {
      const strategy = this._router.getStrategyByType(strategyType);
      const historyResult = await this._loadHistory(sessionId, strategy);
      const sortedEntries = this._sortEntries(
        historyResult.entries,
        strategy.params.sortBy
      );
      const formatted = this._formatByTemplate(
        sortedEntries,
        strategy.formatTemplate,
        strategy.params
      );

      return {
        strategy: strategy.type,
        historyResult,
        formatted,
        metadata: {
          taskType: "unknown",
          strategy: strategy.type,
          loadTimeMs: Date.now() - startTime,
          entryCount: sortedEntries.length,
          completenessScore: historyResult.completeness?.score,
        },
      };
    } catch (error) {
      if (this._config.debug) {
        console.error(`[ContextAssembler] Error during assembly: ${error}`);
      }

      return {
        strategy: strategyType,
        historyResult: {
          entries: [],
          formatted: "",
          totalSessions: 0,
          filteredByAge: 0,
        },
        formatted: "",
        metadata: {
          taskType: "unknown",
          strategy: strategyType,
          loadTimeMs: Date.now() - startTime,
          entryCount: 0,
        },
      };
    }
  }

  /**
   * Get current router (for testing/debugging).
   */
  getRouter(): StrategyRouter {
    return this._router;
  }

  // === Private methods ===

  /**
   * Load history using strategy params.
   */
  private async _loadHistory(
    sessionId: string,
    strategy: ContextStrategy
  ): Promise<HistoryLoadResult> {
    const params = strategy.params;

    // Build SessionResumeConfig from strategy params (merge with defaults)
    const config: SessionResumeConfig = {
      ...DEFAULT_SESSION_RESUME_CONFIG,
      historyMode: params.historyMode,
      maxHistorySessions: params.maxHistorySessions,
      maxAgeHours: params.maxAgeHours,
      completenessThreshold: params.completenessThreshold,
    };

    // Delegate to existing HistoryLoader
    return this._historyLoader.load(sessionId, config);
  }

  /**
   * Sort entries based on strategy sortBy param.
   */
  private _sortEntries(
    entries: HistoryEntry[],
    sortBy: AssemblyParams["sortBy"]
  ): HistoryEntry[] {
    const sorted = [...entries];

    switch (sortBy) {
      case "recency":
        // Most recent first (default)
        return sorted.sort(
          (a, b) => b.summary.timestamp - a.summary.timestamp
        );

      case "relevance":
        // Highest score first
        // Note: relevance score not directly available, use recency as proxy
        return sorted.sort(
          (a, b) => b.summary.timestamp - a.summary.timestamp
        );

      case "chronological":
        // Oldest first (for timeline reconstruction)
        return sorted.sort(
          (a, b) => a.summary.timestamp - b.summary.timestamp
        );

      default:
        return sorted;
    }
  }

  /**
   * Format entries using strategy-specific template.
   */
  private _formatByTemplate(
    entries: HistoryEntry[],
    template: ContextStrategy["formatTemplate"],
    params: AssemblyParams
  ): string {
    if (entries.length === 0) {
      return "";
    }

    switch (template) {
      case "facts":
        return this._formatFacts(entries, params);
      case "timeline":
        return this._formatTimeline(entries, params);
      case "procedural":
        return this._formatProcedural(entries, params);
      case "evidence":
        return this._formatEvidence(entries, params);
      case "default":
      default:
        return this._formatDefault(entries, params);
    }
  }

  /**
   * Facts template — entity-centric fact listing.
   */
  private _formatFacts(entries: HistoryEntry[], params: AssemblyParams): string {
    const lines: string[] = ["[Relevant Facts]"];

    // Group by entity if entities available
    const entityFacts = new Map<string, string[]>();

    for (const entry of entries) {
      const entities = entry.summary.entities;
      const theme = entry.summary.theme;
      const keyPoints = entry.summary.keyPoints;

      if (entities.length > 0) {
        for (const entity of entities) {
          if (!entityFacts.has(entity)) {
            entityFacts.set(entity, []);
          }
          entityFacts.get(entity)!.push(theme);
          entityFacts.get(entity)!.push(...keyPoints.slice(0, 2));
        }
      } else {
        // No entities, add as general fact
        lines.push(`• ${theme} (session: ${entry.summary.sessionId})`);
      }
    }

    // Format entity-grouped facts
    for (const [entity, facts] of entityFacts) {
      const uniqueFacts = [...new Set(facts)].slice(0, 3);
      lines.push(`• ${entity}: ${uniqueFacts.join("; ")}`);
    }

    // Entity index
    if (params.includeEntities) {
      const allEntities = [...new Set(entries.flatMap((e) => e.summary.entities))];
      if (allEntities.length > 0) {
        lines.push(`\nKey entities: ${allEntities.slice(0, 10).join(", ")}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Timeline template — chronological with temporal markers.
   */
  private _formatTimeline(entries: HistoryEntry[], params: AssemblyParams): string {
    const lines: string[] = ["[Timeline]"];

    // Already sorted chronologically
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const date = params.preserveTimestamps
        ? new Date(entry.summary.timestamp).toLocaleDateString()
        : "";

      const prefix = i === 0 ? "" : "  → ";
      if (date) {
        lines.push(`${prefix}${date}: ${entry.summary.theme} (session: ${entry.summary.sessionId})`);
      } else {
        lines.push(`${prefix}${entry.summary.theme} (session: ${entry.summary.sessionId})`);
      }
    }

    // Add temporal span
    if (entries.length > 1 && params.preserveTimestamps) {
      const first = entries[0].summary.timestamp;
      const last = entries[entries.length - 1].summary.timestamp;
      const span = last - first;
      const hours = Math.round(span / 3600000);
      const days = Math.round(span / 86400000);

      if (days > 0) {
        lines.push(`\nSpan: ${days} days`);
      } else if (hours > 0) {
        lines.push(`\nSpan: ${hours} hours`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Procedural template — numbered steps with operation focus.
   */
  private _formatProcedural(entries: HistoryEntry[], params: AssemblyParams): string {
    const lines: string[] = ["[Previous Operations]"];

    let stepNum = 1;
    const errorPatterns: string[] = [];

    for (const entry of entries) {
      const theme = entry.summary.theme;

      if (params.preserveTimestamps) {
        const date = new Date(entry.summary.timestamp).toLocaleDateString();
        lines.push(`${stepNum}. ${theme} — ${date}`);
      } else {
        lines.push(`${stepNum}. ${theme}`);
      }

      // Add key points as sub-steps
      for (const kp of entry.summary.keyPoints.slice(0, 2)) {
        lines.push(`   • ${kp}`);
      }

      // Collect pending tasks (potential error patterns)
      if (params.includeErrorPatterns && entry.summary.pendingTasks.length > 0) {
        errorPatterns.push(...entry.summary.pendingTasks);
      }

      stepNum++;
    }

    // Error patterns section
    if (params.includeErrorPatterns && errorPatterns.length > 0) {
      const uniquePatterns = [...new Set(errorPatterns)].slice(0, 5);
      lines.push(`\nCommon issues: ${uniquePatterns.join("; ")}`);
    }

    return lines.join("\n");
  }

  /**
   * Evidence template — cross-session evidence with completeness.
   */
  private _formatEvidence(entries: HistoryEntry[], params: AssemblyParams): string {
    const lines: string[] = ["[Cross-Session Evidence]"];

    // Group by theme overlap
    const decisions: Map<string, string[]> = new Map();

    for (const entry of entries) {
      const theme = entry.summary.theme;
      const sessionId = entry.summary.sessionId;

      // Key points as evidence
      for (const kp of entry.summary.keyPoints) {
        if (!decisions.has(theme)) {
          decisions.set(theme, []);
        }
        decisions.get(theme)!.push(`${kp} (session: ${sessionId})`);
      }
    }

    // Format decisions
    for (const [theme, evidence] of decisions) {
      lines.push(`\nTopic: ${theme}`);
      for (const e of evidence.slice(0, 3)) {
        lines.push(`  • ${e}`);
      }
    }

    // Cross-references
    const allEntities = [...new Set(entries.flatMap((e) => e.summary.entities))];
    if (params.includeEntities && allEntities.length > 0) {
      lines.push(`\nCross-referenced entities: ${allEntities.slice(0, 15).join(", ")}`);
    }

    return lines.join("\n");
  }

  /**
   * Default template — session summaries (current behavior).
   */
  private _formatDefault(entries: HistoryEntry[], _params: AssemblyParams): string {
    const blocks: string[] = [];

    for (const entry of entries) {
      const lines: string[] = [
        `[Previous Session: ${entry.summary.sessionId}]`,
        `Theme: ${entry.summary.theme}`,
      ];

      if (entry.summary.pendingTasks.length > 0) {
        lines.push(`Pending Tasks: ${entry.summary.pendingTasks.join("; ")}`);
      }
      if (entry.summary.keyPoints.length > 0) {
        lines.push(`Key Points: ${entry.summary.keyPoints.join("; ")}`);
      }
      if (entry.summary.entities.length > 0) {
        lines.push(`Entities: ${entry.summary.entities.join(", ")}`);
      }

      blocks.push(lines.join("\n"));
    }

    return blocks.join("\n---\n");
  }
}
