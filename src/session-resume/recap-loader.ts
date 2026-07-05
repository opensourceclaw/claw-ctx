/**
 * claw-ctx v5.7.0 — Recap Loader
 *
 * Loads session recaps from claw-mem for session continuity.
 * Used when injectMode="recap" for lightweight session recovery.
 *
 * Copyright 2026 OpenSourceClaw Contributors
 * Licensed under the Apache License, Version 2.0
 */

import type { Recap, RecapLoadResult } from "./types.js";

// Minimal MemoryManager interface for recap loading
interface MemoryManager {
  search(query: string, opts?: any, topK?: number): Promise<Array<{
    content: string;
    score: number;
    tags?: string[];
    id?: string;
    timestamp?: number;
    metadata?: Record<string, unknown>;
  }>>;
}

/**
 * RecapLoader - Loads session recaps from claw-mem
 *
 * Usage:
 *   const loader = new RecapLoader(manager);
 *   const result = await loader.load(sessionId);
 *   console.log(result.formatted); // User-friendly recap text
 */
export class RecapLoader {
  private _manager: MemoryManager;

  constructor(manager: MemoryManager) {
    this._manager = manager;
  }

  /**
   * Load the most recent recap for a session.
   *
   * @param sessionId - Target session ID (optional, loads latest if not provided)
   * @returns RecapLoadResult with recap data and formatted text
   */
  async load(sessionId?: string): Promise<RecapLoadResult> {
    try {
      // v5.8.0: Search for session_recap memories with time-based sorting
      // When sessionId is provided, filter by session_id
      // When sessionId is undefined, return the most recent recap (not all)
      const query = sessionId
        ? `session_id:${sessionId} session_recap`
        : "session_recap";

      // v5.8.0: Request multiple results to sort by timestamp
      const results = await this._manager.search(query, {
        memory_type: "session_recap",
        tags: ["session_recap"],
      }, sessionId ? 1 : 5); // Get more results when sessionId is undefined

      if (!results || results.length === 0) {
        return {
          recap: null,
          formatted: null,
          sessionId: sessionId || "",
        };
      }

      // v5.8.0: Sort by timestamp and take the most recent
      const sortedResults = results.sort((a, b) => {
        const tsA = a.timestamp ?? (typeof a.metadata?.timestamp === 'number' ? a.metadata.timestamp : 0);
        const tsB = b.timestamp ?? (typeof b.metadata?.timestamp === 'number' ? b.metadata.timestamp : 0);
        return tsB - tsA; // Most recent first
      });

      const memory = sortedResults[0];
      const recap = this.parseRecap(memory.content, memory.metadata);

      // Format for injection
      const formatted = this.formatRecap(recap);

      return {
        recap,
        formatted,
        sessionId: recap.sessionId,
      };
    } catch (error) {
      return {
        recap: null,
        formatted: null,
        sessionId: sessionId || "",
      };
    }
  }

  /**
   * Parse recap from memory content.
   */
  private parseRecap(content: string, metadata?: Record<string, unknown>): Recap {
    // Try to extract from content
    const whatDoingMatch = content.match(/Session Recap:\s*(.+?)(?:\n|$)/i);
    const nextMatch = content.match(/Next:\s*(.+?)(?:\n|$)/i);

    return {
      whatWereWeDoing: whatDoingMatch ? whatDoingMatch[1].trim() : content.substring(0, 100),
      whatIsNext: nextMatch ? nextMatch[1].trim() : "Continue with current task",
      timestamp: (metadata?.timestamp as number) || Date.now(),
      sessionId: (metadata?.session_id as string) || "",
    };
  }

  /**
   * Format recap for user-friendly display.
   */
  private formatRecap(recap: Recap): string {
    return [
      `📋 **Last Session**`,
      ``,
      `**What we were doing:** ${recap.whatWereWeDoing}`,
      ``,
      `**Next step:** ${recap.whatIsNext}`,
    ].join("\n");
  }
}
