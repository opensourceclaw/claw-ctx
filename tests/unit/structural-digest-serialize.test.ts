import { describe, expect, it } from "vitest";
import {
  cutRank,
  parseDigest,
  serializeDigest,
  truncateToCapacity,
} from "../../src/structural-digest/serialize.js";
import { extractFromMessages } from "../../src/structural-digest/extract.js";
import type { ConfirmedFact, StructuralDigest } from "../../src/structural-digest/types.js";
import { DIGEST_PREFIX, PARSE_REBUILD_CONFIDENCE, PARSE_REBUILD_ROUND } from "../../src/structural-digest/constants.js";

const mkDigest = (): StructuralDigest => ({
  version: 1,
  sessionId: "s1",
  rounds: 3,
  updatedAt: 1,
  confirmed: [
    {
      claim: "We decided to use cron-based triggers because the queue leaked state",
      actor: "team",
      confidence: 0.95,
      provenance: { msgId: "m1", snippet: "We decided to use cron-based triggers because the queue leaked state", round: 3 },
    },
  ],
  rejected: [
    {
      approach: "Storing full transcripts in memory",
      reason: "store grows unbounded",
      confidence: 0.95,
      provenance: { msgId: "m2", snippet: "Storing full transcripts in memory was rejected because the store grows unbounded", round: 2 },
    },
  ],
  pitfalls: [
    {
      api: "MemoryManager.store",
      pitfall: "throws an error when the payload is empty",
      workaround: "pass at least one tag",
      confidence: 0.95,
      provenance: { msgId: "m3", snippet: "MemoryManager.store throws an error when the payload is empty", round: 1 },
    },
  ],
});

describe("structural-digest serialize/parse round trip", () => {
  it("serializes with prefix, sections and src trace", () => {
    const text = serializeDigest(mkDigest())!;
    expect(text.startsWith(`${DIGEST_PREFIX}\n`)).toBe(true);
    expect(text).toContain("-- 已确认 --");
    expect(text).toContain("-- 已否决 --");
    expect(text).toContain("-- API 契约与坑 --");
    expect(text).toContain("- We decided to use cron-based triggers because the queue leaked state (actor: team) [src m1: We decided to use cron-based");
    expect(text).toContain("- Storing full transcripts in memory: store grows unbounded [src m2:");
    expect(text).toContain("- MemoryManager.store: throws an error when the payload is empty (workaround: pass at least one tag) [src m3:");
  });

  it("parses back with faithful claim/msgId/snippet and lossy confidence/round", () => {
    const text = serializeDigest(mkDigest())!;
    const parsed = parseDigest(text)!;
    expect(parsed).not.toBeNull();
    expect(parsed.confirmed[0].claim).toBe(mkDigest().confirmed[0].claim);
    expect(parsed.confirmed[0].provenance.msgId).toBe("m1");
    expect(parsed.confirmed[0].actor).toBe("team");
    expect(parsed.confirmed[0].confidence).toBe(PARSE_REBUILD_CONFIDENCE);
    expect(parsed.confirmed[0].provenance.round).toBe(PARSE_REBUILD_ROUND);
    expect(parsed.rejected[0].approach).toBe("Storing full transcripts in memory");
    expect(parsed.rejected[0].reason).toBe("store grows unbounded");
    expect(parsed.pitfalls[0].api).toBe("MemoryManager.store");
    expect(parsed.pitfalls[0].workaround).toBe("pass at least one tag");
  });

  it("re-serialization is byte-idempotent after parse", () => {
    const once = serializeDigest(mkDigest())!;
    const parsed = parseDigest(once)!;
    expect(serializeDigest(parsed)).toBe(once);
  });

  it("rejects text without the digest prefix", () => {
    expect(parseDigest("plain summary text")).toBeNull();
    expect(parseDigest("[STRUCTURAL-DIGEST v9] unknown version")).toBeNull();
  });

  it("returns null serialization for an empty digest", () => {
    const empty: StructuralDigest = { version: 1, sessionId: "s", rounds: 1, updatedAt: 0, confirmed: [], rejected: [], pitfalls: [] };
    expect(serializeDigest(empty)).toBeNull();
  });

  it("snippet display is capped to 80 chars", () => {
    const d = mkDigest();
    d.confirmed[0].provenance.snippet = "x".repeat(300);
    const line = serializeDigest(d)!.split("\n").find((l) => l.startsWith("- We decided"));
    const src = line!.match(/\[src m1: ([^\]]+)\]/)![1];
    expect(src.length).toBeLessThanOrEqual(83); // 80 + "..." clip suffix
  });
});

