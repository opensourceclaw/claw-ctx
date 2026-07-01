// Copyright 2026 OpenSourceClaw Contributors
// claw-ctx v5.6.1 — Session-Resume Pipeline Integration Tests
// Tests session-resume components with real imports

import { describe, it, expect } from "vitest";

// Real imports — NO vi.mock
import { HistoryLoader } from "../../src/session-resume/history-loader.js";
import { BucketConsolidator } from "../../src/session-resume/bucket-consolidator.js";
import { ContextAssembler } from "../../src/session-resume/context-assembler.js";
import { ContextQualityEvaluator } from "../../src/session-resume/context-quality-evaluator.js";
import { DEFAULT_SESSION_RESUME_CONFIG } from "../../src/session-resume/types.js";
import type { HistoryEntry, SessionSummary } from "../../src/session-resume/types.js";

// Helper to create mock memory manager for testing
function createMockMemoryManager(): any {
  return {
    search: async () => ({ results: [], memories: [] }),
    store: async () => true,
    sessionId: null,
  };
}

// Helper to create sample session summary with all required fields
function createSampleSummary(theme: string, sessionId: string): SessionSummary {
  return {
    theme,
    sessionId,
    timestamp: Date.now() - Math.random() * 3600000,
    pendingTasks: [],
    keyPoints: ["point1", "point2"],
    messageCount: 2,
    entities: ["entity1", "entity2"],
  };
}

// Helper to create sample history entries with proper structure
function createSampleEntries(): HistoryEntry[] {
  return [
    {
      summary: createSampleSummary("Architecture of claw-ctx", "session-001"),
      memoryId: "mem-1",
      storedAt: Date.now() - 3600000,
      relevanceScore: 0.9,
    },
    {
      summary: createSampleSummary("Three-layer architecture", "session-001"),
      memoryId: "mem-2",
      storedAt: Date.now() - 3500000,
      relevanceScore: 0.85,
    },
    {
      summary: createSampleSummary("Token budget management", "session-002"),
      memoryId: "mem-3",
      storedAt: Date.now() - 1800000,
      relevanceScore: 0.8,
    },
  ];
}

// Helper to create sample session summaries for consolidator
function createSampleSummaries(): SessionSummary[] {
  return [
    createSampleSummary("Architecture discussion", "session-001"),
    createSampleSummary("Token budget discussion", "session-002"),
  ];
}

describe("Session-Resume Pipeline Integration", () => {
  it("TC-PIPE-1: can create HistoryLoader with real import", () => {
    const mockManager = createMockMemoryManager();
    const loader = new HistoryLoader(mockManager, DEFAULT_SESSION_RESUME_CONFIG);
    expect(loader).toBeDefined();
  });

  it("TC-PIPE-2: can create BucketConsolidator with real import", () => {
    const consolidator = new BucketConsolidator();
    expect(consolidator).toBeDefined();
  });

  it("TC-PIPE-3: can create ContextAssembler with real import", () => {
    const mockManager = createMockMemoryManager();
    const assembler = new ContextAssembler(mockManager, DEFAULT_SESSION_RESUME_CONFIG);
    expect(assembler).toBeDefined();
  });

  it("TC-PIPE-4: can create ContextQualityEvaluator with real import", () => {
    const evaluator = new ContextQualityEvaluator();
    expect(evaluator).toBeDefined();
  });

  it("TC-PIPE-5: BucketConsolidator consolidates summaries", () => {
    const consolidator = new BucketConsolidator();
    const summaries = createSampleSummaries();
    const result = consolidator.consolidate(summaries, [], []);
    expect(result).toBeDefined();
    expect(result.level1).toBeDefined();
    expect(result.level2).toBeDefined();
    expect(result.level3).toBeDefined();
  });

  it("TC-PIPE-6: ContextQualityEvaluator evaluates context", () => {
    const evaluator = new ContextQualityEvaluator();
    const entries = createSampleEntries();

    const result = evaluator.evaluate(entries, "Context about architecture and token budget", "architecture");

    expect(result).toBeDefined();
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(1);
  });

  it("TC-PIPE-7: evaluator reports all dimensions", () => {
    const evaluator = new ContextQualityEvaluator();
    const entries = createSampleEntries();

    const result = evaluator.evaluate(entries, "Token budget management information", "token budget");

    expect(result.dimensions).toBeDefined();
    expect(result.dimensions.coverage).toBeDefined();
    expect(result.dimensions.redundancy).toBeDefined();
    expect(result.dimensions.freshness).toBeDefined();
  });

  it("TC-PIPE-8: HistoryLoader.load with injectMode disabled returns empty", async () => {
    const mockManager = createMockMemoryManager();
    const loader = new HistoryLoader(mockManager, {
      ...DEFAULT_SESSION_RESUME_CONFIG,
      injectMode: "disabled",
    });

    const result = await loader.load("test-session");
    expect(result).toBeDefined();
    expect(result.entries).toEqual([]);
  });

  it("TC-PIPE-9: evaluator works with large entries", () => {
    const evaluator = new ContextQualityEvaluator();

    const entries: HistoryEntry[] = [];
    for (let i = 0; i < 50; i++) {
      entries.push({
        summary: createSampleSummary(`Topic ${i}`, `session-${Math.floor(i / 10)}`),
        memoryId: `mem-${i}`,
        storedAt: Date.now() - i * 60000,
        relevanceScore: 0.5 + Math.random() * 0.5,
      });
    }

    const result = evaluator.evaluate(entries, "Summary of all topics", "topics");
    expect(result).toBeDefined();
    expect(result.metadata.entryCount).toBe(50);
  });

  it("TC-PIPE-10: BucketConsolidator handles empty levels", () => {
    const consolidator = new BucketConsolidator();
    const result = consolidator.consolidate([], [], []);
    expect(result).toBeDefined();
    expect(result.level1).toBeDefined();
    expect(result.level2).toBeDefined();
    expect(result.level3).toBeDefined();
  });

  it("TC-PIPE-11: ContextAssembler has assemble method", () => {
    const mockManager = createMockMemoryManager();
    const assembler = new ContextAssembler(mockManager, DEFAULT_SESSION_RESUME_CONFIG);
    expect(typeof assembler.assemble).toBe("function");
  });
});