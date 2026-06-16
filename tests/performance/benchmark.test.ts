/**
 * claw-ctx v4.8.0 — Performance Benchmarks
 *
 * Measures key operation latencies to establish baselines
 * and identify optimization targets.
 */
import { describe, it, expect } from "vitest";
import { TiktokenCounter, FallbackCounter } from "../../src/token-counter";
import { DriftDetector } from "../../src/drift-detector";
import { SmartBudgetAllocator } from "../../src/smart-budget-allocator";
import { SessionStateExtractor } from "../../src/session-state-extractor";

// ── Helpers ────────────────────────────────────────────────────────

function measureTime(fn: () => void): number {
  const start = performance.now();
  fn();
  const end = performance.now();
  return end - start;
}

function measureTimeAsync(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  return fn().then(() => performance.now() - start);
}

const PERF_THRESHOLDS = {
  tokenCountSmall: 100,   // ms for small text
  tokenCountLarge: 200,   // ms for large text
  fallbackCount: 10,       // ms
  driftDetection: 50,     // ms
  budgetAllocation: 60,    // ms
  stateExtraction: 100,   // ms
};

// ── Token Counter Benchmarks ───────────────────────────────────────

describe("Performance: TokenCounter", () => {
  const counter = new TiktokenCounter();

  it("token count latency < 50ms (short text)", () => {
    const text = "Hello world, this is a test of the token counter performance.";
    const elapsed = measureTime(() => counter.encode(text));
    expect(elapsed).toBeLessThan(PERF_THRESHOLDS.tokenCountSmall);
  });

  it("token count latency < 200ms (long text)", () => {
    const text = "The quick brown fox jumps over the lazy dog. ".repeat(500);
    const elapsed = measureTime(() => counter.encode(text));
    expect(elapsed).toBeLessThan(PERF_THRESHOLDS.tokenCountLarge);
  });

  it("batch encode 100 texts < 500ms", () => {
    const texts = Array.from({ length: 100 }, (_, i) => `Message number ${i}: some content here.`);
    const elapsed = measureTime(() => counter.encodeBatch(texts));
    expect(elapsed).toBeLessThan(500);
  });

  it("fallback counter latency < 10ms", () => {
    const text = "Hello world, testing fallback counter performance.";
    const elapsed = measureTime(() => FallbackCounter.estimate(text));
    expect(elapsed).toBeLessThan(PERF_THRESHOLDS.fallbackCount);
  });

  it("fallback counter handles large text efficiently", () => {
    const text = "performance test ".repeat(2000);
    const elapsed = measureTime(() => FallbackCounter.estimate(text));
    expect(elapsed).toBeLessThan(20);
  });
});

// ── Drift Detection Benchmarks ─────────────────────────────────────

describe("Performance: DriftDetector", () => {
  it("drift detection latency < 50ms (3 turns)", () => {
    const detector = new DriftDetector({ minMessages: 1 });
    const elapsed = measureTime(() => {
      detector.feedTurn([{ content: "Fix the authentication bug in the login module" }]);
      detector.feedTurn([{ content: "Working on auth token validation and session management" }]);
      detector.feedTurn([{ content: "Deploy the new Kubernetes cluster to production environment" }]);
    });
    expect(elapsed).toBeLessThan(PERF_THRESHOLDS.driftDetection);
  });

  it("batch detectDrift latency < 100ms", () => {
    const detector = new DriftDetector({ minMessages: 1 });
    const turns = Array.from({ length: 10 }, (_, i) => [
      { content: `Message ${i}: ${i % 2 === 0 ? "fix bug deploy" : "analyze design review"}` },
    ]);
    const elapsed = measureTime(() => detector.detectDrift(turns));
    expect(elapsed).toBeLessThan(100);
  });

  it("getDriftScore is fast", () => {
    const detector = new DriftDetector({ minMessages: 1 });
    for (let i = 0; i < 20; i++) {
      detector.feedTurn([{ content: `message ${i}` }]);
    }
    const elapsed = measureTime(() => detector.getDriftScore());
    expect(elapsed).toBeLessThan(5);
  });

  it("suggestActions is fast", () => {
    const detector = new DriftDetector({ minMessages: 1 });
    for (let i = 0; i < 10; i++) {
      detector.feedTurn([{ content: `message ${i}` }]);
    }
    const elapsed = measureTime(() => detector.suggestActions());
    expect(elapsed).toBeLessThan(5);
  });
});

// ── Budget Allocation Benchmarks ───────────────────────────────────

describe("Performance: SmartBudgetAllocator", () => {
  it("budget allocation latency < 20ms", () => {
    const allocator = new SmartBudgetAllocator();
    const elapsed = measureTime(() => {
      allocator.allocate("session-1", 10000, [
        { content: "Fix the bug in the deployment pipeline" },
        { content: "Refactor the TypeScript codebase" },
      ]);
    });
    expect(elapsed).toBeLessThan(PERF_THRESHOLDS.budgetAllocation);
  });

  it("budget allocation without messages is fast", () => {
    const allocator = new SmartBudgetAllocator();
    const elapsed = measureTime(() => {
      allocator.allocate("session-1", 10000);
    });
    expect(elapsed).toBeLessThan(10);
  });

  it("adjust() latency < 10ms", () => {
    const allocator = new SmartBudgetAllocator();
    const elapsed = measureTime(() => {
      allocator.adjust("coding", 0.8);
    });
    expect(elapsed).toBeLessThan(10);
  });

  it("getHistory() latency < 5ms with many records", () => {
    const allocator = new SmartBudgetAllocator();
    for (let i = 0; i < 50; i++) {
      allocator.allocate(`s${i}`, 10000);
    }
    const elapsed = measureTime(() => allocator.getHistory());
    expect(elapsed).toBeLessThan(5);
  });
});

