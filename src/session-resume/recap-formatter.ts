/**
 * claw-ctx v5.7.0 — Recap Formatter
 *
 * Formats session recaps for injection into context.
 * Provides user-friendly display text for session continuity.
 *
 * Copyright 2026 OpenSourceClaw Contributors
 * Licensed under the Apache License, Version 2.0
 */

import type { Recap } from "./types.js";

export interface RecapFormatOptions {
  /** Include timestamp (default: false) */
  includeTimestamp?: boolean;
  /** Include session ID (default: false) */
  includeSessionId?: boolean;
  /** Maximum length for whatWereWeDoing (default: 200) */
  maxLength?: number;
  /** Style for formatting (default: "friendly") */
  style?: "friendly" | "compact" | "detailed";
}

const DEFAULT_OPTIONS: Required<RecapFormatOptions> = {
  includeTimestamp: false,
  includeSessionId: false,
  maxLength: 200,
  style: "friendly",
};

/**
 * RecapFormatter - Formats recaps for context injection
 *
 * Usage:
 *   const formatter = new RecapFormatter();
 *   const text = formatter.format(recap);
 *   console.log(text); // "📋 Last Session: ..."
 */
export class RecapFormatter {
  private _options: Required<RecapFormatOptions>;

  constructor(options?: RecapFormatOptions) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Format a recap for injection.
   */
  format(recap: Recap): string {
    const truncated = this.truncate(recap.whatWereWeDoing, this._options.maxLength);

    switch (this._options.style) {
      case "compact":
        return this.formatCompact(recap, truncated);
      case "detailed":
        return this.formatDetailed(recap, truncated);
      case "friendly":
      default:
        return this.formatFriendly(recap, truncated);
    }
  }

  /**
   * Format in friendly style (default).
   */
  private formatFriendly(recap: Recap, truncated: string): string {
    const lines = [
      `📋 **Last Session**`,
      ``,
      `**What we were doing:** ${truncated}`,
      ``,
      `**Next step:** ${recap.whatIsNext}`,
    ];

    if (this._options.includeTimestamp) {
      lines.push(``, `_Generated: ${new Date(recap.timestamp).toLocaleString()}_`);
    }

    if (this._options.includeSessionId && recap.sessionId) {
      lines.push(``, `_Session: ${recap.sessionId}_`);
    }

    return lines.join("\n");
  }

  /**
   * Format in compact style.
   */
  private formatCompact(recap: Recap, truncated: string): string {
    const parts = [`Last: ${truncated}`, `Next: ${recap.whatIsNext}`];
    return parts.join(" | ");
  }

  /**
   * Format in detailed style.
   */
  private formatDetailed(recap: Recap, truncated: string): string {
    const lines = [
      `## Session Recap`,
      ``,
      `### What We Were Doing`,
      truncated,
      ``,
      `### Next Step`,
      recap.whatIsNext,
    ];

    if (this._options.includeTimestamp) {
      lines.push(``, `**Timestamp:** ${new Date(recap.timestamp).toLocaleString()}`);
    }

    if (this._options.includeSessionId && recap.sessionId) {
      lines.push(`**Session ID:** ${recap.sessionId}`);
    }

    return lines.join("\n");
  }

  /**
   * Truncate text to max length.
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + "...";
  }
}
