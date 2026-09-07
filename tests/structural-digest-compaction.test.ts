/**
 * claw-ctx v6.9.0 — Structural Digest compaction integration tests
 *
 * Drives the real engine (no vi.mock; claw-mem degrades gracefully) through
 * real session files. Locks the design contracts:
 *  - structure sentences (EN+ZH, three classes) survive compaction as one
 *    protected digest entry; raw removed lines are gone
 *  - no-structure sessions produce output byte-identical to the pre-v6.9.0
 *    shape (source lines preserved verbatim + exactly one summary line)
 *  - digest tokens are counted into tokensAfter; one entry per round with an
 *    increasing round counter; old entries never accumulate
 *  - ctx.compaction.completed/skipped payload schema (ADR-4 §5.1) and the
 *    explicit/force/auto triggerReason propagation
 */
import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createClawContextEngine } from "../src/engine.js";
import {
  OptimizerObserver,
  optimizerObserver,
  type IEventBus,
} from "../src/obs/optimizer-observer.js";
import { parseDigest } from "../src/structural-digest/serialize.js";
import { DIGEST_PREFIX } from "../src/structural-digest/constants.js";

const SESSION_ID = "v690-int";
const EV_SESSION = "v690-ev";
const mockLogger = (): any => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} });

// ~170 tokens per filler message (mirrors engine.test.ts fixture)
const filler = "Lorem ipsum dolor sit amet ".repeat(40);

// Bilingual structural sentences — the digest extraction fixtures
const STRUCTURAL_SENTENCES = [
  "We decided to use cron-based triggers because the queue leaked state.", // confirmed EN
  "我们决定采用 cron 定时器方案，因为队列方案会泄漏状态。", // confirmed ZH
  "Storing full transcripts in memory was rejected because the store grows unbounded.", // rejected EN
  "全量记录入库的方案已否决，因为记忆库会无限膨胀。", // rejected ZH
  "MemoryManager.store throws an error when the payload is empty, workaround: pass at least one tag.", // pitfall EN
  "调用 MemoryManager.store 会报错：空载荷会被拒绝。", // pitfall ZH
];

function sessionHeader(): string {
  return JSON.stringify({
    type: "session",
    version: "3",
    id: "v690sess",
    timestamp: new Date().toISOString(),
    cwd: "/tmp",
  });
}

function msgLine(id: string, content: string, role = "user"): string {
  return JSON.stringify({
    type: "message",
    id,
    parentId: "v690sess",
    timestamp: new Date().toISOString(),
    message: { role, content },
  });
}

function mkSessionFile(dir: string, lines: string[]): string {
  const file = path.join(dir, "session.jsonl");
  fs.writeFileSync(file, [...[sessionHeader()], ...lines].join("\n") + "\n", "utf-8");
  return file;
}

/** Messages with structure sentences first (so they land in the removed zone),
 *  role assistant keeps them out of the summary's "Key requests" excerpt. */
function structuralSessionLines(): string[] {
  const lines: string[] = [];
  STRUCTURAL_SENTENCES.forEach((s, i) => {
    lines.push(msgLine(`struct-${i}`, s, "assistant"));
    lines.push(msgLine(`struct-fill-${i}`, `Msg filler ${i}: ${filler}`));
  });
  for (let i = 0; i < 24; i++) lines.push(msgLine(`plain-${i}`, `Msg ${i}: ${filler}`));
  return lines;
}

function plainSessionLines(count = 30): string[] {
  return Array.from({ length: count }, (_, i) => msgLine(`plain-${i}`, `Msg ${i}: ${filler}`));
}

function mkEngine(dir: string) {
  return createClawContextEngine(
    { workspaceDir: dir, compressionStrategy: "legacy" },
    mockLogger()
  );
}

function sessionLinesOf(file: string): string[] {
  return fs.readFileSync(file, "utf-8").split("\n").filter((l) => l.trim().length > 0);
}

