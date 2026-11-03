// claw-ctx v6.15.0 — Structural Digest v2 / claim-evidence ledger.
//
// Hard contracts:
//  - v1 text ↔ v2 text parse compatibility (v1 readers ignore @claim lines)
//  - verbatim span must exist in the source message, otherwise dropped
//  - at most CLAIM_ROUND_LIMIT claims per round, identifier/decision first
//  - budget overflow trims other < pitfall < fact/decision < rejected/pending
//  - derived entries (channel separation) never become a claim source

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  claimCutRank,
  claimLine,
  parseDigest,
  serializeDigest,
  truncateToCapacity,
} from "../../src/structural-digest/serialize.js";
import {
  extractClaims,
  mergeDigest,
  validateClaims,
} from "../../src/structural-digest/extract.js";
import {
  CLAIM_ROUND_LIMIT,
  CLAIM_SPAN_MAX_CHARS,
  DIGEST_PREFIX,
  DIGEST_PREFIX_V2,
} from "../../src/structural-digest/constants.js";
import { DIGEST_MAX_TOKENS } from "../../src/structural-digest/constants.js";
import { createClawContextEngine } from "../../src/engine.js";
import { createTokenCounter } from "../../src/token-counter.js";
import type { ClaimEvidence, StructuralDigest } from "../../src/structural-digest/types.js";

const mkClaim = (over: Partial<ClaimEvidence> = {}): ClaimEvidence => ({
  claim: "Use vitest for the suite",
  kind: "decision",
  span: "We decided to use vitest for the suite.",
  sessionId: "s",
  entryId: "e1",
  round: 1,
  confidence: 0.8,
  ...over,
});

const mkDigest = (claims: ClaimEvidence[]): StructuralDigest => ({
  version: claims.length > 0 ? 2 : 1,
  sessionId: "s",
  rounds: 1,
  updatedAt: 1,
  confirmed: [],
  rejected: [],
  pitfalls: [],
  ...(claims.length > 0 ? { claims } : {}),
});

const tokenCounter = createTokenCounter("cl100k_base");
const tok = (text: string): number => tokenCounter.count(text).tokens;
// Mirrors serialize.ts line cost: token count + one newline token per line.
const claimsCost = (claims: ClaimEvidence[], sessionId = "s"): number =>
  claims.length === 0
    ? 0
    : tok(`@claims ${claims.length} ${sessionId}`) +
      1 +
      claims.reduce((sum, c) => sum + tok(claimLine(c)) + 1, 0);

describe("digest v1 ↔ v2 parse compatibility", () => {
  it("parses legacy v1 text with no claims and re-serializes byte-identically", () => {
    const v1 = [
      DIGEST_PREFIX,
      "-- 已确认 --",
      "- We decided to use cron. (actor: team) [src m1: We decided to use cron.]",
    ].join("\n");
    const parsed = parseDigest(v1)!;
    expect(parsed.version).toBe(1);
    expect(parsed.claims).toBeUndefined();
    expect(serializeDigest(parsed)).toBe(v1);
  });

  it("serializes v2 claims-only digests, parses them back, and round-trips bytes", () => {
    const claims = [mkClaim()];
    const text = serializeDigest(mkDigest(claims))!;
    expect(text.startsWith(`${DIGEST_PREFIX_V2}\n`)).toBe(true);
    expect(text).toContain("@claims 1 s");

    const parsed = parseDigest(text)!;
    expect(parsed.version).toBe(2);
    expect(parsed.sessionId).toBe("s");
    expect(parsed.claims).toEqual(claims);
    expect(serializeDigest(parsed)).toBe(text);
  });

  it("keeps v1 sections readable alongside the v2 claims block", () => {
    const digest: StructuralDigest = {
      version: 2,
      sessionId: "s",
      rounds: 2,
      updatedAt: 1,
      confirmed: [
        {
          claim: "We decided to use cron",
          actor: "team",
          confidence: 0.9,
          provenance: { msgId: "m1", snippet: "We decided to use cron", round: 2 },
        },
      ],
      rejected: [],
      pitfalls: [],
      claims: [mkClaim({ entryId: "m1", round: 2 })],
    };
    const text = serializeDigest(digest)!;
    expect(text).toContain("-- 已确认 --");
    const parsed = parseDigest(text)!;
    expect(parsed.confirmed).toHaveLength(1);
    expect(parsed.claims).toHaveLength(1);
    expect(serializeDigest(parsed)).toBe(text);
  });

  it("drops malformed @claim lines instead of failing the whole digest", () => {
    const text = [
      DIGEST_PREFIX_V2,
      "@claims 2 s",
      '@claim {"k":"decision","e":"e1","r":1,"s":"ok","q":"source text"}',
      '@claim {"k":"nonsense","e":"e2","r":1,"s":"bad","q":"source text"}',
      '@claim not-json',
    ].join("\n");
    const parsed = parseDigest(text)!;
    expect(parsed.claims).toHaveLength(1);
    expect(parsed.claims![0].entryId).toBe("e1");
  });
});

