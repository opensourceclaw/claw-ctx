/**
 * claw-ctx v5.9.0 — Recap Loader
 *
 * Loads session recaps from claw-mem for session continuity.
 * Used when injectMode="recap" for lightweight session recovery.
 *
 * v5.9.0 Changes:
 * - Added fallback logic for loading recent memories
 * - Improved time sorting with better null handling
 * - Added detailed logging for debugging
 *
 * Copyright 2026 OpenSourceClaw Contributors
 * Licensed under the Apache License, Version 2.0
 */

import type { Recap, RecapLoadResult } from "./types.js";

// Minimal MemoryManager interface for recap loading
// v5.8.1: Uses bridge-compatible search signature: (query, memoryType, limit)
interface MemoryManager {
  search(query: string, memoryType?: string, limit?: number): Promise<Array<{
    content: string;
    score: number;
    tags?: string[];
    id?: string;
    timestamp?: number;
    metadata?: Record<string, unknown>;
  }>>;
}

/**
 * v5.9.0: Logger interface for recap loading
 */
interface RecapLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

const defaultLogger: RecapLogger = {
  info: (msg, data) => console.log(`[RecapLoader] INFO: ${msg}`, data || ""),
  warn: (msg, data) => console.warn(`[RecapLoader] WARN: ${msg}`, data || ""),
  error: (msg, data) => console.error(`[RecapLoader] ERROR: ${msg}`, data || ""),
};

/**
 * RecapLoader - Loads session recaps from claw-mem
 *
 * v5.9.0: Enhanced with fallback logic and better error handling
 *
 * Usage:
 *   const loader = new RecapLoader(manager);
 *   const result = await loader.load(sessionId);
 *   console.log(result.formatted); // User-friendly recap text
 */
export class RecapLoader {
  private _manager: MemoryManager;
  private _logger: RecapLogger;

  constructor(manager: MemoryManager, logger?: RecapLogger) {
    this._manager = manager;
    this._logger = logger ?? defaultLogger;
  }

