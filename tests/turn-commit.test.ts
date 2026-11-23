import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { TurnCommitLedger } from "../src/turn-commit.js";
import { ClawContextEngine } from "../src/engine.js";

describe("TurnCommitLedger (atomic-idempotent-v1 contract)", () => {
  let dir: string;

  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-turn-commit-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("commits a new advancement key", () => {
    const l = new TurnCommitLedger(dir);
    expect(l.commit({ advancementKey: "k1", sessionId: "s1" })).toBe("committed");
  });

  it("returns duplicate for a retried key (host retry after failure)", () => {
    const l = new TurnCommitLedger(dir);
    l.commit({ advancementKey: "k1", sessionId: "s1" });
    expect(l.commit({ advancementKey: "k1", sessionId: "s1" })).toBe("duplicate");
    expect(l.commit({ advancementKey: "k1", sessionId: "s1" })).toBe("duplicate");
  });

  it("keeps keys distinct across sessions", () => {
    const l = new TurnCommitLedger(dir);
    expect(l.commit({ advancementKey: "k1", sessionId: "s1" })).toBe("committed");
    expect(l.commit({ advancementKey: "k1", sessionId: "s2" })).toBe("committed");
  });

  it("survives a torn trailing line (crash mid-append)", () => {
    const l1 = new TurnCommitLedger(dir);
    l1.commit({ advancementKey: "k1", sessionId: "s1" });
    l1.commit({ advancementKey: "k2", sessionId: "s1" });
    const f = path.join(dir, ".claw-ctx", "turn-commits", "s1.jsonl");
    fs.appendFileSync(f, '{"advancementKey":"k3","sessi'); // torn tail
    const l2 = new TurnCommitLedger(dir); // fresh instance re-loads from disk
    expect(l2.commit({ advancementKey: "k1", sessionId: "s1" })).toBe("duplicate");
    expect(l2.commit({ advancementKey: "k2", sessionId: "s1" })).toBe("duplicate");
    expect(l2.commit({ advancementKey: "k3", sessionId: "s1" })).toBe("committed");
  });

  it("re-loads prior commits from disk in a new instance", () => {
    const l1 = new TurnCommitLedger(dir);
    l1.commit({ advancementKey: "k1", sessionId: "s1" });
    const l2 = new TurnCommitLedger(dir);
    expect(l2.commit({ advancementKey: "k1", sessionId: "s1" })).toBe("duplicate");
  });

  it("keeps a post-torn-tail commit discoverable on the next reload", () => {
    const l1 = new TurnCommitLedger(dir);
    l1.commit({ advancementKey: "k1", sessionId: "s1" });
    const f = path.join(dir, ".claw-ctx", "turn-commits", "s1.jsonl");
    fs.appendFileSync(f, '{"advancementKey":"k2","sessi'); // torn tail, no newline

    const l2 = new TurnCommitLedger(dir);
    expect(l2.commit({ advancementKey: "k2", sessionId: "s1" })).toBe("committed");

    // The next record must not be swallowed by the torn fragment.
    const l3 = new TurnCommitLedger(dir);
    expect(l3.commit({ advancementKey: "k1", sessionId: "s1" })).toBe("duplicate");
    expect(l3.commit({ advancementKey: "k2", sessionId: "s1" })).toBe("duplicate");

    const lines = fs.readFileSync(f, "utf-8").split("\n").filter(Boolean);
    const parsed = lines.map((line) => {
      try {
        return JSON.parse(line) as { advancementKey?: string };
      } catch {
        return null;
      }
    });
    expect(parsed.filter(Boolean)).toHaveLength(2);
    expect(parsed.some((rec) => rec?.advancementKey === "k2")).toBe(true);
  });

  it("rejects an empty advancement key or session id", () => {
    const l = new TurnCommitLedger(dir);
    expect(() => l.commit({ advancementKey: "", sessionId: "s1" })).toThrow(/advancementKey/);
    expect(() => l.commit({ advancementKey: "k1", sessionId: "" })).toThrow(/sessionId/);
  });
});

describe("durable turn host contract", () => {
  it("declares the exact host equivalence surface", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-host-contract-"));
    try {
      const manager = { sessionId: "", store: () => {}, search: () => [], injectConstitution: () => {} };
      const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
      const engine = new ClawContextEngine({ workspaceDir: dir }, logger, manager as any);
      const info = engine.info as any;
      const hostEquivalent =
        info.transcriptSemantics?.currentTurnFence === "before-current-turn-entry-v1" &&
        info.transcriptSemantics?.turnAdvancementIdempotency === "atomic-idempotent-v1" &&
        typeof engine.commitTurn === "function";
      expect(hostEquivalent).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
