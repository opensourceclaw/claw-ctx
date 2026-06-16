/**
 * claw-ctx — Context Engine for OpenClaw
 *
 * Copyright 2026 OpenSourceClaw Contributors
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
 */

import type { SessionResumeConfig, HistoryEntry, HistoryLoadResult, SessionSummary } from "./types.js";
import { DEFAULT_SESSION_RESUME_CONFIG } from "./types.js";

// Minimal MemoryManager interface (duck-typed to match claw-mem)
interface MemoryManager {
  search(query: string, opts?: any, topK?: number): Promise<Array<{ content: string; score: number; tags?: string[]; id?: string; timestamp?: number }>>;
}

export class HistoryLoader {
  private _manager: MemoryManager;
  private _config: SessionResumeConfig;

  constructor(manager: MemoryManager, config?: Partial<SessionResumeConfig>) {
    this._manager = manager;
    this._config = { ...DEFAULT_SESSION_RESUME_CONFIG, ...config };
  }

  /**
   * Load and process session history from claw-mem.
   */
  async load(sessionId: string, config?: SessionResumeConfig): Promise<HistoryLoadResult> {
    const cfg = config ?? this._config;
    const now = Date.now();

    if (cfg.injectMode === "disabled") {
      return { entries: [], formatted: "", totalSessions: 0, filteredByAge: 0 };
    }

    // Search for session_summary tagged memories (use multiplier for margin)
    const results = await this._manager.search("session_summary", undefined, cfg.maxHistorySessions * 5);

    // Filter by tag
    const tagged = results.filter((r) => r.tags?.includes?.("session_summary"));
    if (tagged.length === 0) {
      return { entries: [], formatted: "", totalSessions: 0, filteredByAge: 0 };
    }

    // Parse summaries
    const raw: Array<{ summary: SessionSummary; memoryId: string; storedAt: number }> = [];
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

      raw.push({ summary, memoryId: r.id ?? "", storedAt: summary.timestamp });
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
    const entries: HistoryEntry[] = [...dedupMap.values()]
      .sort((a, b) => b.summary.timestamp - a.summary.timestamp)
      .slice(0, cfg.maxHistorySessions);

    // Format
    const formatted = this._formatEntries(entries, cfg.injectMode as "full" | "compact");

    return {
      entries,
      formatted,
      totalSessions: raw.length,
      filteredByAge: tagged.length - raw.length,
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
}
