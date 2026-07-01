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
 * claw-ctx session-resume module — SessionResumeManager
 *
 * Three-phase orchestrator for session continuity:
 *   bootstrap → load history
 *   assemble  → inject history context
 *   afterTurn → generate and store session summary
 *
 * v1.0.0: Initial implementation
 */

import type { SessionResumeConfig, HistoryLoadResult, SessionSummary } from "./types.js";
import { DEFAULT_SESSION_RESUME_CONFIG } from "./types.js";
import { SummaryGenerator } from "./summary-generator.js";
import { HistoryLoader } from "./history-loader.js";

// Minimal MemoryManager interface (duck-typed to match claw-mem)
interface MemoryManager {
  search(query: string, opts?: any, topK?: number): Promise<Array<{ content: string; score: number; tags?: string[]; id?: string; timestamp?: number }>>;
  store(content: string, type: string, tags?: string[], metadata?: Record<string, any>): Promise<any>;
  // v5.1.0: Checkpoint/snapshot methods (claw-mem >= v6.27.0)
  sessionSnapshot?(params: { snapshot: unknown }): Promise<{ stored: boolean; id: string }>;
  sessionGetLatest?(params?: { sessionId?: string }): Promise<unknown>;
  sessionClose?(params: { sessionId: string }): Promise<{ closed: boolean }>;
  sessionGetUnclosed?(params?: Record<string, never>): Promise<{ sessions: unknown[] }>;
}

export class SessionResumeManager {
  private _manager: MemoryManager;
  private _config: SessionResumeConfig;
  private _history: HistoryLoadResult | null = null;
  private _generator: SummaryGenerator;

  constructor(manager: MemoryManager, config?: Partial<SessionResumeConfig>) {
    this._manager = manager;
    this._config = { ...DEFAULT_SESSION_RESUME_CONFIG, ...config };
    this._generator = new SummaryGenerator();
  }

  /**
   * Phase 1: bootstrap — load history from claw-mem.
   */
  async bootstrap(sessionId: string): Promise<{ historyLoaded: boolean; sessionCount: number }> {
    try {
      const loader = new HistoryLoader(this._manager, this._config);
      this._history = await loader.load(sessionId);
      return {
        historyLoaded: this._history.entries.length > 0,
        sessionCount: this._history.entries.length,
      };
    } catch (e) {
      this._history = null;
      return { historyLoaded: false, sessionCount: 0 };
    }
  }

  /**
   * Phase 2: assemble — format history as systemPromptAddition section.
   * Returns null if no history or injectMode is disabled.
   */
  assemble(): string | null {
    if (this._config.injectMode === "disabled") return null;
    if (!this._history || this._history.entries.length === 0) return null;
    if (!this._history.formatted) return null;

    return [
      "[Session History]",
      "The following summarizes recent sessions for continuity:",
      "",
      this._history.formatted,
      "",
      "Use this context to maintain continuity across sessions.",
    ].join("\n");
  }

  /**
   * Phase 3: afterTurn — generate and store session summary.
   */
  async afterTurn(
    sessionId: string,
    messages: Array<{ role?: string; content: string }>,
    sessionState?: { entities: Array<{ name: string; type: string; mentions: number; firstSeen: string }>; decisions: Array<{ description: string; actor: string; confidence: number; context: string }>; topics: Array<{ label: string; weight: number; firstMentioned: number }> } | null,
  ): Promise<{ stored: boolean; summary: SessionSummary | null }> {
    if (!this._config.storeOnEveryTurn) {
      return { stored: false, summary: null };
    }
    if (messages.length < 3) {
      return { stored: false, summary: null };
    }

    try {
      const summary = this._generator.generate(messages, sessionId, sessionState as any);
      await this._manager.store(
        JSON.stringify(summary),
        "episodic",
        ["session_summary", "continuity"],
        { sessionId, timestamp: summary.timestamp, messageCount: summary.messageCount },
      );
      return { stored: true, summary };
    } catch {
      return { stored: false, summary: null };
    }
  }

  /** Get loaded history, if any. */
  getHistory(): HistoryLoadResult | null {
    return this._history;
  }

  /** Get current config. */
  getConfig(): Readonly<SessionResumeConfig> {
    return { ...this._config };
  }

  /** Update config. */
  updateConfig(config: Partial<SessionResumeConfig>): void {
    this._config = { ...this._config, ...config };
  }

  /** Reset state. */
  reset(): void {
    this._history = null;
  }

  /**
   * v5.6.0: Get the MemoryManager instance.
   * Used by engine.ts to create HistoryLoader + ContextAssembler.
   */
  getManager(): MemoryManager {
    return this._manager;
  }
}
