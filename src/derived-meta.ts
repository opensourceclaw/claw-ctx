/**
 * claw-ctx — Context Engine for OpenClaw
 *
 * Copyright 2026 Peter Cheng
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
 * v6.14.1 (channel separation, batch 1/2) — shared lineage face for derived
 * artifacts. SUPPLY products are read-only, typed, versioned and carry where
 * they came from; nothing derived may be fed back in as a source.
 */

export const DERIVED_META_SCHEMA_VERSION = 1 as const;

export type DerivedBy =
  | "session-summary"
  | "structural-digest"
  | "reset-handoff"
  | "checkpoint"
  | "compaction-summary";

export interface DerivedMeta {
  schemaVersion: typeof DERIVED_META_SCHEMA_VERSION;
  derivedBy: DerivedBy;
  sourceSessionId: string;
  /** Stable transcript entry ids this artifact was compiled from (newest first). */
  sourceEntryIds: string[];
  /** Compaction round, when the producing pipeline has one. */
  round?: number;
  derivedAt?: number;
}

export interface DerivedMetaInput {
  derivedBy: DerivedBy;
  sourceSessionId: string;
  sourceEntryIds?: readonly unknown[];
  round?: number;
  derivedAt?: number;
}

const MAX_SOURCE_ENTRY_IDS = 50;

/** Build a normalized lineage face; unknown ids are dropped, duplicates removed. */
export function makeDerivedMeta(input: DerivedMetaInput): DerivedMeta {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const raw of input.sourceEntryIds ?? []) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (id === "" || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_SOURCE_ENTRY_IDS) break;
  }
  return {
    schemaVersion: DERIVED_META_SCHEMA_VERSION,
    derivedBy: input.derivedBy,
    sourceSessionId: input.sourceSessionId,
    sourceEntryIds: ids,
    ...(input.round !== undefined ? { round: input.round } : {}),
    derivedAt: input.derivedAt ?? Date.now(),
  };
}

export function isDerivedMeta(value: unknown): value is DerivedMeta {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const meta = value as Record<string, unknown>;
  return (
    meta.schemaVersion === DERIVED_META_SCHEMA_VERSION &&
    typeof meta.derivedBy === "string" &&
    typeof meta.sourceSessionId === "string"
  );
}

/**
 * Legacy compaction summaries predate the structured marker; their text shape
 * is still recognizable. Treat them as derived so they are never re-summarized.
 */
export function isLegacyCompactionSummary(content: unknown): boolean {
  return (
    typeof content === "string" &&
    (content.startsWith("[Compacted History — ") || content.startsWith("[Compacted History - "))
  );
}

/** A transcript entry that must never be used as a compaction source. */
export function isDerivedTranscriptEntry(entry: {
  derived?: unknown;
  message?: { content?: unknown } | null;
}): boolean {
  if (isDerivedMeta(entry.derived)) return true;
  return isLegacyCompactionSummary(entry.message?.content);
}
