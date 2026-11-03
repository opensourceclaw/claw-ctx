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
 * claw-ctx v6.9.0 — Structural Digest serialization (ADR-2/ADR-3)
 *
 * Text form injected into the compacted context (readable + traceable):
 *
 *   [STRUCTURAL-DIGEST v1]
 *   -- 已确认 --
 *   - <claim> (actor: team) [src <msgId>: <snippet80>]
 *   -- 已否决 --
 *   - <approach>: <reason> [src <msgId>: <snippet80>]
 *   -- API 契约与坑 --
 *   - <api>: <pitfall> (workaround: x) [src <msgId>: <snippet80>]
 *
 * Capacity truncation (priority: rejected > confirmed > pitfalls; class-internal
 * by confidence desc, then newer round first). Parse is lossy by design:
 * confidence/round rebuild at floor/0 so re-serialization stays idempotent and
 * fresh extractions win over persisted entries on equal claims (conservative).
 *
 * v6.10.0: the error-card reminder block is a separate stable-prefix block with
 * its own budget (ERROR_CARD_BLOCK_MAX_TOKENS, joint design §3.3). In the
 * protected-region priority order it slots as
 * rejected > error-cards > confirmed > pitfalls — whole-block drop at budget.
 * This serializer itself never emits card blocks; digest behavior is unchanged
 * (frozen surface).
 */

import {
  CLAIM_SPAN_MAX_CHARS,
  CONFIDENCE_FLOOR,
  DIGEST_MAX_TOKENS,
  DIGEST_PREFIX,
  DIGEST_PREFIX_V2,
  ITEM_TEXT_MAX_CHARS,
  PARSE_REBUILD_CONFIDENCE,
  PARSE_REBUILD_ROUND,
  SECTION_CONFIRMED,
  SECTION_PITFALLS,
  SECTION_REJECTED,
  SNIPPET_DISPLAY_CHARS,
  SNIPPET_MAX_CHARS,
} from "./constants.js";
import type {
  ApiPitfall,
  ClaimEvidence,
  ClaimKind,
  ConfirmedFact,
  Provenance,
  RejectedApproach,
  StructuralDigest,
} from "./types.js";
import { createTokenCounter, FallbackCounter } from "../token-counter.js";

