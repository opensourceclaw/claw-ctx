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
      // Search for session_recap memories
      const query = sessionId
        ? `session_id:${sessionId} session_recap`
        : "session_recap";

      const results = await this._manager.search(query, {
        memory_type: "session_recap",
        tags: ["session_recap"],
      }, 1);

      if (!results || results.length === 0) {
        return {
          recap: null,
          formatted: null,
          sessionId: sessionId || "",
        };
      }

      // Parse the recap from the memory content
      const memory = results[0];
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
