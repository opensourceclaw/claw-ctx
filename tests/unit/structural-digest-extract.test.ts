import { describe, expect, it } from "vitest";
import {
  extractFromMessages,
  mergeDigest,
  runStructuralDigest,
  type DigestSourceMessage,
} from "../../src/structural-digest/extract.js";
import {
  CONFIDENCE_FLOOR,
  CONFIDENCE_CAP,
  SNIPPET_MAX_CHARS,
} from "../../src/structural-digest/constants.js";

const msg = (content: string, id = "m1"): DigestSourceMessage => ({ id, role: "user", content });

describe("structural-digest extract: confirmed", () => {
  it("captures strong English decisions with claim and actor", () => {
    const d = extractFromMessages(
      [msg("We decided to switch the scheduler to cron-based triggers because the queue version leaked state.")],
      "s1", 1,
    );
    expect(d.confirmed).toHaveLength(1);
    const c = d.confirmed[0];
    expect(c.claim).toContain("decided to switch the scheduler");
    expect(c.actor).toBe("team");
    expect(c.confidence).toBeGreaterThanOrEqual(CONFIDENCE_FLOOR);
    expect(c.confidence).toBeLessThanOrEqual(CONFIDENCE_CAP);
    expect(c.provenance.msgId).toBe("m1");
    expect(c.provenance.snippet.length).toBeLessThanOrEqual(SNIPPET_MAX_CHARS);
  });

  it("reason linker raises confidence above plain strong hit", () => {
    const withLink = extractFromMessages([msg("We decided to use vitest because it is faster.")], "s", 1);
    const plain = extractFromMessages([msg("We decided to use vitest for tests.")], "s", 1);
    expect(withLink.confirmed[0].confidence).toBeGreaterThan(plain.confirmed[0].confidence);
  });

  it("captures Chinese confirmed sentences", () => {
    const d = extractFromMessages([msg("我们决定采用 cron 定时器方案，因为队列方案会泄漏状态。")], "s", 1);
    expect(d.confirmed).toHaveLength(1);
    expect(d.confirmed[0].claim).toContain("决定采用 cron");
    expect(d.confirmed[0].actor).toBe("team");
  });

  it("weak signal with no reason linker stays below floor", () => {
    const d = extractFromMessages([msg("We should try using redis for the cache.")], "s", 1);
    expect(d.confirmed).toHaveLength(0);
  });

  it("weak signal suppressed by maybe/hedge words", () => {
    const d = extractFromMessages([msg("Maybe we should go with the gateway approach to reduce latency.")], "s", 1);
    expect(d.confirmed).toHaveLength(0);
  });

  it("questions never qualify", () => {
    const d = extractFromMessages([msg("Should we decide on using vitest for tests today?"), msg("我们决定采用 vitest 了吗？")], "s", 1);
    expect(d.confirmed).toHaveLength(0);
  });
});

describe("structural-digest extract: rejected", () => {
  it("captures English rejection with reason split", () => {
    const d = extractFromMessages(
      [msg("Storing full transcripts in memory was rejected because the store grows unbounded.")],
      "s", 1,
    );
    expect(d.rejected).toHaveLength(1);
    const r = d.rejected[0];
    expect(r.approach).toContain("Storing full transcripts in memory was rejected");
    expect(r.reason).toContain("grows unbounded");
  });

  it("captures Chinese rejection with reason split", () => {
    const d = extractFromMessages([msg("全量记录入库的方案已否决，因为记忆库会无限膨胀。")], "s", 1);
    expect(d.rejected).toHaveLength(1);
    expect(d.rejected[0].approach).toContain("全量记录入库");
    expect(d.rejected[0].reason).toContain("无限膨胀");
  });

  it("keeps empty reason when no explicit linker (honest)", () => {
    const d = extractFromMessages([msg("The dual-write approach was abandoned after all.")], "s", 1);
    expect(d.rejected).toHaveLength(1);
    expect(d.rejected[0].reason).toBe("");
  });
});

describe("structural-digest extract: pitfalls", () => {
  it("captures English API pitfall with api symbol", () => {
    const d = extractFromMessages(
      [msg("MemoryManager.store throws an error when the payload is empty, workaround: pass at least one tag.")],
      "s", 1,
    );
    expect(d.pitfalls).toHaveLength(1);
    const p = d.pitfalls[0];
    expect(p.api).toBe("MemoryManager.store");
    expect(p.pitfall).toContain("empty");
    expect(p.workaround).toContain("pass at least one tag");
  });

  it("captures Chinese pitfall sentence", () => {
    const d = extractFromMessages([msg("调用 MemoryManager.store 会报错：空载荷会被拒绝。")], "s", 1);
    expect(d.pitfalls).toHaveLength(1);
    expect(d.pitfalls[0].api).toBe("MemoryManager.store");
  });

  it("ignores negative words without an api symbol", () => {
    const d = extractFromMessages([msg("Everything failed during the night and we were very unhappy about it.")], "s", 1);
    expect(d.pitfalls).toHaveLength(0);
  });

  it("ignores pitfall questions", () => {
    const d = extractFromMessages([msg("Why does MemoryManager.store fail on empty payload?"), msg("为什么 MemoryManager.store 会报错？")], "s", 1);
    expect(d.pitfalls).toHaveLength(0);
  });
});

describe("structural-digest merge", () => {
  const prev = extractFromMessages(
    [msg("We decided to use cron-based triggers because the queue leaked state.")],
    "s", 1,
  );
  it("same claim dedupes and keeps newest source", () => {
    // Byte-identical restatement in a later round = same claim (conservative)
    const next = extractFromMessages(
      [msg("We decided to use cron-based triggers because the queue leaked state.", "m9")],
      "s", 2,
    );
    const merged = mergeDigest(prev, next);
    expect(merged.confirmed).toHaveLength(1);
    expect(merged.confirmed[0].provenance.round).toBe(2);
    expect(merged.confirmed[0].provenance.msgId).toBe("m9");
    expect(merged.rounds).toBe(2);
  });

  it("paraphrased restatement is NOT deduped (conservative, no fuzzy match)", () => {
    const next = extractFromMessages(
      [msg("We decided to use cron-based triggers because the queue leaked state (re-confirmed).")],
      "s", 2,
    );
    const merged = mergeDigest(prev, next);
    expect(merged.confirmed).toHaveLength(2);
  });

  it("distinct claims accumulate", () => {
    const next = extractFromMessages([msg("We agreed on using vitest for the new test suite.")], "s", 2);
    const merged = mergeDigest(prev, next);
    expect(merged.confirmed).toHaveLength(2);
  });
});

describe("structural-digest run", () => {
  it("returns null when nothing qualified (pure-incremental contract)", () => {
    const r = runStructuralDigest(
      [msg("Just chatting about the weather today and how nice the park looks in autumn.")],
      null, "s", 1,
    );
    expect(r).toBeNull();
  });

  it("extracts, merges and caps in one pass", () => {
    const r = runStructuralDigest(
      [msg("We decided to switch to cron triggers because the queue leaked.")],
      null, "s", 1,
    );
    expect(r).not.toBeNull();
    expect(r!.confirmed).toHaveLength(1);
    expect(r!.rounds).toBe(1);
  });
});
