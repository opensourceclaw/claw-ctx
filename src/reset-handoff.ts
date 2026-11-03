/**
 * claw-ctx — Context Engine for OpenClaw
 *
 * Copyright 2026 Peter Cheng
 * Licensed under the Apache License, Version 2.0
 */

/**
 * v6.14.0 — reset-boundary continuity handoff.
 *
 * Root cause this closes (2026-11-03 incident): OpenClaw's daily session reset
 * (`session.reset.mode = "daily"`) appends a `reset` boundary and the next turn
 * starts with an empty live window. claw-ctx's compaction never ran (ownsCompaction
 * path is not the same as a host reset), and no session summary existed for the
 * pre-reset turns, so `assemble()` had nothing to re-inject.
 *
 * The host exposes a `before_reset` plugin hook carrying the transcript messages
 * about to be dropped. This module turns those messages into a durable
 * `session_summary` memory (same shape HistoryLoader consumes), so the next
 * cold-start `assemble()` can inject `[Session History]` and restore continuity.
 */

import { SummaryGenerator } from "./session-resume/summary-generator.js";
import type { SessionSummary } from "./session-resume/types.js";

export const RESET_HANDOFF_TAG = "reset-handoff";

interface MemoryStore {
  store(
    content: string,
    type: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
  ): Promise<unknown> | unknown;
}

export interface ResetHandoffParams {
  readonly sessionId: string;
  readonly sessionKey?: string;
  readonly reason?: string;
  readonly messages?: readonly unknown[];
}

export interface ResetHandoffResult {
  readonly stored: boolean;
  readonly reason?: string;
  readonly summary?: SessionSummary;
}

interface NormalizedMessage {
  role: string;
  content: string;
}

function messageText(message: unknown): { role: string; content: string } {
  if (typeof message === "string") return { role: "user", content: message };
  if (!message || typeof message !== "object") return { role: "user", content: "" };
  const record = message as Record<string, unknown>;
  const role = typeof record.role === "string" ? record.role : "user";
  const content = record.content;
  if (typeof content === "string") return { role, content };
  if (Array.isArray(content)) {
    const text = content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object") {
          const b = block as Record<string, unknown>;
          if (typeof b.text === "string") return b.text;
        }
        return "";
      })
      .filter((part) => part.length > 0)
      .join("\n");
    return { role, content: text };
  }
  return { role, content: "" };
}

export class ResetHandoff {
  constructor(
    private readonly manager: MemoryStore,
    private readonly logger?: { warn: (...args: unknown[]) => void },
  ) {}

  /**
   * Persist a session summary for the messages being reset. Non-blocking by
   * contract: failures are reported, never thrown into the host hook.
   */
  async capture(params: ResetHandoffParams): Promise<ResetHandoffResult> {
    const sessionId = typeof params.sessionId === "string" ? params.sessionId.trim() : "";
    if (sessionId === "") return { stored: false, reason: "missing sessionId" };

    const messages: NormalizedMessage[] = (params.messages ?? [])
      .map(messageText)
      .filter((message) => message.content.trim() !== "");
    if (messages.length < 3) {
      return { stored: false, reason: `too few messages (${messages.length})` };
    }

    try {
      const summary = new SummaryGenerator().generate(messages, sessionId);
      // Extra fields are additive; HistoryLoader JSON-parses the same object.
      const payload = JSON.stringify({
        ...summary,
        handoffReason: params.reason ?? "unknown",
        handoffAt: Date.now(),
        sessionKey: params.sessionKey ?? null,
      });
      await this.manager.store(payload, "episodic", [
        RESET_HANDOFF_TAG,
        "session_summary",
        "continuity",
      ], {
        sessionId,
        timestamp: summary.timestamp,
        messageCount: summary.messageCount,
        resetReason: params.reason ?? "unknown",
      });
      return { stored: true, summary };
    } catch (error) {
      this.logger?.warn(`[claw-ctx] reset handoff store failed (non-blocking): ${String(error)}`);
      return { stored: false, reason: String(error) };
    }
  }
}
