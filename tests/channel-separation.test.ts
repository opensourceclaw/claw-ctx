// claw-ctx v6.14.1 — channel separation (batch 1/2)
//
// SUPPLY artifacts (compaction summaries, digests, handoffs, checkpoints) are
// read-only, typed and carry lineage. The hard contract: a derivation pipeline
// may only read raw evidence — never another derived artifact. These tests
// drive the real engine through real session files (no vi.mock of the engine).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createClawContextEngine } from "../src/engine.js";
import { parseDigest, serializeDigest } from "../src/structural-digest/serialize.js";
import { DIGEST_PREFIX } from "../src/structural-digest/constants.js";
import {
  DERIVED_META_SCHEMA_VERSION,
  isLegacyCompactionSummary,
} from "../src/derived-meta.js";

const SESSION_ID = "channel-sep";
const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
const filler = "Lorem ipsum dolor sit amet ".repeat(40); // ~270 tokens

const sessionHeader = (): string =>
  JSON.stringify({
    type: "session",
    version: "3",
    id: "sess-ch",
    timestamp: new Date().toISOString(),
    cwd: "/tmp",
  });

function msgLine(
  id: string,
  content: string,
  role = "user",
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    type: "message",
    id,
    parentId: "sess-ch",
    timestamp: new Date().toISOString(),
    ...extra,
    message: { role, content },
  });
}

function plainSessionLines(count: number): string[] {
  return Array.from({ length: count }, (_, i) => msgLine(`plain-${i}`, `Msg ${i}: ${filler}`));
}

function mkSessionFile(dir: string, lines: string[]): string {
  const file = path.join(dir, "session.jsonl");
  fs.writeFileSync(file, [...[sessionHeader()], ...lines].join("\n") + "\n", "utf-8");
  return file;
}

function mkEngine(dir: string, manager?: any) {
  return createClawContextEngine(
    { workspaceDir: dir, compressionStrategy: "legacy" },
    logger as any,
    manager,
  );
}

function sessionLinesOf(file: string): string[] {
  return fs.readFileSync(file, "utf-8").split("\n").filter((l) => l.trim().length > 0);
}

function parseLines(lines: string[]): any[] {
  return lines.map((l) => JSON.parse(l));
}

function summariesOf(file: string): any[] {
  return parseLines(sessionLinesOf(file)).filter((o) =>
    isLegacyCompactionSummary(o.message?.content),
  );
}

function digestsOf(file: string): any[] {
  return parseLines(sessionLinesOf(file)).filter(
    (o) =>
      typeof o.message?.content === "string" &&
      (o.message.content as string).startsWith(DIGEST_PREFIX),
  );
}

/** Capture every extraction source the engine hands to the legacy summarizer. */
function spyBuildSummary(engine: any): { captured: string[][] } {
  const captured: string[][] = [];
  const original = engine._buildSummary.bind(engine);
  vi.spyOn(engine, "_buildSummary").mockImplementation((msgs: any[], count: number) => {
    captured.push(msgs.map((m) => m.line));
    return original(msgs, count);
  });
  return { captured };
}

