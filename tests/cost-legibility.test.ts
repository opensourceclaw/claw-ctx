// Exo C1: append-only compaction cost/cache annotations + read-only queries.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

vi.mock("../../claw-mem/dist/memory_manager", () => ({
  getMemoryManager: () => ({
    sessionId: "",
    store: vi.fn(),
    search: vi.fn().mockReturnValue([]),
    injectConstitution: vi.fn(),
  }),
  MemoryManager: class {},
}));

vi.mock("../../claw-rl/src/memory_strategy_selector", () => ({
  MemoryStrategySelector: class {
    select() {
      return { strategy: "selective_recall", confidence: 0.8, topK: 8, budgetAllocation: 2400, reasoning: "mock" };
    }
    recordFeedback() {}
    getStats() { return {}; }
    reset() {}
  },
}));

import { createClawContextEngine } from "../src/engine";
import { VERSION } from "../src/version";
import { usageLedger } from "../src/usage/usage-ledger";
import { parseArgs, parseTimeBound } from "../src/cli";
import {
  appendCostAnnotation,
  readCostAnnotations,
  summarizeCost,
  compareCostWindows,
  renderCostReportMarkdown,
  renderCostComparisonMarkdown,
  costLedgerPath,
  type CostAnnotation,
} from "../src/obs/cost-legibility";

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

function rec(over: Partial<CostAnnotation> = {}): CostAnnotation {
  return {
    at: 1000,
    event: "compaction",
    sessionId: "s1",
    strategyVersion: "claw-ctx@6.15.1",
    triggerReason: "explicit",
    inputTokens: 1000,
    outputTokens: 400,
    cachedTokenShare: 0.5,
    ...over,
  };
}

