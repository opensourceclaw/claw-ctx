// OpenClaw trial bug: claw-mem v7.8.x hits carry relevance in
// `metadata.retention` (JSON string), not a top-level `score` — every hit
// mapped to 0 and the 0.3 gate silently dropped all memory injection.

import { describe, it, expect, vi } from "vitest";

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

import { createClawContextEngine, scoreOf } from "../src/engine";

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

function fakeManager(hits: any[]) {
  return {
    sessionId: "",
    store: vi.fn(),
    search: vi.fn().mockReturnValue(hits),
    injectConstitution: vi.fn(),
    transcript: null,
    sessionSnapshot: vi.fn(),
    sessionGetUnclosed: () => ({ sessions: [] }),
    sessionClose: () => ({ closed: false }),
  };
}

function makeEngine(hits: any[]) {
  return createClawContextEngine(
    { workspaceDir: "/tmp", sessionResume: false },
    logger,
    fakeManager(hits) as any,
  );
}

describe("claw-mem relevance score contract", () => {
  it("scoreOf reads top-level, retention, and neutral defaults", () => {
    expect(scoreOf({ score: 0.9 })).toBe(0.9);
    expect(scoreOf({ metadata: { retention: JSON.stringify({ score: 0.6 }) } })).toBe(0.6);
    expect(scoreOf({ metadata: {} })).toBe(0.5);
    expect(scoreOf({ metadata: { retention: "not-json" } })).toBe(0.5);
  });

  it("assemble reads retention scores and reports missing fields", async () => {
    const hits = [
      { id: "a", content: "alpha memory", metadata: { retention: JSON.stringify({ score: 0.6 }) } },
      { id: "b", content: "beta memory", metadata: {} },
      { id: "c", content: "gamma memory", metadata: { retention: "broken{" } },
      { id: "d", content: "delta memory", score: 0.9 },
    ];
    const engine = makeEngine(hits);

    const res = await engine.assemble({
      sessionId: "s1",
      messages: [{ role: "user", content: "what do I remember?" }],
      prompt: "what do I remember?",
      tokenBudget: 400,
      confidenceMode: "strict",
      confidenceThreshold: 0.3,
    });

    expect(res.confidenceReport).toBeDefined();
    expect(res.confidenceReport!.totalItems).toBe(4);
    expect(res.confidenceReport!.passedItems).toBe(4);
    expect(res.confidenceReport!.scoreFieldMissing).toBe(2);
    expect(res.confidenceReport!.memoryDroppedByGate).toBe(0);
    expect(res.confidenceReport!.avgConfidence).toBeCloseTo(0.625);
    expect(res.estimatedTokens).toBeGreaterThan(0);
    expect(res.systemPromptAddition).toContain("alpha memory");
  });

  it("gate drops are reported instead of silent empty injection", async () => {
    const hits = [
      { id: "low", content: "low relevance memory", metadata: { retention: JSON.stringify({ score: 0.1 }) } },
    ];
    const engine = makeEngine(hits);

    const res = await engine.assemble({
      sessionId: "s1",
      messages: [{ role: "user", content: "anything?" }],
      prompt: "anything?",
      tokenBudget: 400,
      confidenceMode: "strict",
      confidenceThreshold: 0.3,
    });

    expect(res.confidenceReport!.totalItems).toBe(1);
    expect(res.confidenceReport!.passedItems).toBe(0);
    expect(res.confidenceReport!.memoryDroppedByGate).toBe(1);
    expect(res.estimatedTokens).toBe(0);
    expect(res.systemPromptAddition ?? "").not.toContain("low relevance memory");
  });
});