function digestLinesOf(file: string): string[] {
  return sessionLinesOf(file).filter((l) => {
    try {
      return typeof JSON.parse(l).message?.content === "string"
        && (JSON.parse(l).message.content as string).startsWith(DIGEST_PREFIX);
    } catch {
      return false;
    }
  });
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-ctx-v690-"));
});

describe("structural digest compaction (v6.9.0)", () => {
  it("keeps one digest entry with all three classes for EN+ZH structure sessions", async () => {
    const sessionFile = mkSessionFile(tmpDir, structuralSessionLines());
    const engine = mkEngine(tmpDir);
    const result = await engine.compact({
      sessionId: SESSION_ID,
      sessionFile,
      tokenBudget: 4000,
      force: false,
    });
    expect(result.ok).toBe(true);
    expect(result.compacted).toBe(true);

    const digests = digestLinesOf(sessionFile);
    expect(digests).toHaveLength(1);
    const text = JSON.parse(digests[0]).message.content as string;
    expect(text.startsWith(DIGEST_PREFIX)).toBe(true);
    expect(text).toContain("-- 已确认 --");
    expect(text).toContain("-- 已否决 --");
    expect(text).toContain("-- API 契约与坑 --");
    expect(text).toContain("cron-based triggers");
    expect(text).toContain("全量记录入库");
    expect(text).toContain("MemoryManager.store");

    const parsed = parseDigest(text)!;
    expect(parsed.confirmed.some((c) => c.claim.includes("cron"))).toBe(true);
    expect(parsed.rejected.some((r) => r.approach.includes("全量记录"))).toBe(true);
    expect(parsed.pitfalls.some((p) => p.api === "MemoryManager.store")).toBe(true);

    // Raw structural lines are gone — only the digest + summary represent them
    const out = sessionLinesOf(sessionFile);
    const removedIds = STRUCTURAL_SENTENCES.map((_, i) => `struct-${i}`);
    for (const line of out) {
      const id = JSON.parse(line).id as string;
      expect(removedIds.includes(id)).toBe(false);
    }
    // Out shape: session header + 1 digest + 1 summary + kept source lines
    const parsedIds = out.map((l) => JSON.parse(l).id);
    expect(parsedIds).toContain("v690sess");
    expect(digests).toHaveLength(1);
  });

  it("no-structure session leaves zero digest traces (pure-incremental contract)", async () => {
    const lines = plainSessionLines(30);
    const sessionFile = mkSessionFile(tmpDir, lines);
    const engine = mkEngine(tmpDir);
    const result = await engine.compact({
      sessionId: SESSION_ID,
      sessionFile,
      tokenBudget: 4000,
      force: false,
    });
    expect(result.compacted).toBe(true);
    expect(result.result?.details).toBeDefined();
    const details = result.result!.details as any;

    const out = sessionLinesOf(sessionFile);
    expect(digestLinesOf(sessionFile)).toHaveLength(0);
    // Byte-identical shape: every output line is a source line kept verbatim
    // plus exactly one generated summary line and the session header.
    const sourceIds = new Set(lines.map((l) => JSON.parse(l).id as string));
    const ids = out.map((l) => JSON.parse(l).id as string);
    const newIds = ids.filter((id) => id !== "v690sess" && !sourceIds.has(id));
    expect(newIds).toHaveLength(1); // exactly one summary line generated
    // kept tail of the source survives as the verbatim trailing subsequence
    const keptTail = ids.slice(1).filter((id) => sourceIds.has(id));
    expect(keptTail).toHaveLength(details.messagesAfter - 1);
    expect(keptTail).toEqual(lines.slice(-keptTail.length).map((l) => JSON.parse(l).id as string));
  });

  it("counts digest tokens into tokensAfter and reports digest metadata", async () => {
    const sessionFile = mkSessionFile(tmpDir, structuralSessionLines());
    const engine = mkEngine(tmpDir);
    const result = await engine.compact({
      sessionId: SESSION_ID,
      sessionFile,
      tokenBudget: 4000,
      force: false,
    });
    const details = result.result!.details as any;
    expect(details.digest).toBeDefined();
    expect(details.digest.rounds).toBe(1);
    expect(details.digest.tokens).toBeGreaterThan(0);
    expect(details.tokensAfter).toBeGreaterThanOrEqual(details.tokensBefore * 0.3);
  });

  it("across rounds: one entry per round, rounds increment, old entries never accumulate", async () => {
    // Round 1: structural session (cron decision in removed zone)
    const sessionFile = mkSessionFile(tmpDir, structuralSessionLines());
    const engine1 = mkEngine(tmpDir);
    const r1 = await engine1.compact({ sessionId: SESSION_ID, sessionFile, tokenBudget: 4000, force: false });
    expect((r1.result!.details as any).digest.rounds).toBe(1);
    expect(digestLinesOf(sessionFile)).toHaveLength(1);

    // Round 2: append fresh messages — a new decision + a byte-identical
    // restatement of the round-1 claim (must dedupe, not double).
    const append: string[] = [
      msgLine("r2-struct", "We agreed on using vitest for the new test suite.", "assistant"),
      msgLine("r2-struct-re", "We decided to use cron-based triggers because the queue leaked state.", "assistant"),
    ];
    for (let i = 0; i < 40; i++) append.push(msgLine(`r2-plain-${i}`, `Msg r2 ${i}: ${filler}`));
    fs.appendFileSync(sessionFile, append.join("\n") + "\n", "utf-8");

    const engine2 = mkEngine(tmpDir);
    const r2 = await engine2.compact({ sessionId: SESSION_ID, sessionFile, tokenBudget: 4000, force: false });
    expect(r2.ok).toBe(true);
    expect(r2.compacted).toBe(true);
    expect((r2.result!.details as any).digest.rounds).toBe(2);

    const digests = digestLinesOf(sessionFile);
    expect(digests).toHaveLength(1);
    const parsed = parseDigest(JSON.parse(digests[0]).message.content as string)!;
    const cron = parsed.confirmed.filter((c) => c.claim.includes("cron-based triggers"));
    expect(cron).toHaveLength(1); // restatement deduped against round-1 claim
    expect(parsed.confirmed.some((c) => c.claim.includes("vitest"))).toBe(true);
  });
});

