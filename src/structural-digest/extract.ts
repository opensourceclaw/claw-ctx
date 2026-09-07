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
 * claw-ctx v6.9.0 — Structural Digest extraction (ADR-1/ADR-3)
 *
 * Rule-based extraction over removed (about-to-be-compacted) messages:
 * sentence segmentation → per-class pattern detection → confidence scoring.
 * Confidence below CONFIDENCE_FLOOR never enters the zone (宁缺毋滥).
 */

import {
  CONFIDENCE_FLOOR,
  CONFIDENCE_CAP,
  LINKER_BONUS,
  LEN_BONUS,
  LEN_BONUS_CHARS,
  MIN_SENTENCE_CHARS,
  SNIPPET_MAX_CHARS,
  STRONG_SIGNAL_BASE,
  WEAK_SIGNAL_BASE,
  WEAK_SIGNAL_RAISED,
} from "./constants.js";
import {
  API_SYMBOL,
  CONFIRMED_PATTERNS,
  hasAny,
  LINKERS,
  PITFALL_NEGATIVE,
  REJECTED_PATTERNS,
  REJECT_REASON_SPLIT,
  WORKAROUND_MARKERS,
} from "./patterns.js";
import type {
  ApiPitfall,
  ConfirmedFact,
  Provenance,
  RejectedApproach,
  StructuralDigest,
} from "./types.js";
import { truncateToCapacity } from "./serialize.js";
import { emptyDigest } from "./serialize.js";

export interface DigestSourceMessage {
  /** JSONL entry id (top-level id of the message entry) */
  id?: string;
  role?: string;
  /** string content or multimodal block array (extractText shape) */
  content: unknown;
}

function textOf(msg: DigestSourceMessage): string {
  const c = msg.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((b: unknown) =>
        typeof b === "string" ? b : (b as any)?.text ?? (b as any)?.thinking ?? ""
      )
      .join(" ");
  }
  return String(c ?? "");
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isQuestion(sentence: string): boolean {
  return /[?？]\s*$/.test(sentence);
}

function hasLinker(sentence: string): boolean {
  return hasAny(sentence, LINKERS);
}

function confidenceFor(opts: {
  strong: boolean;
  hasLinker: boolean;
  len: number;
}): number {
  if (!opts.strong) {
    // Weak signal only enters when raised exactly to the floor
    return opts.hasLinker ? WEAK_SIGNAL_RAISED : WEAK_SIGNAL_BASE;
  }
  let score = STRONG_SIGNAL_BASE;
  if (opts.hasLinker) score += LINKER_BONUS;
  if (opts.len > LEN_BONUS_CHARS) score += LEN_BONUS;
  return Math.min(CONFIDENCE_CAP, Math.round(score * 100) / 100);
}