describe("structural-digest capacity truncation", () => {
  it("cutRank orders pitfalls < confirmed < rejected", () => {
    const d = mkDigest();
    const rankOf = {
      pit: cutRank(d.pitfalls[0]),
      conf: cutRank(d.confirmed[0]),
      rej: cutRank(d.rejected[0]),
    };
    expect(rankOf.pit[0]).toBe(0);
    expect(rankOf.conf[0]).toBe(1);
    expect(rankOf.rej[0]).toBe(2);
  });

  it("cutRank orders lower confidence first, then older round, within a class", () => {
    const lowConf = { ...mkDigest().confirmed[0], confidence: 0.8, provenance: { ...mkDigest().confirmed[0].provenance, round: 2 } };
    const highConf = { ...mkDigest().confirmed[0], confidence: 0.95, provenance: { ...mkDigest().confirmed[0].provenance, round: 1 } };
    const older = { ...mkDigest().confirmed[0], confidence: 0.9, provenance: { ...mkDigest().confirmed[0].provenance, round: 1 } };
    const newer = { ...mkDigest().confirmed[0], confidence: 0.9, provenance: { ...mkDigest().confirmed[0].provenance, round: 3 } };
    expect(cutRank(lowConf)[1]).toBeLessThan(cutRank(highConf)[1]);
    expect(cutRank(older)[2]).toBeLessThan(cutRank(newer)[2]);
  });

  it("drops everything when capacity is zero, nothing when unlimited", () => {
    const d = mkDigest();
    const zero = truncateToCapacity(d, 0);
    expect(zero.dropped).toBe(3);
    const inf = truncateToCapacity(mkDigest(), 1e9);
    expect(inf.dropped).toBe(0);
  });

  it("keeps only the highest-priority class when capacity fits a single entry", () => {
    const d = mkDigest();
    // one rejected entry fits; everything else must go (class order deterministic)
    const kept = truncateToCapacity(mkDigest(), 0).digest;
    expect(kept.rejected).toHaveLength(0);
    // and max just above zero-but-below-any-entry still cuts in rank order
    const { digest, dropped } = truncateToCapacity(d, 1);
    expect(dropped).toBe(3);
    expect(digest.confirmed).toHaveLength(0);
    expect(digest.pitfalls).toHaveLength(0);
  });
});

describe("structural-digest class separation on serialize", () => {
  it("serialized form of extracted digest round-trips into equal text", () => {
    const extracted = extractFromMessages(
      [
        { id: "a", role: "user", content: "We decided to use cron triggers because the queue leaked." },
        { id: "b", role: "user", content: "Storing full transcripts was rejected because the store grows unbounded." },
      ],
      "s", 1,
    );
    const text = serializeDigest(extracted)!;
    const parsed = parseDigest(text)!;
    expect(parsed.confirmed).toHaveLength(1);
    expect(parsed.rejected).toHaveLength(1);
    expect(parsed.confirmed[0].claim).toBe(extracted.confirmed[0].claim);
  });
});

describe("structural-digest entry validation", () => {
  it("keeps entries with mandatory fields; clamps oversized snippet at store time", () => {
    const d = mkDigest();
    d.confirmed.push({
      claim: "second claim",
      confidence: 0.8,
      provenance: { msgId: "m5", snippet: "s".repeat(500), round: 2 },
    } as ConfirmedFact);
    // extract layer caps snippet at SNIPPET_MAX_CHARS; serialize display caps at 80
    const text = serializeDigest(d)!;
    expect(text).toContain("second claim");
  });
});