  /**
   * Load the most recent recap for a session.
   *
   * v5.9.0: Enhanced with fallback logic
   *   1. First try loading session_summary
   *   2. If not found, fallback to loading any session-related memories
   *   3. Improved timestamp sorting with null handling
   *
   * @param sessionId - Target session ID (optional, loads latest if not provided)
   * @returns RecapLoadResult with recap data and formatted text
   */
  async load(sessionId?: string): Promise<RecapLoadResult> {
    try {
      this._logger.info("loading recap", { sessionId });

      // v5.9.0: Primary search - session_summary
      const results = await this._manager.search(
        "session_summary",  // keyword query
        undefined,          // memoryType - storage doesn't set this
        10                 // limit - get enough results to find recent one
      );

      if (!results || results.length === 0) {
        this._logger.warn("no session_summary found, trying fallback");

        // v5.9.0: Fallback - try loading any session-related memories
        const fallbackResults = await this.loadFallback(sessionId);

        if (fallbackResults) {
          this._logger.info("fallback succeeded", {
            sessionId: fallbackResults.sessionId,
          });
          return fallbackResults;
        }

        return {
          recap: null,
          formatted: null,
          sessionId: sessionId || "",
        };
      }

      this._logger.info("session_summary results found", {
        count: results.length,
      });

      // v5.8.1: Filter by sessionId if provided, then sort by timestamp
      let filteredResults = results;

      // Filter by sessionId if provided
      if (sessionId) {
        filteredResults = results.filter((r: any) => {
          const meta = r.metadata || {};
          return meta.session_id === sessionId || meta.sessionId === sessionId;
        });

        this._logger.info("filtered by sessionId", {
          targetSessionId: sessionId,
          matchCount: filteredResults.length,
        });

        // If no results for this session, try fallback
        if (filteredResults.length === 0) {
          this._logger.warn("no results for sessionId, trying fallback");
          const fallbackResults = await this.loadFallback(sessionId);

          if (fallbackResults) {
            return fallbackResults;
          }

          return {
            recap: null,
            formatted: null,
            sessionId: sessionId,
          };
        }
      }

      // v5.9.0: Improved sort by timestamp with better null handling
      const sortedResults = this.sortByTimestamp(filteredResults);

      const memory = sortedResults[0];
      const { recap, extra } = this.parseRecap(memory.content, memory.metadata);

      // Format for injection
      const formatted = this.formatRecap(recap, extra);

      this._logger.info("recap loaded successfully", {
        sessionId: recap.sessionId,
        timestamp: recap.timestamp,
      });

      return {
        recap,
        formatted,
        sessionId: recap.sessionId,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this._logger.error("load failed", {
        error: errorMsg,
        sessionId,
      });

      return {
        recap: null,
        formatted: null,
        sessionId: sessionId || "",
      };
    }
  }

  /**
   * v5.9.0: Fallback loading when primary search fails
   */
  private async loadFallback(sessionId?: string): Promise<RecapLoadResult | null> {
    try {
      // Try searching for any session-related content
      const fallbackResults = await this._manager.search(
        "session",  // broader keyword
        undefined,
        5
      );

      if (!fallbackResults || fallbackResults.length === 0) {
        this._logger.warn("fallback: no session-related memories found");
        return null;
      }

      this._logger.info("fallback: found session-related memories", {
        count: fallbackResults.length,
      });

      // Filter by sessionId if provided
      let filteredResults = fallbackResults;
      if (sessionId) {
        filteredResults = fallbackResults.filter((r: any) => {
          const meta = r.metadata || {};
          return meta.session_id === sessionId || meta.sessionId === sessionId;
        });

        if (filteredResults.length === 0) {
          this._logger.warn("fallback: no matching sessionId");
          return null;
        }
      }

      // Sort by timestamp
      const sortedResults = this.sortByTimestamp(filteredResults);
      const memory = sortedResults[0];
      const { recap, extra } = this.parseRecap(memory.content, memory.metadata);
      const formatted = this.formatRecap(recap, extra);

      return {
        recap,
        formatted,
        sessionId: recap.sessionId,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this._logger.error("fallback failed", { error: errorMsg });
      return null;
    }
  }

  /**
   * v5.9.0: Sort results by timestamp with improved null handling
   */
  private sortByTimestamp(results: any[]): any[] {
    return results.sort((a: any, b: any) => {
      const tsA = this.extractTimestamp(a);
      const tsB = this.extractTimestamp(b);
      return tsB - tsA; // Most recent first
    });
  }

  /**
   * v5.9.0: Extract timestamp from memory record with fallbacks
   */
  private extractTimestamp(record: any): number {
    // Try direct timestamp
    if (typeof record.timestamp === "number") {
      return record.timestamp;
    }

    // Try metadata timestamp
    if (record.metadata && typeof record.metadata.timestamp === "number") {
      return record.metadata.timestamp;
    }

    // Try metadata created_at
    if (record.metadata && typeof record.metadata.created_at === "number") {
      return record.metadata.created_at;
    }

    // Try parsing date string
    if (record.metadata && typeof record.metadata.created_at === "string") {
      const parsed = Date.parse(record.metadata.created_at);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }

    // Default to 0 (oldest)
    return 0;
  }

  /**
   * Parse recap from memory content.
   *
   * v5.11.4: Primary path is JSON.parse since SummaryGenerator stores
   * `JSON.stringify(SessionSummary)`. The legacy regex path is retained
   * for back-compat with any older records that used the "Session Recap:" /
   * "Next:" textual format.
   */
  private parseRecap(content: string, metadata?: Record<string, unknown>): { recap: Recap; extra?: { pendingTasks?: string[]; keyPoints?: string[] } } {
    // v5.11.4: Try JSON first (current SummaryGenerator format)
    try {
      const obj = JSON.parse(content) as Partial<{
        theme: string;
        pendingTasks: string[];
        keyPoints: string[];
        timestamp: number;
        sessionId: string;
        messageCount: number;
      }>;

      if (obj && typeof obj === "object") {
        const whatWereWeDoing = obj.theme
          ?? (obj.keyPoints && obj.keyPoints.length > 0 ? obj.keyPoints[0] : "")
          ?? "Previous session";

        const whatIsNext = obj.pendingTasks && obj.pendingTasks.length > 0
          ? obj.pendingTasks[0]
          : (obj.keyPoints && obj.keyPoints.length > 1 ? obj.keyPoints[1] : "Continue with current task");

        const recap: Recap = {
          whatWereWeDoing,
          whatIsNext,
          timestamp: typeof obj.timestamp === "number" ? obj.timestamp : this.extractTimestamp({ metadata }),
          sessionId: (metadata?.session_id as string) || obj.sessionId || "",
        };

        const extra = {
          pendingTasks: obj.pendingTasks,
          keyPoints: obj.keyPoints,
        };

        return { recap, extra };
      }
    } catch {
      // Not JSON, fall through to legacy regex path
    }

    // Legacy regex path (pre-v5.7.0 textual format)
    const whatDoingMatch = content.match(/Session Recap:\s*(.+?)(?:\n|$)/i);
    const nextMatch = content.match(/Next:\s*(.+?)(?:\n|$)/i);

    const recap: Recap = {
      whatWereWeDoing: whatDoingMatch ? whatDoingMatch[1].trim() : content.substring(0, 100),
      whatIsNext: nextMatch ? nextMatch[1].trim() : "Continue with current task",
      timestamp: this.extractTimestamp({ metadata }),
      sessionId: (metadata?.session_id as string) || "",
    };

    return { recap };
  }

  /**
   * Format recap for user-friendly display.
   *
   * v5.11.4: Accept optional extra fields to render pendingTasks and keyPoints
   * when the source was a SessionSummary JSON. Falls back to the minimal
   * whatWereWeDoing/whatIsNext pair for legacy records.
   */
  private formatRecap(recap: Recap, extra?: { pendingTasks?: string[]; keyPoints?: string[] }): string {
    const lines: string[] = [
      `📋 **Last Session**`,
      ``,
      `**What we were doing:** ${recap.whatWereWeDoing}`,
      ``,
      `**Next step:** ${recap.whatIsNext}`,
    ];

    if (extra?.pendingTasks && extra.pendingTasks.length > 0) {
      lines.push(``, `**Pending tasks:**`);
      for (const t of extra.pendingTasks.slice(0, 5)) lines.push(`- ${t}`);
    }

    if (extra?.keyPoints && extra.keyPoints.length > 0) {
      lines.push(``, `**Key points:**`);
      for (const p of extra.keyPoints.slice(0, 5)) lines.push(`- ${p}`);
    }

    return lines.join("\n");
  }
}