function inferActor(sentence: string): ConfirmedFact["actor"] {
  // 我们/咱们 before 我 — "我们" contains "我"
  if (/(我们|咱们)/.test(sentence)) return "team";
  if (/\b(I|me|my)\b/i.test(sentence) || /我/.test(sentence)) return "user";
  if (/\b(AI|assistant|agent|Jarvis|EDITH|Friday)\b/i.test(sentence)) return "agent";
  if (/\b(we|our|us|let's|lets)\b/i.test(sentence)) return "team";
  return "unknown";
}

function makeProvenance(
  sentence: string,
  msgId: string,
  round: number
): Provenance {
  return {
    msgId,
    snippet: sentence.slice(0, SNIPPET_MAX_CHARS),
    round,
  };
}

/** Split rejected sentence at the first reason linker: {head} {linker} {tail} */
function splitAtLinker(sentence: string): { head: string; tail: string } {
  let best = -1;
  let tailStart = -1;
  for (const p of REJECT_REASON_SPLIT) {
    const m = p.exec(sentence);
    if (m && m.index >= 0 && (best === -1 || m.index < best)) {
      best = m.index;
      tailStart = m.index + m[0].length;
    }
  }
  if (best <= 0) return { head: sentence, tail: "" };
  return {
    head: sentence.slice(0, best).trim().replace(/[,，;；:：]\s*$/, ""),
    tail: sentence.slice(tailStart).trim(),
  };
}

/** Extract confirmed decisions from a sentence */
function extractConfirmed(
  sentence: string,
  msgId: string,
  round: number
): ConfirmedFact | null {
  const strong = hasAny(sentence, CONFIRMED_PATTERNS.strong);
  let conf: number | null = null;

  if (strong) {
    conf = confidenceFor({ strong: true, hasLinker: hasLinker(sentence), len: sentence.length });
  } else if (
    hasAny(sentence, CONFIRMED_PATTERNS.weak) &&
    !hasAny(sentence, CONFIRMED_PATTERNS.suppress)
  ) {
    const c = confidenceFor({ strong: false, hasLinker: hasLinker(sentence), len: sentence.length });
    if (c >= CONFIDENCE_FLOOR) conf = c;
  }
  if (conf === null) return null;

  return {
    claim: sentence.slice(0, 500),
    actor: inferActor(sentence),
    confidence: conf,
    provenance: makeProvenance(sentence, msgId, round),
  };
}

/** Extract rejected approaches from a sentence (approach/reason split) */
function extractRejected(
  sentence: string,
  msgId: string,
  round: number
): RejectedApproach | null {
  if (!hasAny(sentence, REJECTED_PATTERNS.strong)) return null;
  const { head, tail } = splitAtLinker(sentence);
  const approach = (head || sentence).slice(0, 300);
  return {
    approach,
    reason: tail.slice(0, 300),
    confidence: confidenceFor({
      strong: true,
      hasLinker: tail.length > 0 || hasLinker(sentence),
      len: sentence.length,
    }),
    provenance: makeProvenance(sentence, msgId, round),
  };
}

/** Extract API pitfalls (API symbol + negative signal, strong only) */
function extractPitfall(
  sentence: string,
  msgId: string,
  round: number
): ApiPitfall | null {
  if (!hasAny(sentence, PITFALL_NEGATIVE)) return null;

  let api: string | null = null;
  for (const p of API_SYMBOL) {
    const m = p.exec(sentence);
    if (m?.[1]) {
      api = m[1];
      break;
    }
  }
  if (!api) return null;

  let workaround: string | undefined;
  for (const p of WORKAROUND_MARKERS) {
    const m = p.exec(sentence);
    if (m?.[1]) {
      workaround = m[1].trim();
      break;
    }
  }

  return {
    api,
    pitfall: sentence.slice(0, 400),
    workaround,
    confidence: confidenceFor({
      strong: true,
      hasLinker: hasLinker(sentence),
      len: sentence.length,
    }),
    provenance: makeProvenance(sentence, msgId, round),
  };
}

/**
 * Extract a fresh digest from removed messages (per compaction round).
 * Entries below CONFIDENCE_FLOOR are dropped (宁缺毋滥).
 */
export function extractFromMessages(
  messages: DigestSourceMessage[],
  sessionId: string,
  round: number
): StructuralDigest {
  const confirmed: ConfirmedFact[] = [];
  const rejected: RejectedApproach[] = [];
  const pitfalls: ApiPitfall[] = [];

  for (const msg of messages) {
    const text = textOf(msg);
    const msgId = msg.id ?? "unknown";
    for (const raw of splitSentences(text)) {
      const sentence = raw.replace(/\s+/g, " ").trim();
      if (sentence.length < MIN_SENTENCE_CHARS || isQuestion(sentence)) continue;

      const c = extractConfirmed(sentence, msgId, round);
      if (c) confirmed.push(c);

      const r = extractRejected(sentence, msgId, round);
      if (r) rejected.push(r);

      const p = extractPitfall(sentence, msgId, round);
      if (p) pitfalls.push(p);
    }
  }

  return {
    version: 1,
    sessionId,
    rounds: round,
    updatedAt: Date.now(),
    confirmed,
    rejected,
    pitfalls,
  };
}

function mergeEntryList<T extends { confidence: number; provenance: Provenance }>(
  prev: T[],
  next: T[],
  keyOf: (e: T) => string
): T[] {
  const map = new Map<string, T>();
  for (const e of prev) map.set(keyOf(e), e);
  for (const e of next) {
    const key = keyOf(e);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, e);
    } else {
      // Same claim: keep newest source (later round is more precise), win confidence
      map.set(key, { ...e, confidence: Math.max(existing.confidence, e.confidence) });
    }
  }
  return [...map.values()];
}

function norm(key: string): string {
  return key.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Merge persisted digest (previous rounds) with this round's fresh extraction.
 * Same-claim detection is conservative normalized-equality (no fuzzy match —
 * prevents over-deduplication swallowing genuinely new conclusions).
 */
export function mergeDigest(
  prev: StructuralDigest | null,
  next: StructuralDigest
): StructuralDigest {
  if (!prev) return next;
  return {
    version: 1,
    sessionId: prev.sessionId || next.sessionId,
    rounds: next.rounds,
    updatedAt: next.updatedAt,
    confirmed: mergeEntryList(prev.confirmed, next.confirmed, (e) => norm(e.claim)),
    rejected: mergeEntryList(prev.rejected, next.rejected, (e) => norm(`${e.approach}|${e.reason}`)),
    pitfalls: mergeEntryList(prev.pitfalls, next.pitfalls, (e) => norm(`${e.api}|${e.pitfall}`)),
  };
}

/**
 * Full pipeline for one compaction round:
 * extract → merge with persisted digest → capacity truncation.
 * Returns null when nothing qualified (caller must skip the digest entry —
 * compaction output then matches the pre-v6.9.0 bytes exactly).
 */
export function runStructuralDigest(
  removedMsgs: DigestSourceMessage[],
  oldDigest: StructuralDigest | null,
  sessionId: string,
  round: number
): StructuralDigest | null {
  const next = extractFromMessages(removedMsgs, sessionId, round);
  const merged = mergeDigest(oldDigest, next);
  const { digest } = truncateToCapacity(merged);
  if (emptyDigest(digest)) return null;
  return digest;
}