describe("claim span validation", () => {
  const source = { id: "e1", role: "user", content: "We decided to use vitest for the suite." };

  it("keeps a claim whose span is verbatim in the source", () => {
    const claims = validateClaims([mkClaim()], [source]);
    expect(claims).toHaveLength(1);
  });

  it("drops a claim whose span is not in the source", () => {
    const claims = validateClaims(
      [mkClaim({ span: "We decided to use jest for the suite." })],
      [source],
    );
    expect(claims).toHaveLength(0);
  });

  it("drops oversized spans and unknown entry ids", () => {
    const claims = validateClaims(
      [
        mkClaim({ span: "x".repeat(CLAIM_SPAN_MAX_CHARS + 1) }),
        mkClaim({ entryId: "missing" }),
      ],
      [source],
    );
    expect(claims).toHaveLength(0);
  });

  it("extractClaims always emits verbatim spans", () => {
    const raw = "We decided to use vitest for the suite because it is fast.";
    const claims = extractClaims([{ id: "m1", content: raw }], "s", 1);
    expect(claims).toHaveLength(1);
    expect(raw.includes(claims[0].span)).toBe(true);
    expect(claims[0].kind).toBe("decision");
    expect(claims[0].sessionId).toBe("s");
    expect(claims[0].round).toBe(1);
  });
});

describe("claim extraction cap and priority", () => {
  it("caps at 20 per round and prefers identifier-bearing messages", () => {
    const messages = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `plain-${i}`,
        content: `We decided to adopt approach ${i} because it is stable.`,
      })),
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `id-${i}`,
        content: `We decided to use file-${i}.ts because it is stable.`,
      })),
    ];
    const claims = extractClaims(messages, "s", 1);
    expect(claims).toHaveLength(CLAIM_ROUND_LIMIT);
    expect(claims.every((c) => c.entryId.startsWith("id-"))).toBe(true);
  });

  it("produces no claims for signal-free chatter (pure-incremental contract)", () => {
    const claims = extractClaims(
      [{ id: "m1", content: "Just chatting about the weather and the park today." }],
      "s",
      1,
    );
    expect(claims).toHaveLength(0);
  });
});

