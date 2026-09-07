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
 */

import {
  CONFIDENCE_FLOOR,
  DIGEST_MAX_TOKENS,
  DIGEST_PREFIX,
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
  ConfirmedFact,
  Provenance,
  RejectedApproach,
  StructuralDigest,
} from "./types.js";

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
  if (sections.length === 0) return null;
  return [`${DIGEST_PREFIX}`, ...sections].join("\n");
}

/** True when no entry qualifies in any class */
export function emptyDigest(d: StructuralDigest): boolean {
  return d.confirmed.length === 0 && d.rejected.length === 0 && d.pitfalls.length === 0;
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

/**
 * Parse persisted digest text back into an object. Lossy rebuild:
 * confidence = PARSE_REBUILD_CONFIDENCE (floor), round = PARSE_REBUILD_ROUND.
 * Invalid entries are skipped (never crash compaction on bad persisted data).
 */
export function parseDigest(text: string): StructuralDigest | null {
  if (!text.startsWith(DIGEST_PREFIX)) return null;
  const lines = text.split("\n");
  const confirmed: ConfirmedFact[] = [];
  const rejected: RejectedApproach[] = [];
  const pitfalls: ApiPitfall[] = [];

  let section: "confirmed" | "rejected" | "pitfalls" | null = null;
  for (const raw of lines.slice(1)) {
    const line = raw.trimEnd();
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

  if (confirmed.length === 0 && rejected.length === 0 && pitfalls.length === 0) return null;
  return {
    version: 1,
    sessionId: "",
    rounds: PARSE_REBUILD_ROUND,
    updatedAt: 0,
    confirmed,
    rejected,
    pitfalls,
  };
}

/** Rough token estimate (chars/4), used only for capacity ordering */
function estimateTokensOf(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

type AnyEntry = ConfirmedFact | RejectedApproach | ApiPitfall;

function cmpTuple(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

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
 * Capacity truncation (ADR-3 §6.2): overflow is cut by priority
 * rejected > confirmed > pitfalls; class-internal by lower confidence first,
 * then older round first. Silent tail-cut; returns dropped count for logging.
 */
export function truncateToCapacity(
  d: StructuralDigest,
  maxTokens: number = DIGEST_MAX_TOKENS
): { digest: StructuralDigest; dropped: number } {
  const lists: Array<[keyof StructuralDigest & ("confirmed" | "rejected" | "pitfalls"), AnyEntry[]]> = [
    ["confirmed", d.confirmed],
    ["rejected", d.rejected],
    ["pitfalls", d.pitfalls],
  ];

  const total = (): number =>
    lists.reduce(
      (sum, [key]) => sum + (d[key] as AnyEntry[]).reduce((s, e) => s + estimateTokensOf(entryText(e)), 0),
      0
    );

  let dropped = 0;
  while (total() > maxTokens) {
    // Cut candidates: lowest cutRank (class, then confidence asc, round asc)
    let cut: { key: "confirmed" | "rejected" | "pitfalls"; idx: number } | null = null;
    for (const [key, entries] of lists) {
      if (entries.length === 0) continue;
      let worstIdx = 0;
      let worstRank: [number, number, number] | null = null;
      for (let i = 0; i < entries.length; i++) {
        const r = cutRank(entries[i] as AnyEntry);
        if (worstRank === null || cmpTuple(r, worstRank) < 0) {
          worstRank = r;
          worstIdx = i;
        }
      }
      const current = cut ? cutRank((d[cut.key] as AnyEntry[])[cut.idx] as AnyEntry) : null;
      if (current === null || cmpTuple(worstRank!, current) < 0) {
        cut = { key, idx: worstIdx };
      }
    }
    if (!cut) break;
    const list = d[cut.key] as AnyEntry[];
    list.splice(cut.idx, 1);
    dropped++;
  }
  return { digest: d, dropped };
}
