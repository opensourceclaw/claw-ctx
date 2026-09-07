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

export interface StructuralDigest {
  version: 1;
  sessionId: string;
  /** Cumulative compaction rounds that produced this digest (≥ 1) */
  rounds: number;
  updatedAt: number;
  confirmed: ConfirmedFact[];
  rejected: RejectedApproach[];
  pitfalls: ApiPitfall[];
}

export const DIGEST_SCHEMA_VERSION = 1 as const;