function assertNoDerivedInSource(sourceLines: string[]): void {
  for (const line of sourceLines) {
    const obj = JSON.parse(line);
    expect(obj.derived).toBeUndefined();
    expect(isLegacyCompactionSummary(obj.message?.content)).toBe(false);
    expect(String(obj.message?.content ?? "").startsWith(DIGEST_PREFIX)).toBe(false);
  }
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-ctx-channel-"));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("channel separation — compaction source filtering", () => {
  it("double compaction: extraction source contains no derived entry (summary-of-summary guard)", async () => {
    const file = mkSessionFile(tmpDir, plainSessionLines(30));
    const r1 = await mkEngine(tmpDir).compact({
      sessionId: SESSION_ID,
      sessionFile: file,
      tokenBudget: 4000,
      force: false,
    });
    expect(r1.compacted).toBe(true);

    const firstSummaries = summariesOf(file);
    expect(firstSummaries).toHaveLength(1);
    const summary1 = firstSummaries[0];
    expect(summary1.derived).toMatchObject({
      schemaVersion: DERIVED_META_SCHEMA_VERSION,
      derivedBy: "compaction-summary",
      sourceSessionId: SESSION_ID,
    });
    expect(summary1.derived.sourceEntryIds.length).toBeGreaterThan(0);
    expect(summary1.derived.sourceEntryIds).toContain("plain-0");

    // Round 2: append raw evidence and compact again over the round-1 output.
    const append = Array.from({ length: 40 }, (_, i) =>
      msgLine(`r2-${i}`, `Round two ${i}: ${filler}`),
    );
    fs.appendFileSync(file, append.join("\n") + "\n", "utf-8");

    const engine2 = mkEngine(tmpDir);
    const { captured } = spyBuildSummary(engine2 as any);
    const r2 = await engine2.compact({
      sessionId: SESSION_ID,
      sessionFile: file,
      tokenBudget: 4000,
      force: false,
    });
    expect(r2.compacted).toBe(true);
    expect(captured).toHaveLength(1);

    // The hard assertion: the round-1 derived summary never enters the source.
    expect(captured[0].length).toBeGreaterThan(10);
    assertNoDerivedInSource(captured[0]);
    expect(captured[0].some((l) => l.includes("Compacted History"))).toBe(false);

    // Derived entries are preserved verbatim as read-only context; the new
    // summary carries its own lineage and does not claim the old summary.
    const secondSummaries = summariesOf(file);
    expect(secondSummaries).toHaveLength(2);
    expect(secondSummaries[0]).toEqual(summary1);
    const summary2 = secondSummaries[1];
    expect(summary2.derived).toMatchObject({
      schemaVersion: DERIVED_META_SCHEMA_VERSION,
      derivedBy: "compaction-summary",
      sourceSessionId: SESSION_ID,
    });
    expect(summary2.derived.sourceEntryIds.length).toBeGreaterThan(0);
    expect(summary2.derived.sourceEntryIds).not.toContain(summary1.id);
    expect((r2.result!.details as any).derivedPreserved).toBe(1);
  });

  it("legacy unmarked compaction summaries are recognized by shape and never re-summarized", async () => {
    const legacySummary = JSON.stringify({
      type: "message",
      id: "legacy-summary",
      parentId: "sess-ch",
      timestamp: new Date().toISOString(),
      message: {
        role: "user",
        content: "[Compacted History — 12 earlier messages summarized]\nTopics: old work\n\nContinue.",
      },
    });
    const file = mkSessionFile(tmpDir, [legacySummary, ...plainSessionLines(30)]);

    const engine = mkEngine(tmpDir);
    const { captured } = spyBuildSummary(engine as any);
    const r = await engine.compact({
      sessionId: SESSION_ID,
      sessionFile: file,
      tokenBudget: 4000,
      force: false,
    });
    expect(r.compacted).toBe(true);
    expect(captured).toHaveLength(1);
    assertNoDerivedInSource(captured[0]);
    expect(captured[0].some((l) => l.includes("legacy-summary"))).toBe(false);

    const summaries = summariesOf(file);
    expect(summaries).toHaveLength(2);
    expect(summaries[0].id).toBe("legacy-summary"); // preserved verbatim
    expect(summaries[1].derived.derivedBy).toBe("compaction-summary");
    expect((r.result!.details as any).derivedPreserved).toBe(1);
  });
});

describe("channel separation — digest v1/v2 parse compatibility", () => {
  const V1_TEXT = [
    DIGEST_PREFIX,
    "-- 已确认 --",
    "- We decided to use vitest for the new suite. [src old-msg-1: We decided to use vitest]",
    "-- 已否决 --",
    "- Storing full transcripts in memory: the store grows unbounded. [src old-msg-2: Storing full transcripts]",
  ].join("\n");

  function v1DigestLine(): string {
    return JSON.stringify({
      type: "message",
      id: "old-digest",
      parentId: "sess-ch",
      timestamp: new Date().toISOString(),
      digestRound: 1,
      message: { role: "user", content: V1_TEXT },
    });
  }

  function v2DigestLine(): string {
    return JSON.stringify({
      type: "message",
      id: "old-digest",
      parentId: "sess-ch",
      timestamp: new Date().toISOString(),
      digestRound: 1,
      derived: {
        schemaVersion: DERIVED_META_SCHEMA_VERSION,
        derivedBy: "structural-digest",
        sourceSessionId: "older-session",
        sourceEntryIds: ["old-msg-1", "old-msg-2"],
        round: 1,
      },
      message: { role: "user", content: V1_TEXT },
    });
  }

  it("v1 digest text round-trips through parse/serialize (bidirectional)", () => {
    const parsed = parseDigest(V1_TEXT);
    expect(parsed).not.toBeNull();
    const serialized = serializeDigest(parsed!)!;
    expect(serialized).toBe(V1_TEXT);
    expect(parseDigest(serialized)).toEqual(parsed);
  });

  it("v1 digest entry without lineage is parsed, excluded from source, and upgraded with DerivedMeta", async () => {
    const file = mkSessionFile(tmpDir, [v1DigestLine(), ...plainSessionLines(30)]);
    const engine = mkEngine(tmpDir);
    const { captured } = spyBuildSummary(engine as any);
    const r = await engine.compact({
      sessionId: SESSION_ID,
      sessionFile: file,
      tokenBudget: 4000,
      force: false,
    });
    expect(r.compacted).toBe(true);
    assertNoDerivedInSource(captured[0]);
    expect(captured[0].some((l) => l.includes(DIGEST_PREFIX))).toBe(false);

    const digests = digestsOf(file);
    expect(digests).toHaveLength(1);
    expect(digests[0].digestRound).toBe(2);
    expect(digests[0].derived).toMatchObject({
      schemaVersion: DERIVED_META_SCHEMA_VERSION,
      derivedBy: "structural-digest",
      sourceSessionId: SESSION_ID,
      round: 2,
    });
    expect(digests[0].derived.sourceEntryIds).not.toContain("old-digest");
    const merged = parseDigest(digests[0].message.content)!;
    expect(merged.confirmed.some((c) => c.claim.includes("vitest"))).toBe(true);

    const summaries = summariesOf(file);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].derived.sourceEntryIds).not.toContain("old-digest");
  });

  it("v2 digest entry with additive lineage parses, stays protected, and round increments", async () => {
    const parsedBefore = parseDigest(V1_TEXT)!;
    expect(serializeDigest(parsedBefore)).toBe(V1_TEXT);

    const file = mkSessionFile(tmpDir, [v2DigestLine(), ...plainSessionLines(30)]);
    const engine = mkEngine(tmpDir);
    const { captured } = spyBuildSummary(engine as any);
    const r = await engine.compact({
      sessionId: SESSION_ID,
      sessionFile: file,
      tokenBudget: 4000,
      force: false,
    });
    expect(r.compacted).toBe(true);
    assertNoDerivedInSource(captured[0]);

    const digests = digestsOf(file);
    expect(digests).toHaveLength(1);
    expect(digests[0].digestRound).toBe(2);
    expect(digests[0].derived.round).toBe(2);
    expect(digests[0].derived.sourceSessionId).toBe(SESSION_ID);
    const reparsed = parseDigest(digests[0].message.content)!;
    expect(reparsed.rejected.some((x) => x.approach.includes("full transcripts"))).toBe(true);
    expect(serializeDigest(reparsed)).toBe(digests[0].message.content);
  });
});

