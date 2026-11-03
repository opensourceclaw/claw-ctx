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
 * claw-ctx v6.9.0 — Structural Digest types (ADR-1/ADR-3)
 *
 * Protected structural digest retained across compaction rounds:
 * confirmed facts/decisions/dependencies, rejected approaches, API pitfalls.
 * confidence + provenance are MANDATORY on every entry (garbage gate).
 */

import type { DerivedMeta } from "../derived-meta.js";

export interface Provenance {
  /** Source JSONL entry id */
  msgId: string;
  /** Original text segment (truncated, ≤ SNIPPET_MAX_CHARS) */
  snippet: string;
  /** Compaction round in which the entry was captured */
  round: number;
}

/** Class 1: confirmed decisions / facts / dependencies ("X calls Y via Z") */
export interface ConfirmedFact {
  claim: string;
  actor?: "user" | "team" | "agent" | "unknown";
  confidence: number;
  provenance: Provenance;
}

/** Class 2: explored-and-excluded approaches ("A rejected because B") */
export interface RejectedApproach {
  approach: string;
  /** Empty string when source gives no explicit reason (kept honest) */
  reason: string;
  confidence: number;
  provenance: Provenance;
}

/** Class 3: API contract pitfalls ("X.method() fails on empty input") */
export interface ApiPitfall {
  api: string;
  pitfall: string;
  workaround?: string;
  confidence: number;
  provenance: Provenance;
}

/* ── v6.15.0 (claims v2): claim-evidence ledger ───────────────────── */

export type ClaimKind =
  | "fact"
  | "decision"
  | "pending"
  | "rejected"
  | "pitfall"
  | "other";

/**
 * One verbatim evidence unit captured from a removed raw message.
 * `span` MUST be a substring of the source message; invalid spans are dropped
 * (model proposes, source disposes). `seq` is only present when the host
 * supplies a transcript sequence anchor (compact params currently do not).
 */
export interface ClaimEvidence {
  /** Normalized one-liner (≤ CLAIM_MAX_CHARS) */
  claim: string;
  kind: ClaimKind;
  /** Verbatim slice from the source message (≤ CLAIM_SPAN_MAX_CHARS) */
  span: string;
  sessionId: string;
  /** Host transcript entry id (primary anchor) */
  entryId: string;
  /** Optional strong anchor (host transcript_events.seq) */
  seq?: number;
  round: number;
  /** Heuristic score; no confidence floor for claims. */
  confidence?: number;
}

export interface StructuralDigest {
  /** 2 when a claims ledger is present; 1 for legacy digests. */
  version: 1 | 2;
  sessionId: string;
  /** Cumulative compaction rounds that produced this digest (≥ 1) */
  rounds: number;
  updatedAt: number;
  confirmed: ConfirmedFact[];
  rejected: RejectedApproach[];
  pitfalls: ApiPitfall[];
  /** v6.15.0 additive: verbatim claim ledger (v1 views above stay intact). */
  claims?: ClaimEvidence[];
  /** v6.14.1 additive lineage face (not serialized in v1 text; kept on the entry). */
  derived?: DerivedMeta;
}

export const DIGEST_SCHEMA_VERSION = 2 as const;
