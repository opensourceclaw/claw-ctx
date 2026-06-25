// Copyright 2026 OpenSourceClaw Contributors
// Licensed under the Apache License, Version 2.0

import type { SessionSnapshot, CheckpointConfig } from "./types.js";
import type { SessionState } from "../session-state-extractor.js";

interface MinimalMemoryManager {
  sessionSnapshot?(params: { snapshot: unknown }): unknown;
  sessionGetLatest?(params?: { sessionId?: string }): unknown;
  sessionClose?(params: { sessionId: string }): unknown;
  sessionGetUnclosed?(params?: Record<string, never>): unknown;
}

export class CheckpointManager {
  private _config: CheckpointConfig;
  private _turnCounter = 0;
  private _pendingRecovery: string | null = null;

  constructor(
    private _manager: MinimalMemoryManager,
    config?: Partial<CheckpointConfig>,
    private _getSessionState?: () => SessionState | null,
  ) {
    this._config = {
      mode: "every_turn",
      interval: 1,
      maxRecoveryAgeHours: 48,
      ...config,
    };
  }

  /** Feature detection: is claw-mem >= v6.27.0 available? */
  get supported(): boolean {
    return (
      typeof this._manager.sessionSnapshot === "function" &&
      typeof this._manager.sessionGetUnclosed === "function"
    );
  }

  /** Create snapshot from current SessionState. No-op if unsupported or disabled. */
  checkpoint(sessionState?: SessionState | null): boolean {
    if (!this.supported) return false;
    if (this._config.mode === "disabled") return false;

    const state = sessionState ?? this._getSessionState?.();
    if (!state) return false;

    if (this._config.mode === "every_n_turns") {
      this._turnCounter++;
      if (this._turnCounter < this._config.interval) return false;
      this._turnCounter = 0;
    }

    try {
      const snapshot: SessionSnapshot = this.buildSnapshot(state);
      this._manager.sessionSnapshot!({ snapshot });
      return true;
    } catch {
      return false;
    }
  }

  /** Fetch unclosed sessions and format recovery context. No-op if unsupported. */
  async getRecoveryContext(): Promise<string | null> {
    if (!this.supported) return null;

    try {
      const result = (await this._manager.sessionGetUnclosed!()) as { sessions?: SessionSnapshot[] } | undefined;
      const unclosed = result?.sessions ?? [];
      if (unclosed.length === 0) return null;

      const ctx = unclosed
        .map((s) => this.formatRecovery(s))
        .join("\n\n---\n\n");
      this._pendingRecovery = ctx;
      return ctx;
    } catch {
      return null;
    }
  }

  /** Bootstrap pre-fetch: load recovery context and cache for synchronous injection. */
  async bootstrap(sessionId: string): Promise<void> {
    this._pendingRecovery = await this.getRecoveryContext();
  }

  /** Synchronously get cached recovery context. Returns null if nothing cached. */
  consumeRecovery(): string | null {
    const ctx = this._pendingRecovery;
    this._pendingRecovery = null;
    return ctx;
  }

  /** Mark session as closed. No-op if unsupported. */
  async closeSession(sessionId: string): Promise<boolean> {
    if (!this.supported) return false;
    try {
      const result = await this._manager.sessionClose!({ sessionId }) as { closed?: boolean } | undefined;
      return result?.closed === true;
    } catch {
      return false;
    }
  }

  // ——— private ———

  private buildSnapshot(state: SessionState): SessionSnapshot {
    const topTopics = [...state.topics]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);
    const topDecisions = state.decisions.slice(-3);
    const topEntities = state.entities
      .slice(0, 5)
      .map((e) => e.name);

    return {
      sessionId: state.sessionId,
      startedAt: (state as any).startedAt ?? state.lastUpdated,
      lastActiveAt: Date.now(),
      turnCount: state.messageCount,
      currentTopic: topTopics.map((t) => t.label).join(", ") || "unknown",
      recentDecisions: topDecisions.map((d) => d.description),
      pendingItems: [],
      keyEntities: topEntities,
      isClosed: false,
    };
  }

  private formatRecovery(s: SessionSnapshot): string {
    const lines: string[] = ["[Session Recovery]"];
    lines.push(`⚠️ Your previous session was interrupted unexpectedly.`);
    lines.push(`Here's where you left off:`);
    lines.push("");
    lines.push(`**Topic**: ${s.currentTopic}`);
    if (s.activeTask) {
      lines.push(`**Active Task**: ${s.activeTask.description}`);
      lines.push(`**Progress**: ${s.activeTask.progress}`);
    }
    if (s.recentDecisions.length) {
      lines.push("**Key Decisions**:");
      s.recentDecisions.slice(0, 3).forEach((d) => lines.push(`- ${d}`));
    }
    if (s.pendingItems.length) {
      lines.push("**Pending Items**:");
      s.pendingItems.slice(0, 5).forEach((p) => lines.push(`- ${p}`));
    }
    lines.push(`**Last Active**: ${new Date(s.lastActiveAt).toISOString()}`);
    return lines.join("\n");
  }
}