describe("v2 budget truncation priority", () => {
  it("orders claim cut ranks: other < pitfall < fact/decision < rejected/pending", () => {
    const rank = (kind: ClaimEvidence["kind"]) => claimCutRank(mkClaim({ kind }))[0];
    expect(rank("other")).toBeLessThan(rank("pitfall"));
    expect(rank("pitfall")).toBeLessThan(rank("fact"));
    expect(rank("fact")).toBe(rank("decision"));
    expect(rank("decision")).toBeLessThan(rank("rejected"));
    expect(rank("rejected")).toBe(rank("pending"));
  });

  it("keeps high-priority claims when the budget forces cuts", () => {
    const claims = [
      mkClaim({ kind: "other", entryId: "o", claim: "o", span: "o", confidence: 0.4 }),
      mkClaim({ kind: "pitfall", entryId: "p", claim: "p", span: "p", confidence: 0.4 }),
      mkClaim({ kind: "fact", entryId: "f", claim: "f", span: "f", confidence: 0.4 }),
      mkClaim({ kind: "decision", entryId: "d", claim: "d", span: "d", confidence: 0.4 }),
      mkClaim({ kind: "rejected", entryId: "r", claim: "r", span: "r", confidence: 0.4 }),
      mkClaim({ kind: "pending", entryId: "n", claim: "n", span: "n", confidence: 0.4 }),
    ];
    const digest = mkDigest(claims);
    const keep = claims.filter((c) => c.kind === "rejected" || c.kind === "pending");
    // Fits prefix + the two protected claims, but not a third claim line.
    const forced = claimsCost(keep) + tok(DIGEST_PREFIX_V2) + 10;
    const { digest: trimmed } = truncateToCapacity(digest, forced);
    const kinds = new Set((trimmed.claims ?? []).map((c) => c.kind));
    expect(kinds.has("other")).toBe(false);
    expect(kinds.has("pitfall")).toBe(false);
    expect(kinds.has("rejected")).toBe(true);
    expect(kinds.has("pending")).toBe(true);
  });

  it("drops every claim at zero capacity", () => {
    const digest = mkDigest([mkClaim(), mkClaim({ kind: "other", entryId: "e2" })]);
    const { dropped } = truncateToCapacity(digest, 0);
    expect(dropped).toBe(2);
    expect(digest.claims).toBeUndefined();
    expect(digest.version).toBe(1);
  });
});