describe("channel separation — raw evidence store metadata", () => {
  it("ingest tags raw messages with session/role/sourceEntryId", async () => {
    const store = vi.fn(() => ({ id: "mem-1" }));
    const engine = mkEngine(tmpDir, { store, search: vi.fn(async () => []) });

    const r = await engine.ingest({
      sessionId: "s-raw",
      message: { role: "user", id: "entry-1", content: "raw message content long enough" },
    });
    expect(r.ingested).toBe(true);
    expect(store).toHaveBeenCalledWith(
      "raw message content long enough",
      "episodic",
      ["raw-evidence"],
      {
        sessionId: "s-raw",
        role: "user",
        sourceEntryId: "entry-1",
        kind: "raw-evidence",
      },
    );
  });

  it("ingest omits sourceEntryId when the host supplies no entry id", async () => {
    const store = vi.fn(() => ({ id: "mem-2" }));
    const engine = mkEngine(tmpDir, { store, search: vi.fn(async () => []) });

    await engine.ingest({
      sessionId: "s-raw",
      message: { role: "assistant", content: "another raw message long enough" },
    });
    const metadata = store.mock.calls[0][3] as Record<string, unknown>;
    expect(metadata).toEqual({
      sessionId: "s-raw",
      role: "assistant",
      kind: "raw-evidence",
    });
    expect("sourceEntryId" in metadata).toBe(false);
  });

  it("afterTurn ingests only the new messages with raw-evidence metadata", async () => {
    const store = vi.fn(() => ({ id: "mem-at" }));
    const engine = mkEngine(tmpDir, { store, search: vi.fn(async () => []) });

    await engine.afterTurn({
      sessionId: "s-after",
      sessionFile: path.join(tmpDir, "session.jsonl"),
      messages: [
        { role: "user", id: "old-1", content: "old message content long enough" },
        { role: "user", id: "new-1", content: "new message content long enough" },
      ],
      prePromptMessageCount: 1,
    });

    expect(store).toHaveBeenCalledTimes(1);
    expect(store.mock.calls[0][3]).toEqual({
      sessionId: "s-after",
      role: "user",
      sourceEntryId: "new-1",
      kind: "raw-evidence",
    });
  });

  it("ingestBatch stores one raw evidence record per message with its own pointer", async () => {
    const store = vi.fn(() => ({ id: "mem-x" }));
    const engine = mkEngine(tmpDir, { store, search: vi.fn(async () => []) });

    const r = await engine.ingestBatch({
      sessionId: "s-batch",
      messages: [
        { role: "user", id: "b-1", content: "first raw message long enough" },
        { role: "assistant", content: "second raw message long enough" },
      ],
    });
    expect(r.ingestedCount).toBe(2);
    expect(store).toHaveBeenCalledTimes(2);
    expect(store.mock.calls[0][3]).toEqual({
      sessionId: "s-batch",
      role: "user",
      sourceEntryId: "b-1",
      kind: "raw-evidence",
    });
    expect(store.mock.calls[1][3]).toEqual({
      sessionId: "s-batch",
      role: "assistant",
      kind: "raw-evidence",
    });
  });
});