const CLAIM_KINDS: readonly ClaimKind[] = [
  "fact",
  "decision",
  "pending",
  "rejected",
  "pitfall",
  "other",
];

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max)}...`;

const clipSnippet = (p: Provenance): string => clip(p.snippet, SNIPPET_DISPLAY_CHARS);

function confirmedLine(e: ConfirmedFact): string {
  const actor = e.actor && e.actor !== "unknown" ? ` (actor: ${e.actor})` : "";
  return `- ${clip(e.claim, ITEM_TEXT_MAX_CHARS)}${actor} [src ${e.provenance.msgId}: ${clipSnippet(e.provenance)}]`;
}

function rejectedLine(e: RejectedApproach): string {
  const body =
    e.reason.length > 0
      ? `${clip(e.approach, ITEM_TEXT_MAX_CHARS)}: ${clip(e.reason, ITEM_TEXT_MAX_CHARS)}`
      : clip(e.approach, ITEM_TEXT_MAX_CHARS);
  return `- ${body} [src ${e.provenance.msgId}: ${clipSnippet(e.provenance)}]`;
}

function pitfallLine(e: ApiPitfall): string {
  const w = e.workaround ? ` (workaround: ${clip(e.workaround, 80)})` : "";
  return `- ${clip(e.api, 120)}: ${clip(e.pitfall, ITEM_TEXT_MAX_CHARS)}${w} [src ${e.provenance.msgId}: ${clipSnippet(e.provenance)}]`;
}

/** Compact machine-readable claim line (ignored by v1 parsers). */
export function claimLine(claim: ClaimEvidence): string {
  const obj: Record<string, unknown> = { k: claim.kind, e: claim.entryId, r: claim.round };
  if (claim.confidence !== undefined) obj.c = claim.confidence;
  if (claim.seq !== undefined) obj.n = claim.seq;
  obj.s = claim.claim;
  obj.q = claim.span;
  return `@claim ${JSON.stringify(obj)}`;
}

function claimsBlock(d: StructuralDigest): string[] {
  const claims = d.claims ?? [];
  if (claims.length === 0) return [];
  return [`@claims ${claims.length} ${d.sessionId}`, ...claims.map(claimLine)];
}

/** Serialize digest to its injected text form. Returns null when empty. */
export function serializeDigest(d: StructuralDigest): string | null {
  const sections: string[] = [];
  if (d.confirmed.length > 0) {
    sections.push(SECTION_CONFIRMED, ...d.confirmed.map(confirmedLine));
  }
  if (d.rejected.length > 0) {
    sections.push(SECTION_REJECTED, ...d.rejected.map(rejectedLine));
  }
  if (d.pitfalls.length > 0) {
    sections.push(SECTION_PITFALLS, ...d.pitfalls.map(pitfallLine));
  }
  const claims = d.claims ?? [];
  if (sections.length === 0 && claims.length === 0) return null;
  const prefix = claims.length > 0 ? DIGEST_PREFIX_V2 : DIGEST_PREFIX;
  return [prefix, ...sections, ...claimsBlock(d)].join("\n");
}

/** True when no entry qualifies in any class (views or claims) */
export function emptyDigest(d: StructuralDigest): boolean {
  return (
    d.confirmed.length === 0 &&
    d.rejected.length === 0 &&
    d.pitfalls.length === 0 &&
    (d.claims ?? []).length === 0
  );
}

const LINE_RE = /^- (.+?) \[src ([^:]*): ([^\]]*)\]$/;

function parseActorOrWorkaround(body: string): { text: string; value?: string } {
  const m = body.match(/^(.*?)\s+\((actor|workaround):\s*([^)]+)\)$/);
  if (!m) return { text: body };
  return { text: m[1].trim(), value: m[3].trim() };
}

function parseEntry(body: string, rawSnippet: string): { ok: boolean } {
  if (rawSnippet.length > SNIPPET_MAX_CHARS) return { ok: false };
  if (body.length === 0) return { ok: false };
  return { ok: true };
}

function rebuildProvenance(msgId: string, snippet: string): Provenance {
  return { msgId, snippet, round: PARSE_REBUILD_ROUND };
}

function parseClaimLine(line: string, sessionId: string): ClaimEvidence | null {
  let raw: any;
  try {
    raw = JSON.parse(line.slice("@claim ".length));
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (!CLAIM_KINDS.includes(raw.k)) return null;
  if (typeof raw.e !== "string" || raw.e === "") return null;
  if (typeof raw.r !== "number" || !Number.isFinite(raw.r)) return null;
  if (typeof raw.s !== "string" || raw.s === "") return null;
  if (typeof raw.q !== "string" || raw.q === "" || raw.q.length > CLAIM_SPAN_MAX_CHARS) {
    return null;
  }
  const claim: ClaimEvidence = {
    claim: raw.s,
    kind: raw.k,
    span: raw.q,
    sessionId,
    entryId: raw.e,
    round: raw.r,
  };
  if (typeof raw.c === "number" && Number.isFinite(raw.c)) claim.confidence = raw.c;
  if (typeof raw.n === "number" && Number.isFinite(raw.n)) claim.seq = raw.n;
  return claim;
}

/**
 * Parse persisted digest text back into an object. Accepts v1 and v2 text.
 * v1 sections are lossy-rebuilt (confidence = floor, round = 0); v2 claim
 * lines keep their verbatim span/round. Invalid entries are skipped (never
 * crash compaction on bad persisted data).
 */
export function parseDigest(text: string): StructuralDigest | null {
  const isV2 = text.startsWith(DIGEST_PREFIX_V2);
  if (!isV2 && !text.startsWith(DIGEST_PREFIX)) return null;
  const lines = text.split("\n");
  const confirmed: ConfirmedFact[] = [];
  const rejected: RejectedApproach[] = [];
  const pitfalls: ApiPitfall[] = [];
  const claims: ClaimEvidence[] = [];
  let claimsSessionId = "";

  let section: "confirmed" | "rejected" | "pitfalls" | null = null;
  for (const raw of lines.slice(1)) {
    const line = raw.trimEnd();
    if (line.startsWith("@claims ")) {
      // "@claims <count> <sessionId...>"
      const rest = line.slice("@claims ".length);
      const splitAt = rest.indexOf(" ");
      claimsSessionId = splitAt === -1 ? "" : rest.slice(splitAt + 1).trim();
      continue;
    }
    if (line.startsWith("@claim ")) {
      const claim = parseClaimLine(line, claimsSessionId);
      if (claim) claims.push(claim);
      continue;
    }
    if (line === SECTION_CONFIRMED) {
      section = "confirmed";
      continue;
    }
    if (line === SECTION_REJECTED) {
      section = "rejected";
      continue;
    }
    if (line === SECTION_PITFALLS) {
      section = "pitfalls";
      continue;
    }
    const m = line.match(LINE_RE);
    if (!m || !section) continue;
    const body = m[1].trim();
    const msgId = m[2].trim();
    const snippet = m[3].trim();
    if (!parseEntry(body, snippet).ok) continue;
    const provenance = rebuildProvenance(msgId, snippet);

    if (section === "confirmed") {
      const { text: clean, value } = parseActorOrWorkaround(body);
      const actor = ["user", "team", "agent", "unknown"].includes(value ?? "")
        ? (value as ConfirmedFact["actor"])
        : undefined;
      confirmed.push({ claim: clean.trim(), actor, confidence: PARSE_REBUILD_CONFIDENCE, provenance });
    } else if (section === "rejected") {
      const cIdx = body.indexOf(": ");
      const approach = (cIdx === -1 ? body : body.slice(0, cIdx)).trim();
      const reason = cIdx === -1 ? "" : body.slice(cIdx + 2).trim();
      rejected.push({ approach, reason, confidence: PARSE_REBUILD_CONFIDENCE, provenance });
    } else {
      const cIdx = body.indexOf(": ");
      const { text: clean, value } = parseActorOrWorkaround(body);
      const [apiPart, pitfallPart] =
        cIdx === -1 ? [body, clean] : [clean.slice(0, cIdx), clean.slice(cIdx + 2)];
      pitfalls.push({
        api: apiPart.trim(),
        pitfall: pitfallPart.trim(),
        workaround: value,
        confidence: PARSE_REBUILD_CONFIDENCE,
        provenance,
      });
    }
  }

  if (
    confirmed.length === 0 &&
    rejected.length === 0 &&
    pitfalls.length === 0 &&
    claims.length === 0
  ) {
    return null;
  }
  return {
    version: isV2 || claims.length > 0 ? 2 : 1,
    sessionId: claimsSessionId,
    rounds: PARSE_REBUILD_ROUND,
    updatedAt: 0,
    confirmed,
    rejected,
    pitfalls,
    ...(claims.length > 0 ? { claims } : {}),
  };
}

/**
 * Authoritative token count for the digest budget: tiktoken cl100k_base via
 * the same `createTokenCounter()` used by engine.ts (Edith P1-A: chars/4
 * undercounted claim-heavy text by 18–24%, CJK by >2×).
 */
const digestTokenCounter = createTokenCounter("cl100k_base");
const DIGEST_TOKEN_CACHE = new Map<string, number>();
const MAX_DIGEST_TOKEN_CACHE = 4000;

function estimateTokensOf(text: string): number {
  const key =
    text.length < 500
      ? text
      : `L${text.length}|${text.slice(0, 30)}|${text.slice(-30)}`;
  const cached = DIGEST_TOKEN_CACHE.get(key);
  if (cached !== undefined) return cached;

  let tokens: number;
  if (digestTokenCounter.isPrecise()) {
    try {
      tokens = digestTokenCounter.count(text).tokens;
    } catch {
      tokens = FallbackCounter.estimate(text);
    }
  } else {
    tokens = FallbackCounter.estimate(text);
  }
  if (DIGEST_TOKEN_CACHE.size >= MAX_DIGEST_TOKEN_CACHE) DIGEST_TOKEN_CACHE.clear();
  DIGEST_TOKEN_CACHE.set(key, tokens);
  return tokens;
}

type AnyEntry = ConfirmedFact | RejectedApproach | ApiPitfall;

/**
 * Cut priority of an entry — smaller sorts earlier for removal.
 * Class order: pitfalls(0) < confirmed(1) < rejected(2); class-internal by
 * lower confidence first, then older round first. Exported for tests to lock
 * the truncation ordering without depending on token estimates.
 */
export function cutRank(e: AnyEntry): [number, number, number] {
  const rank =
    (e as ConfirmedFact).claim !== undefined ? 1
      : (e as RejectedApproach).approach !== undefined ? 2
      : 0;
  return [rank, e.confidence, e.provenance.round];
}

function entryText(e: AnyEntry): string {
  if ((e as ConfirmedFact).claim !== undefined) return confirmedLine(e as ConfirmedFact);
  if ((e as RejectedApproach).approach !== undefined) return rejectedLine(e as RejectedApproach);
  return pitfallLine(e as ApiPitfall);
}

/**
 * Cut priority for claims — smaller sorts earlier for removal:
 * other(0) < pitfall(1) < fact/decision(2) < rejected/pending(3).
 * Class-internal: lower confidence first, then older round.
 */
export function claimCutRank(c: ClaimEvidence): [number, number, number] {
  const rank =
    c.kind === "other"
      ? 0
      : c.kind === "pitfall"
        ? 1
        : c.kind === "rejected" || c.kind === "pending"
          ? 3
          : 2; // fact / decision
  return [rank, c.confidence ?? 0, c.round];
}

/**
 * Capacity truncation (ADR-3 §6.2, extended for claims v2): overflow is cut
 * by priority across the v1 views and the claims ledger. Views keep their
 * legacy order (pitfalls < confirmed < rejected); claims are cut
 * other < pitfall < fact/decision < rejected/pending. Class-internal by lower
 * confidence first, then older round. Silent tail-cut; returns dropped count.
 */
const cmpTuple4 = (
  a: [number, number, number, number],
  b: [number, number, number, number]
): number => {
  for (let i = 0; i < 4; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
};

export function truncateToCapacity(
  d: StructuralDigest,
  maxTokens: number = DIGEST_MAX_TOKENS
): { digest: StructuralDigest; dropped: number } {
  const lists: Array<[keyof StructuralDigest & ("confirmed" | "rejected" | "pitfalls"), AnyEntry[]]> = [
    ["confirmed", d.confirmed],
    ["rejected", d.rejected],
    ["pitfalls", d.pitfalls],
  ];
  const claims = d.claims ?? [];

  const lineCost = (line: string): number => estimateTokensOf(line) + 1; // newline
  const cost = (): number => {
    let total = 0;
    for (const [, entries] of lists) {
      for (const entry of entries) total += lineCost(entryText(entry as AnyEntry));
    }
    if (claims.length > 0) {
      total += lineCost(`@claims ${claims.length} ${d.sessionId}`);
      for (const claim of claims) total += lineCost(claimLine(claim));
    }
    return total;
  };

  let dropped = 0;
  const dropLowest = (): boolean => {
    let cut:
      | {
          kind: "view";
          key: "confirmed" | "rejected" | "pitfalls";
          idx: number;
          tuple: [number, number, number, number];
        }
      | { kind: "claim"; idx: number; tuple: [number, number, number, number] }
      | null = null;

    // Tuple: [tier, surface, confidence, round] — smaller cuts first.
    // surface 0 = legacy view, 1 = claim: at equal tier views are cut first,
    // so the evidence ledger always outlives same-tier low-fidelity views
    // (Edith P2-A inversion fix). Legacy view ranks (pitfall 0 / confirmed 1 /
    // rejected 2) are mapped into claim space (other 0 / pitfall 1 / fact 2 /
    // rejected 3).
    for (const [key, entries] of lists) {
      for (let i = 0; i < entries.length; i++) {
        const legacy = cutRank(entries[i] as AnyEntry);
        const tuple: [number, number, number, number] = [legacy[0] + 1, 0, legacy[1], legacy[2]];
        if (cut === null || cmpTuple4(tuple, cut.tuple) < 0) {
          cut = { kind: "view", key, idx: i, tuple };
        }
      }
    }
    for (let i = 0; i < claims.length; i++) {
      const rank = claimCutRank(claims[i]);
      const tuple: [number, number, number, number] = [rank[0], 1, rank[1], rank[2]];
      if (cut === null || cmpTuple4(tuple, cut.tuple) < 0) {
        cut = { kind: "claim", idx: i, tuple };
      }
    }
    if (cut === null) return false;

    if (cut.kind === "claim") {
      claims.splice(cut.idx, 1);
    } else {
      (d[cut.key] as AnyEntry[]).splice(cut.idx, 1);
    }
    dropped++;
    return true;
  };

  while (cost() > maxTokens) {
    if (!dropLowest()) break;
  }
  // Authoritative check on the real serialized text (BPE/newline boundary-safe).
  for (;;) {
    const text = serializeDigest(d);
    if (text === null || estimateTokensOf(text) <= maxTokens) break;
    if (!dropLowest()) break;
  }

  if (claims.length > 0) {
    d.claims = claims;
    d.version = 2;
  } else {
    delete d.claims;
    d.version = 1;
  }
  return { digest: d, dropped };
}
