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
import { makeDerivedMeta } from "./derived-meta.js";

export const RESET_HANDOFF_TAG = "reset-handoff";

/** v6.14.1: identifier surface so post-reset recall keeps concrete file/ID names. */
export const HANDOFF_IDENTIFIER_LIMIT = 20;
export const HANDOFF_RECENT_USER_LIMIT = 3;
const HANDOFF_RECENT_USER_CHARS = 300;
const FILE_TOKEN_PATTERN = /[\p{L}\p{N}._/-]+\.(?:md|ts|json|tsx|js)/gu;
const ID_TOKEN_PATTERN = /(?:task|pipeline|回执|receipt)-[\w.-]+/gu;

function collectTokens(
  text: string,
  pattern: RegExp,
  limit: number,
  seen: Set<string>,
): string[] {
  const values: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const value = match[0];
    if (value === "" || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
    if (values.length >= limit) break;
  }
  return values;
}

export interface HandoffIdentifiers {
  readonly pendingFiles: string[];
  readonly pendingIds: string[];
  readonly recentUserMessages: string[];
}

/**
 * v6.14.2 — extract concrete identifiers from the messages being reset.
 *
 * P2-2: scan from the NEWEST message backwards so the cap keeps the most
 * recent identifiers (consistent with recentUserMessages). Class-local dedupe
 * keeps the newest occurrence; within a message the natural token order is
 * preserved. Bounded and deterministic (≤ limit per class).
 */
export function extractHandoffIdentifiers(
  messages: readonly NormalizedMessage[],
): HandoffIdentifiers {
  const fileSeen = new Set<string>();
  const idSeen = new Set<string>();
  const pendingFiles: string[] = [];
  const pendingIds: string[] = [];

  for (
    let index = messages.length - 1;
    index >= 0 &&
    (pendingFiles.length < HANDOFF_IDENTIFIER_LIMIT ||
      pendingIds.length < HANDOFF_IDENTIFIER_LIMIT);
    index--
  ) {
    const content = messages[index].content;
    if (pendingFiles.length < HANDOFF_IDENTIFIER_LIMIT) {
      pendingFiles.push(
        ...collectTokens(
          content,
          FILE_TOKEN_PATTERN,
          HANDOFF_IDENTIFIER_LIMIT - pendingFiles.length,
          fileSeen,
        ),
      );
    }
    if (pendingIds.length < HANDOFF_IDENTIFIER_LIMIT) {
      pendingIds.push(
        ...collectTokens(
          content,
          ID_TOKEN_PATTERN,
          HANDOFF_IDENTIFIER_LIMIT - pendingIds.length,
          idSeen,
        ),
      );
    }
  }

  const recentUserMessages = messages
    .filter((message) => message.role === "user")
    .slice(-HANDOFF_RECENT_USER_LIMIT)
    .map((message) => message.content.slice(0, HANDOFF_RECENT_USER_CHARS));
  return { pendingFiles, pendingIds, recentUserMessages };
}

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
  id?: string;
}

function messageText(message: unknown): { role: string; content: string; id?: string } {
  if (typeof message === "string") return { role: "user", content: message };
  if (!message || typeof message !== "object") return { role: "user", content: "" };
  const record = message as Record<string, unknown>;
  const role = typeof record.role === "string" ? record.role : "user";
  const id = typeof record.id === "string" && record.id.trim() !== "" ? record.id.trim() : undefined;
  const content = record.content;
  if (typeof content === "string") return { role, content, ...(id ? { id } : {}) };
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
    return { role, content: text, ...(id ? { id } : {}) };
  }
  return { role, content: "", ...(id ? { id } : {}) };
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
      const identifiers = extractHandoffIdentifiers(messages);
      // Extra fields are additive; HistoryLoader JSON-parses the same object,
      // and pre-v6.14.1 payloads without these fields stay valid.
      const payload = JSON.stringify({
        ...summary,
        ...identifiers,
        derived: makeDerivedMeta({
          derivedBy: "reset-handoff",
          sourceSessionId: sessionId,
          sourceEntryIds: messages.map((message) => message.id),
        }),
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