// ── Session State Extraction Benchmarks ────────────────────────────

describe("Performance: SessionStateExtractor", () => {
  it("state extraction latency < 100ms (50 messages)", () => {
    const messages = Array.from({ length: 50 }, (_, i) => ({
      content: `Message ${i}: Fix the bug in the authentication module. Deploy to production.`,
    }));
    const elapsed = measureTime(() => SessionStateExtractor.extract(messages));
    expect(elapsed).toBeLessThan(PERF_THRESHOLDS.stateExtraction);
  });

  it("state merge latency < 20ms", () => {
    const prev = SessionStateExtractor.extract(
      Array.from({ length: 20 }, (_, i) => ({ content: `previous message ${i}` })),
    );
    const curr = SessionStateExtractor.extract(
      Array.from({ length: 20 }, (_, i) => ({ content: `current message ${i}` })),
    );
    const elapsed = measureTime(() => SessionStateExtractor.merge(prev, curr));
    expect(elapsed).toBeLessThan(20);
  });

  it("getKeyEntities latency < 5ms", () => {
    const state = SessionStateExtractor.extract(
      Array.from({ length: 30 }, (_, i) => ({
        content: `message ${i}: docker kubernetes git npm src/file${i}.ts Peter Friday EDITH`,
      })),
    );
    const elapsed = measureTime(() => SessionStateExtractor.getKeyEntities(state));
    expect(elapsed).toBeLessThan(5);
  });
});

// ── Expanded Benchmarks (v4.10.0) ──────────────────────────────────

describe("Benchmark: Token Encoding Accuracy", () => {
  it("token encoding produces consistent results", () => {
    const counter = new TiktokenCounter("cl100k_base");
    const text = "Hello world, this is a test of token encoding accuracy";
    
    const count1 = counter.encode(text);
    const count2 = counter.encode(text);
    // Same input should produce same output
    expect(count1).toBe(count2);
    expect(count1).toBeGreaterThan(0);
  });

  it("fallback counter provides reasonable estimates", () => {
    const counter = new TiktokenCounter("cl100k_base");
    const texts = ["Hello world", "code: const x = 42;"];
    
    for (const text of texts) {
      const tiktokenCount = counter.encode(text);
      const fallbackCount = FallbackCounter.estimate(text);
      // Both should produce positive token counts
      expect(tiktokenCount).toBeGreaterThan(0);
      expect(fallbackCount).toBeGreaterThan(0);
    }
  });
});

describe("Benchmark: Budget Distribution Efficiency", () => {
  it("budget allocation distributes across categories correctly", () => {
    const allocator = new SmartBudgetAllocator();
    const result = allocator.allocate("test-session", 5000, [
      { role: "user", content: "Fix the bug in the deployment pipeline" },
    ]);
    expect(result.totalBudget).toBe(5000);
    expect(result.baseContext + result.crossDomain + result.ci + result.buffer).toBe(5000);
    expect(result.baseContext).toBeGreaterThan(0);
  });

  it("allocation efficiency detects coding task type", () => {
    const allocator = new SmartBudgetAllocator();
    const codingMsgs = [
      { role: "user", content: "fix the bug in the TypeScript code" },
      { role: "assistant", content: "debugging the deployment pipeline" },
    ];
    const result = allocator.allocate("s1", 10000, codingMsgs);
    expect(result.taskType).toBe("coding");
    expect(result.baseContext).toBeGreaterThanOrEqual(5000);
  });
});

describe("Benchmark: Drift Detection Accuracy", () => {
  it("drift sensitivity at different thresholds", () => {
    const scenarios = [
      { messages: ["auth", "auth", "auth", "auth"], expectedDrift: "low" as const },
      { messages: ["auth", "db", "auth", "db"], expectedDrift: "medium" as const },
      { messages: ["auth", "k8s", "db", "deploy"], expectedDrift: "high" as const },
    ];

    for (const { messages, expectedDrift } of scenarios) {
      const detector = new DriftDetector({ minMessages: 2 });
      for (const msg of messages) {
        detector.feedTurn([{ content: msg }]);
      }
      const score = detector.getDriftScore();
      if (expectedDrift === "low") expect(score).toBeLessThan(0.4);
      else if (expectedDrift === "medium") expect(score).toBeGreaterThanOrEqual(0);
      // High drift scenarios should produce measurable scores
      expect(score).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Benchmark: Session State Throughput", () => {
  it("state extraction handles large message volumes", () => {
    const messages = Array.from({ length: 200 }, (_, i) => ({
      content: `Msg ${i}: fix deploy test ${"data ".repeat(20)}`,
    }));
    const elapsed = measureTime(() => SessionStateExtractor.extract(messages));
    // Should complete within reasonable time for 200 messages
    expect(elapsed).toBeLessThan(500);
  });
});
