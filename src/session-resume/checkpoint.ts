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

/**
 * v5.9.0: Logger interface for detailed checkpoint logging
 */
interface CheckpointLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/**
 * Default console logger implementation
 */
const defaultLogger: CheckpointLogger = {
  info: (msg, data) => console.log(`[CheckpointManager] INFO: ${msg}`, data || ""),
  warn: (msg, data) => console.warn(`[CheckpointManager] WARN: ${msg}`, data || ""),
  error: (msg, data) => console.error(`[CheckpointManager] ERROR: ${msg}`, data || ""),
};

export class CheckpointManager {
  private _config: CheckpointConfig;
  private _turnCounter = 0;
  private _pendingRecovery: string | null = null;
  private _logger: CheckpointLogger;
  private _lastCheckpointTime: number = 0;
  private _checkpointCount: number = 0;

  constructor(
    private _manager: MinimalMemoryManager,
    config?: Partial<CheckpointConfig>,
    private _getSessionState?: () => SessionState | null,
    logger?: CheckpointLogger,
  ) {
    this._config = {
      mode: "every_turn",
      interval: 1,
      maxRecoveryAgeHours: 48,
      ...config,
    };
    this._logger = logger ?? defaultLogger;
  }

  /** Feature detection: is claw-mem >= v6.27.0 available? */
  get supported(): boolean {
    const hasSessionSnapshot = typeof this._manager.sessionSnapshot === "function";
    const hasSessionGetUnclosed = typeof this._manager.sessionGetUnclosed === "function";
    return hasSessionSnapshot && hasSessionGetUnclosed;
  }

  /** v5.9.0: Get checkpoint statistics */
  get stats(): { checkpointCount: number; lastCheckpointTime: number; mode: string } {
    return {
      checkpointCount: this._checkpointCount,
      lastCheckpointTime: this._lastCheckpointTime,
      mode: this._config.mode,
    };
  }

  /** Create snapshot from current SessionState. No-op if unsupported or disabled. */
  checkpoint(sessionState?: SessionState | null): boolean {
    if (!this.supported) {
      this._logger.info("checkpoint skipped - not supported");
      return false;
    }

    if (this._config.mode === "disabled") {
      this._logger.info("checkpoint skipped - mode is disabled");
      return false;
    }

    const state = sessionState ?? this._getSessionState?.();
    if (!state) {
      this._logger.warn("checkpoint skipped - no session state available");
      return false;
    }

    if (this._config.mode === "every_n_turns") {
      this._turnCounter++;
      if (this._turnCounter < this._config.interval) {
        return false;
      }
      this._turnCounter = 0;
    }

    try {
      const snapshot: SessionSnapshot = this.buildSnapshot(state);

      // v5.9.0: Detailed logging before snapshot
      this._logger.info("saving session snapshot", {
        sessionId: snapshot.sessionId,
        turnCount: snapshot.turnCount,
        currentTopic: snapshot.currentTopic,
      });

      this._manager.sessionSnapshot!({ snapshot });

      this._checkpointCount++;
      this._lastCheckpointTime = Date.now();

      this._logger.info("snapshot stored", {
        checkpointCount: this._checkpointCount,
      });

      return true;
    } catch (error) {
      // v5.9.0: Detailed error logging instead of silent catch
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this._logger.error("snapshot storage failed", {
        error: errorMsg,
        stack: errorStack,
        sessionId: state.sessionId,
      });
      return false;
    }
  }

  /** Fetch unclosed sessions and format recovery context. No-op if unsupported.
   * v5.11.3: Accept optional currentSessionId to filter out the session that was
   * just opened (so it is not treated as an interrupted session to recover from).
   */
  async getRecoveryContext(currentSessionId?: string): Promise<string | null> {
    if (!this.supported) {
      this._logger.warn("getRecoveryContext skipped - not supported");
      return null;
    }

    try {
      this._logger.info("fetching unclosed sessions for recovery", { currentSessionId });

      const result = (await this._manager.sessionGetUnclosed!()) as { sessions?: SessionSnapshot[] } | undefined;
      const allUnclosed = result?.sessions ?? [];

      // v5.11.3: Filter out the current session so it is not injected as its own recovery context.
      const unclosed = currentSessionId
        ? allUnclosed.filter((s) => s.sessionId !== currentSessionId)
        : allUnclosed;

      this._logger.info("unclosed sessions found", {
        count: unclosed.length,
        totalBeforeFilter: allUnclosed.length,
        filteredOut: allUnclosed.length - unclosed.length,
      });

      if (unclosed.length === 0) {
        this._logger.info("no unclosed sessions to recover");
        return null;
      }

      const ctx = unclosed
        .map((s) => this.formatRecovery(s))
        .join("\n\n---\n\n");
      this._pendingRecovery = ctx;

      this._logger.info("recovery context prepared", {
        length: ctx.length,
        sessionCount: unclosed.length,
      });

      return ctx;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this._logger.error("getRecoveryContext failed", {
        error: errorMsg,
      });
      return null;
    }
  }

  /** Bootstrap pre-fetch: load recovery context and cache for synchronous injection.
   * v5.11.3: Pass sessionId to filter out the current session from recovery candidates.
   */
  async bootstrap(sessionId: string): Promise<void> {
    this._logger.info("bootstrap started", { sessionId });
    this._pendingRecovery = await this.getRecoveryContext(sessionId);
    this._logger.info("bootstrap completed", {
      hasRecoveryContext: this._pendingRecovery !== null,
    });
  }

  /** Synchronously get cached recovery context. Returns null if nothing cached. */
  consumeRecovery(): string | null {
    const ctx = this._pendingRecovery;
    this._pendingRecovery = null;

    if (ctx) {
      this._logger.info("recovery context consumed", { length: ctx.length });
    } else {
      this._logger.info("no recovery context to consume");
    }

    return ctx;
  }

  /** Mark session as closed. No-op if unsupported. */
  async closeSession(sessionId: string): Promise<boolean> {
    if (!this.supported) {
      this._logger.warn("closeSession skipped - not supported");
      return false;
    }

    try {
      this._logger.info("closing session", { sessionId });

      const result = await this._manager.sessionClose!({ sessionId }) as { closed?: boolean } | undefined;
      const closed = result?.closed === true;

      if (closed) {
        this._logger.info("session closed successfully", { sessionId });
      } else {
        this._logger.warn("session close returned unexpected result", {
          sessionId,
          result: JSON.stringify(result),
        });
      }

      return closed;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this._logger.error("closeSession failed", {
        sessionId,
        error: errorMsg,
      });
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