describe("cost legibility ledger", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-ctx-cost-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("appends without rewriting and reads back idempotently", () => {
    const file = costLedgerPath(dir);
    expect(appendCostAnnotation(file, rec())).toBe(true);
    expect(appendCostAnnotation(file, rec({ at: 2000, sessionId: "s2" }))).toBe(true);

    const first = readCostAnnotations(file);
    const second = readCostAnnotations(file);
    expect(first.bad).toBe(0);
    expect(first.records).toHaveLength(2);
    expect(second).toEqual(first);
    expect(fs.readFileSync(file, "utf-8").trim().split("\n")).toHaveLength(2);
  });

  it("counts malformed ledger lines without failing", () => {
    const file = costLedgerPath(dir);
    appendCostAnnotation(file, rec());
    fs.appendFileSync(file, "not-json\n");
    const { records, bad } = readCostAnnotations(file);
    expect(records).toHaveLength(1);
    expect(bad).toBe(1);
  });

  it("rejects rows missing cachedTokenShare/strategyVersion/triggerReason (F2)", () => {
    const file = costLedgerPath(dir);
    appendCostAnnotation(file, rec({ cachedTokenShare: null })); // null = unknown, valid
    for (const key of ["cachedTokenShare", "strategyVersion", "triggerReason"] as const) {
      const row: Record<string, unknown> = { ...rec() };
      delete row[key];
      fs.appendFileSync(file, JSON.stringify(row) + "\n");
    }
    const { records, bad } = readCostAnnotations(file);
    expect(records).toHaveLength(1);
    expect(bad).toBe(3);
  });

  it("rejects out-of-range share and unknown triggerReason (F9)", () => {
    const file = costLedgerPath(dir);
    appendCostAnnotation(file, rec({ cachedTokenShare: 0 })); // lower boundary valid
    appendCostAnnotation(file, rec({ cachedTokenShare: 1 })); // upper boundary valid
    fs.appendFileSync(file, JSON.stringify({ ...rec(), cachedTokenShare: 1.5 }) + "\n");
    fs.appendFileSync(file, JSON.stringify({ ...rec(), cachedTokenShare: -0.1 }) + "\n");
    fs.appendFileSync(file, JSON.stringify({ ...rec(), triggerReason: "manual" }) + "\n");
    const { records, bad } = readCostAnnotations(file);
    expect(records).toHaveLength(2);
    expect(bad).toBe(3);
  });

  it("rejects bare/empty --from/--to with accurate wording (F8)", () => {
    // Parser layer: empty string survives as a value; a bare flag stays the "true" sentinel.
    expect(parseArgs(["cost", "--from", ""]).options.from).toBe("");
    expect(parseArgs(["cost", "--from"]).options.from).toBe("true");
    expect(parseArgs(["cost", "--json"]).options.json).toBe("true");

    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    try {
      expect(() => parseTimeBound("from", "")).toThrow("exit:2");
      expect(String(err.mock.calls.at(-1)?.[0])).toContain("invalid --from value ''");

      expect(() => parseTimeBound("from", "true")).toThrow("exit:2");
      expect(String(err.mock.calls.at(-1)?.[0])).toContain("--from requires a value");

      expect(() => parseTimeBound("to", "not-a-date")).toThrow("exit:2");
      expect(String(err.mock.calls.at(-1)?.[0])).toContain("invalid --to value 'not-a-date'");

      expect(parseTimeBound("from", undefined)).toBeUndefined();
      expect(parseTimeBound("from", "1500")).toBe(1500);
      expect(parseTimeBound("from", "1970-01-01T00:00:01.500Z")).toBe(1500);
    } finally {
      err.mockRestore();
      exit.mockRestore();
    }
  });

  it("summarizes cost/cache by window and strategy version", () => {
    const records = [
      rec({ at: 1000, inputTokens: 1000, outputTokens: 400, cachedTokenShare: 0.5 }),
      rec({ at: 2000, inputTokens: 300, outputTokens: 100, cachedTokenShare: 0.7, triggerReason: "auto" }),
      rec({ at: 3000, inputTokens: 500, outputTokens: 200, cachedTokenShare: 0.9, strategyVersion: "claw-ctx@6.16.0" }),
    ];
    const all = summarizeCost(records);
    expect(all.eventCount).toBe(3);
    expect(all.inputTokens).toBe(1800);
    expect(all.outputTokens).toBe(700);
    expect(all.tokensSaved).toBe(1100);
    expect(all.avgCacheShare).toBeCloseTo(0.7);
    expect(all.byTrigger).toEqual({ explicit: 2, auto: 1 });

    const v1 = summarizeCost(records, { strategyVersion: "claw-ctx@6.15.1" });
    expect(v1.eventCount).toBe(2);
    expect(v1.strategyVersions).toEqual(["claw-ctx@6.15.1"]);

    const windowed = summarizeCost(records, { from: 1500, to: 2500 });
    expect(windowed.eventCount).toBe(1);
    expect(windowed.window).toEqual({ start: 2000, end: 2000 });
  });

  it("treats null cache share as unknown, never as 0%", () => {
    const mixed = summarizeCost([
      rec({ cachedTokenShare: null }),
      rec({ at: 2000, cachedTokenShare: 0.5 }),
    ]);
    expect(mixed.avgCacheShare).toBe(0.5); // only known shares count

    const allNull = summarizeCost([rec({ cachedTokenShare: null })]);
    expect(allNull.avgCacheShare).toBeNull();
    expect(renderCostReportMarkdown(allNull)).toContain("Average cache share: n/a");
  });

  it("compares two strategy windows and renders markdown", () => {
    const a = summarizeCost([rec({ inputTokens: 1000, cachedTokenShare: 0.4 })]);
    const b = summarizeCost([rec({ at: 2000, inputTokens: 600, cachedTokenShare: 0.8 })]);
    const c = compareCostWindows(a, b);
    expect(c.delta.inputTokens).toBe(-400);
    expect(c.delta.avgCacheShare).toBeCloseTo(0.4);
    expect(renderCostComparisonMarkdown(c)).toContain("| Input tokens | 1000 | 600 | -400 |");
    expect(renderCostReportMarkdown(a)).toContain("Average cache share: 40.0%");
  });

  const distCliPath = path.resolve(import.meta.dirname, "../dist/cli.js");
  const hasDistCli = fs.existsSync(distCliPath);

  it.skipIf(!hasDistCli)("runs when invoked through a symlinked bin (F10; needs dist/cli.js — run npm run build first)", () => {
    const link = path.join(dir, "claw-ctx-bin");
    fs.symlinkSync(distCliPath, link);
    const r = spawnSync(process.execPath, [link, "--help"], { encoding: "utf-8" });
    expect(r.status).toBe(0);
    expect(String(r.stdout ?? "")).toContain("claw-ctx CLI");
    expect(String(r.stderr ?? "")).not.toContain("cli not invoked as main entry");
  });

  it("prints a debug hint when imported under CLAW_CTX_CLI_DEBUG (F10)", async () => {
    vi.resetModules();
    process.env.CLAW_CTX_CLI_DEBUG = "1";
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await import("../src/cli.js");
      expect(String(err.mock.calls.at(-1)?.[0])).toContain("cli not invoked as main entry");
    } finally {
      delete process.env.CLAW_CTX_CLI_DEBUG;
      err.mockRestore();
    }
  });

  function writeSession(sessionFile: string): void {
    const filler = "Lorem ipsum dolor sit amet ".repeat(40);
    const entries = [JSON.stringify({ type: "session", version: "3", id: "t", timestamp: new Date().toISOString(), cwd: dir })];
    for (let i = 0; i < 30; i++) {
      entries.push(JSON.stringify({
        type: "message",
        id: `m${i}`,
        parentId: i === 0 ? "t" : `m${i - 1}`,
        timestamp: new Date(Date.now() - (30 - i) * 1000).toISOString(),
        message: { role: i % 2 === 0 ? "user" : "assistant", content: `Msg ${i}: ${filler}` },
      }));
    }
    fs.writeFileSync(sessionFile, entries.join("\n") + "\n", "utf-8");
  }

  it("records one annotation per successful compaction (engine integration)", async () => {
    const engine = createClawContextEngine({ workspaceDir: dir }, logger);
    const sessionFile = path.join(dir, "session.jsonl");
    writeSession(sessionFile);

    const result = await engine.compact({
      sessionId: "s1",
      sessionFile,
      force: false,
      currentTokenCount: 110000,
      tokenBudget: 4000,
    });
    expect(result.compacted).toBe(true);

    const { records, bad } = readCostAnnotations(costLedgerPath(dir));
    expect(bad).toBe(0);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      event: "compaction",
      sessionId: "s1",
      strategyVersion: `claw-ctx@${VERSION}`,
    });
    expect(records[0].inputTokens).toBeGreaterThan(0);
    expect(records[0].outputTokens).toBeGreaterThan(0);
    // No host usage reported for s1 → unknown, explicitly not 0.
    expect(records[0].cachedTokenShare).toBeNull();
  }, 120_000);

  it("writes event-time cache share from host-reported usage (F1 wiring)", async () => {
    usageLedger.recordUsage("s1-cache", {
      inputTokens: 100,
      cacheReadTokens: 300,
      cacheCreationTokens: 100,
    });
    const engine = createClawContextEngine({ workspaceDir: dir }, logger);
    const sessionFile = path.join(dir, "session-cache.jsonl");
    writeSession(sessionFile);

    const result = await engine.compact({
      sessionId: "s1-cache",
      sessionFile,
      force: false,
      currentTokenCount: 110000,
      tokenBudget: 4000,
    });
    expect(result.compacted).toBe(true);

    const { records } = readCostAnnotations(costLedgerPath(dir));
    expect(records).toHaveLength(1);
    // 300 / (100 + 300 + 100) — a live value, discriminating from the old
    // always-zero (disconnected) behaviour.
    expect(records[0].cachedTokenShare).toBeCloseTo(0.6);
  }, 120_000);

  it("falls back to the workspace-persisted usage ledger (F7-a)", async () => {
    const ledgerFile = path.join(dir, ".claw-ctx", "usage-ledger.jsonl");
    fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
    fs.writeFileSync(ledgerFile, JSON.stringify({
      kind: "usage",
      sessionId: "s1-persisted",
      record: {
        inputTokens: 100, cacheReadTokens: 300, cacheCreationTokens: 0,
        outputTokens: 10, mergedTotal: 400, turn: 1, at: Date.now(),
      },
    }) + "\n", "utf-8");

    const engine = createClawContextEngine({ workspaceDir: dir }, logger);
    const sessionFile = path.join(dir, "session-persisted.jsonl");
    writeSession(sessionFile);
    const result = await engine.compact({
      sessionId: "s1-persisted",
      sessionFile,
      force: false,
      currentTokenCount: 110000,
      tokenBudget: 4000,
    });
    expect(result.compacted).toBe(true);

    const { records } = readCostAnnotations(costLedgerPath(dir));
    expect(records).toHaveLength(1);
    // No in-process usage for this session → persisted ledger fallback wins.
    expect(records[0].cachedTokenShare).toBeCloseTo(0.75);
  }, 120_000);
});
