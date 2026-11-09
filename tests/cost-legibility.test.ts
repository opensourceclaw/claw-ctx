// Exo C1: append-only compaction cost/cache annotations + read-only queries.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

  it("compares two strategy windows and renders markdown", () => {
    const a = summarizeCost([rec({ inputTokens: 1000, cachedTokenShare: 0.4 })]);
    const b = summarizeCost([rec({ at: 2000, inputTokens: 600, cachedTokenShare: 0.8 })]);
    const c = compareCostWindows(a, b);
    expect(c.delta.inputTokens).toBe(-400);
    expect(c.delta.avgCacheShare).toBeCloseTo(0.4);
    expect(renderCostComparisonMarkdown(c)).toContain("| Input tokens | 1000 | 600 | -400 |");
    expect(renderCostReportMarkdown(a)).toContain("Average cache share: 40.0%");
  });

  it("records one annotation per successful compaction (engine integration)", async () => {
    const engine = createClawContextEngine({ workspaceDir: dir }, logger);
    const sessionFile = path.join(dir, "session.jsonl");
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
    expect(records[0].cachedTokenShare).toBeGreaterThanOrEqual(0);
  }, 120_000);
});