describe("compaction events (ADR-4)", () => {
  let events: Array<{ event: string; data: any }>;
  const bus: IEventBus = {
    emit: (event: string, data: unknown) => {
      events.push({ event, data: data as any });
    },
  };

  beforeEach(() => {
    events = [];
    optimizerObserver.setEventBus(bus);
  });

  const evCompaction = (file: string, opts: Record<string, unknown>) => {
    const engine = mkEngine(tmpDir);
    return engine.compact({ sessionId: EV_SESSION, sessionFile: file, tokenBudget: 4000, force: false, ...opts });
  };

  it("completed event carries the full §5.1 payload incl. digest metadata", async () => {
    const sessionFile = mkSessionFile(tmpDir, structuralSessionLines());
    const r = await evCompaction(sessionFile, { force: true });
    expect(r.compacted).toBe(true);
    const completed = events.filter((e) => e.event === "ctx.compaction.completed" && e.data.sessionId === EV_SESSION);
    expect(completed).toHaveLength(1);
    const d = completed[0].data;
    expect(typeof d.timestamp).toBe("number");
    expect(d.sessionId).toBe(EV_SESSION);
    expect(d.triggerReason).toBe("force");
    expect(d.tokensBefore).toBeGreaterThan(0);
    expect(d.tokensAfter).toBeLessThan(d.tokensBefore);
    expect(d.removedMessages).toBeGreaterThan(10);
    expect(d.keptMessages).toBeGreaterThan(0);
    expect(typeof d.durationMs).toBe("number");
    expect(d.digestRounds).toBe(1);
    expect(d.digestTokens).toBeGreaterThan(0);
    expect((r.result!.details as any).removedCount).toBe(d.removedMessages);
  });

  it("triggerReason propagates force / explicit / auto", async () => {
    const file1 = mkSessionFile(tmpDir, structuralSessionLines());
    await evCompaction(file1, { force: true });
    expect(events.filter((e) => e.data.sessionId === EV_SESSION)[0].data.triggerReason).toBe("force");

    events = [];
    const file2 = mkSessionFile(tmpDir, structuralSessionLines());
    await evCompaction(file2, {});
    const explicit = events.filter((e) => e.event === "ctx.compaction.completed" && e.data.sessionId === EV_SESSION);
    expect(explicit[0].data.triggerReason).toBe("explicit");

    events = [];
    const file3 = mkSessionFile(tmpDir, structuralSessionLines());
    await evCompaction(file3, { triggerReason: "auto" });
    const auto = events.filter((e) => e.event === "ctx.compaction.completed" && e.data.sessionId === EV_SESSION);
    expect(auto[0].data.triggerReason).toBe("auto");
  });

  it("skipped event fires with the real reason when compaction declines", async () => {
    // already under target — huge budget, real file
    const file = mkSessionFile(tmpDir, plainSessionLines(30));
    const engine = mkEngine(tmpDir);
    const r = await engine.compact({ sessionId: EV_SESSION, sessionFile: file, tokenBudget: 2_000_000, force: true });
    expect(r.compacted).toBe(false);
    const skipped = events.filter((e) => e.event === "ctx.compaction.skipped" && e.data.sessionId === EV_SESSION);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].data.reason).toContain("already under target");
    expect(skipped[0].data.tokensBefore).toBeGreaterThan(0);
    expect(typeof skipped[0].data.timestamp).toBe("number");
  });

  it("skipped event fires on the below-threshold early return", async () => {
    const engine = mkEngine(tmpDir);
    const r = await engine.compact({
      sessionId: EV_SESSION,
      sessionFile: path.join(tmpDir, "does-not-exist.jsonl"),
      currentTokenCount: 100,
      force: false,
    });
    expect(r.compacted).toBe(false);
    const skipped = events.filter((e) => e.event === "ctx.compaction.skipped" && e.data.sessionId === EV_SESSION);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].data.reason).toContain("below threshold");
    expect(skipped[0].data.triggerReason).toBe("explicit");
  });

  it("observer emits schema-locked payloads and degrades silently", () => {
    const observed: Array<{ event: string; data: any }> = [];
    const localBus: IEventBus = {
      emit: (event: string, data: unknown) => observed.push({ event, data: data as any }),
    };
    const observer = new OptimizerObserver(localBus);

    observer.emitCompactionCompleted({
      sessionId: "s", triggerReason: "auto", tokensBefore: 1000, tokensAfter: 400,
      removedMessages: 12, keptMessages: 8, durationMs: 3, digestRounds: 2, digestTokens: 45,
    });
    const [ev] = observed;
    expect(ev.event).toBe("ctx.compaction.completed");
    expect(ev.data.digestRounds).toBe(2);
    expect(ev.data.digestTokens).toBe(45);
    expect(typeof ev.data.timestamp).toBe("number");

    observer.emitCompactionSkipped({
      sessionId: "s", triggerReason: "force", reason: "already under target (5 <= 10)", tokensBefore: 5,
    });
    expect(observed[1].event).toBe("ctx.compaction.skipped");
    expect(observed[1].data.reason).toContain("already under target");

    // disabled observer emits nothing
    observer.setEnabled(false);
    observer.emitCompactionCompleted({ sessionId: "s", triggerReason: "auto", tokensBefore: 1, tokensAfter: 1, removedMessages: 0, keptMessages: 1, durationMs: 0 });
    expect(observed).toHaveLength(2);

    // a throwing bus must never break compaction flows
    const badBus: IEventBus = { emit: () => { throw new Error("bus down"); } };
    const robust = new OptimizerObserver(badBus);
    expect(() => robust.emitCompactionCompleted({ sessionId: "s", triggerReason: "auto", tokensBefore: 1, tokensAfter: 1, removedMessages: 0, keptMessages: 1, durationMs: 0 })).not.toThrow();
    // default singleton construction (NoOp degradation) never throws
    expect(() => new OptimizerObserver().emitCompactionSkipped({ sessionId: "s", triggerReason: "auto", reason: "x", tokensBefore: 1 })).not.toThrow();
  });
});