describe("v2 claims and channel separation", () => {
  const filler = "Lorem ipsum dolor sit amet ".repeat(40);
  const mkTemp = () => fs.mkdtempSync(path.join(os.tmpdir(), "claw-ctx-claims-"));

  function sessionFile(dir: string, lines: string[]): string {
    const file = path.join(dir, "session.jsonl");
    fs.writeFileSync(
      file,
      [
        JSON.stringify({ type: "session", version: "3", id: "sess", timestamp: "t", cwd: "/tmp" }),
        ...lines,
      ].join("\n") + "\n",
      "utf-8",
    );
    return file;
  }

  function msg(id: string, content: string): string {
    return JSON.stringify({
      type: "message",
      id,
      parentId: "sess",
      timestamp: "t",
      message: { role: "user", content },
    });
  }

  it("never cites a derived transcript entry as a claim source", async () => {
    const dir = mkTemp();
    try {
      const derivedSummary = JSON.stringify({
        type: "message",
        id: "old-summary",
        parentId: "sess",
        timestamp: "t",
        derived: {
          schemaVersion: 1,
          derivedBy: "compaction-summary",
          sourceSessionId: "sess",
          sourceEntryIds: [],
        },
        message: {
          role: "user",
          content: "[Compacted History — 9 earlier messages summarized]\nWe decided to use rust.",
        },
      });
      const raw = [
        msg("raw-decision", "We decided to use file-claims.ts because it is stable."),
        ...Array.from({ length: 30 }, (_, i) => msg(`plain-${i}`, `Msg ${i}: ${filler}`)),
      ];
      const file = sessionFile(dir, [derivedSummary, ...raw]);
      const engine = createClawContextEngine(
        { workspaceDir: dir, compressionStrategy: "legacy", sessionResume: false },
        { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any,
      );
      const result = await engine.compact({
        sessionId: "sess",
        sessionFile: file,
        tokenBudget: 4000,
        force: false,
      });
      expect(result.compacted).toBe(true);

      const digestLine = fs
        .readFileSync(file, "utf-8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .find((o) => typeof o.message?.content === "string" && o.message.content.startsWith(DIGEST_PREFIX_V2));
      expect(digestLine).toBeDefined();
      const parsed = parseDigest(digestLine.message.content)!;
      expect(parsed.claims!.length).toBeGreaterThan(0);
      expect(parsed.claims!.some((c) => c.entryId === "raw-decision")).toBe(true);
      expect(parsed.claims!.some((c) => c.entryId === "old-summary")).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps the serialized digest within the 4096-token capacity", async () => {
    const dir = mkTemp();
    try {
      const raw = Array.from({ length: 60 }, (_, i) =>
        msg(`sig-${i}`, `We decided to use file-${i}.ts because it is stable. ${filler}`)
      );
      const file = sessionFile(dir, raw);
      const engine = createClawContextEngine(
        { workspaceDir: dir, compressionStrategy: "legacy", sessionResume: false },
        { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any,
      );
      const result = await engine.compact({
        sessionId: "sess",
        sessionFile: file,
        tokenBudget: 2000,
        force: false,
      });
      expect(result.compacted).toBe(true);
      const digest = fs
        .readFileSync(file, "utf-8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .find((o) => typeof o.message?.content === "string" && o.message.content.includes("STRUCTURAL-DIGEST"));
      expect(digest).toBeDefined();
      const text = digest.message.content as string;
      // Edith P1-A: authoritative tiktoken measure, not chars/4.
      expect(tok(text)).toBeLessThanOrEqual(DIGEST_MAX_TOKENS);
      const parsed = parseDigest(text)!;
      expect(parsed.claims!.length).toBeLessThanOrEqual(CLAIM_ROUND_LIMIT);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("claims outlive same-tier legacy views under budget pressure (P2-A)", async () => {
    const dir = mkTemp();
    try {
      const dense = Array.from({ length: 60 }, (_, i) =>
        msg(
          `dense-${i}`,
          `We decided to use file-${i}.ts, rejected the shim approach because it failed, ` +
            `pending next step for task-${i}. ${filler}`,
        ),
      );
      const file = sessionFile(dir, dense);
      const engine = createClawContextEngine(
        { workspaceDir: dir, compressionStrategy: "legacy", sessionResume: false },
        { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any,
      );
      const result = await engine.compact({
        sessionId: "sess",
        sessionFile: file,
        tokenBudget: 3000,
        force: false,
      });
      expect(result.compacted).toBe(true);

      const digest = fs
        .readFileSync(file, "utf-8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .find((o) => typeof o.message?.content === "string" && o.message.content.includes("STRUCTURAL-DIGEST"));
      const parsed = parseDigest(digest.message.content)!;
      const claims = parsed.claims ?? [];
      // Before the P2-A fix this dropped to ~7/20; the ledger must now survive intact.
      expect(claims).toHaveLength(CLAIM_ROUND_LIMIT);
      expect(tok(digest.message.content)).toBeLessThanOrEqual(DIGEST_MAX_TOKENS);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("same-tier claims survive ahead of higher-confidence legacy views", () => {
    const claims = Array.from({ length: 20 }, (_, i) =>
      mkClaim({
        entryId: `cl-${i}`,
        claim: `claim ${i}`,
        span: "s".repeat(200),
        kind: "rejected",
        confidence: 0.9,
      }),
    );
    const rejected = Array.from({ length: 60 }, (_, i) => ({
      approach: `view approach ${i}`,
      reason: "legacy view",
      confidence: 0.95,
      provenance: { msgId: `v-${i}`, snippet: "z".repeat(200), round: 1 },
    }));
    const digest: StructuralDigest = {
      version: 2,
      sessionId: "s",
      rounds: 1,
      updatedAt: 1,
      confirmed: [],
      rejected,
      pitfalls: [],
      claims,
    };
    const { digest: trimmed } = truncateToCapacity(digest);
    expect(trimmed.claims).toHaveLength(20);
    expect(trimmed.rejected.length).toBeLessThan(60);
    expect(tok(serializeDigest(trimmed)!)).toBeLessThanOrEqual(DIGEST_MAX_TOKENS);
  });

  it("caps the cross-round claims ledger at 60 with FIFO aging (P3-C)", () => {
    let merged: StructuralDigest | null = null;
    for (let round = 1; round <= 5; round++) {
      const claims = Array.from({ length: 20 }, (_, i) =>
        mkClaim({
          entryId: `r${round}-${i}`,
          claim: `round ${round} claim ${i}`,
          span: `round ${round} span ${i}`,
          round,
        }),
      );
      merged = mergeDigest(merged, mkDigest(claims));
    }
    expect(merged!.claims).toHaveLength(60);
    expect(merged!.claims!.some((c) => c.entryId.startsWith("r1-"))).toBe(false);
    expect(merged!.claims!.some((c) => c.entryId.startsWith("r5-"))).toBe(true);
  });
});
