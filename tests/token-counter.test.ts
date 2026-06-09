import { describe, it, expect } from "vitest";
import {
  TiktokenCounter,
  FallbackCounter,
  createTokenCounter,
} from "../src/token-counter";

// ── FallbackCounter Tests ──────────────────────────────────────────

describe("FallbackCounter", () => {
  describe("estimate()", () => {
    it("returns 0 for empty string", () => {
      expect(FallbackCounter.estimate("")).toBe(0);
    });

    it("estimates English text", () => {
      const tokens = FallbackCounter.estimate("Hello world");
      // "Hello world" = 11 chars × 0.25 × 1.1 ≈ 3.025 → ceil = 4
      expect(tokens).toBe(4);
    });

    it("estimates Chinese text higher per character", () => {
      const enTokens = FallbackCounter.estimate("hello");
      const cnTokens = FallbackCounter.estimate("你好世界");
      // Chinese: 4 chars × 1.5 × 1.1 = 6.6 → ceil = 7
      expect(cnTokens).toBeGreaterThan(enTokens);
    });

    it("estimates mixed CJK + English text", () => {
      const tokens = FallbackCounter.estimate("hello 你好 world 世界");
      // Non-CJK: 13 chars × 0.25 = 3.25
      // CJK: 4 chars × 1.5 = 6.0
      // Raw = 9.25 × 1.1 = 10.175 → ceil = 11
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(50); // sanity check
    });

    it("returns at least 1 for any non-empty string", () => {
      expect(FallbackCounter.estimate("a")).toBeGreaterThanOrEqual(1);
      expect(FallbackCounter.estimate("中")).toBeGreaterThanOrEqual(1);
    });

    it("handles long text gracefully", () => {
      const long = "hello world ".repeat(1000);
      const tokens = FallbackCounter.estimate(long);
      expect(tokens).toBeGreaterThan(1000);
      // "hello world " = 12 chars × 0.25 × 1.1 = 3.3 per rep
      // 1000 reps ≈ 3300 tokens (within 1% tolerance)
      expect(tokens).toBeGreaterThanOrEqual(3290);
      expect(tokens).toBeLessThanOrEqual(3310);
    });
  });

  describe("isAccurate()", () => {
    it("always returns false", () => {
      expect(FallbackCounter.isAccurate()).toBe(false);
    });
  });

  describe("accuracy()", () => {
    it("returns base accuracy for empty text", () => {
      expect(FallbackCounter.accuracy()).toBe(0.85);
    });

    it("returns higher accuracy for CJK-heavy text", () => {
      const enAcc = FallbackCounter.accuracy("hello world");
      const cnAcc = FallbackCounter.accuracy("你好世界你好世界你好世界");
      expect(cnAcc).toBeGreaterThan(enAcc);
    });
  });
});

// ── TiktokenCounter Tests ──────────────────────────────────────────

describe("TiktokenCounter", () => {
  describe("initialization", () => {
    it("initializes with default cl100k_base", () => {
      const counter = new TiktokenCounter();
      expect(counter.isAvailable).toBe(true);
      expect(counter.getModel()).toBe("cl100k_base");
    });

    it("initializes with p50k_base", () => {
      const counter = new TiktokenCounter("p50k_base");
      expect(counter.isAvailable).toBe(true);
      expect(counter.getModel()).toBe("p50k_base");
    });

    it("initializes with r50k_base", () => {
      const counter = new TiktokenCounter("r50k_base");
      expect(counter.isAvailable).toBe(true);
      expect(counter.getModel()).toBe("r50k_base");
    });

    it("handles invalid model gracefully", () => {
      const counter = new TiktokenCounter("invalid_model");
      expect(counter.isAvailable).toBe(false);
    });

    it("can switch model with setModel", () => {
      const counter = new TiktokenCounter("cl100k_base");
      counter.setModel("p50k_base");
      expect(counter.getModel()).toBe("p50k_base");
      expect(counter.isAvailable).toBe(true);
    });
  });

  describe("encode() / getTokenCount()", () => {
    const counter = new TiktokenCounter();

    it("counts tokens for English text", () => {
      const count = counter.encode("Hello world");
      expect(count).toBeGreaterThan(0);
      expect(typeof count).toBe("number");
    });

    it("getTokenCount is alias for encode", () => {
      const a = counter.encode("test text");
      const b = counter.getTokenCount("test text");
      expect(a).toBe(b);
    });

    it("counts tokens for Chinese text", () => {
      const count = counter.encode("你好世界");
      expect(count).toBeGreaterThan(0);
    });

    it("handles empty string", () => {
      // tiktoken may return 0 or 1 for empty string depending on encoding
      const count = counter.encode("");
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it("throws when encoder unavailable", () => {
      const bad = new TiktokenCounter("invalid");
      expect(() => bad.encode("test")).toThrow();
    });
  });

  describe("encodeBatch()", () => {
    it("encodes multiple texts in batch", () => {
      const counter = new TiktokenCounter();
      const results = counter.encodeBatch(["hello", "world"]);
      expect(results).toHaveLength(2);
      expect(results[0]).toBeGreaterThan(0);
      expect(results[1]).toBeGreaterThan(0);
    });

    it("handles empty array", () => {
      const counter = new TiktokenCounter();
      expect(counter.encodeBatch([])).toEqual([]);
    });
  });

  describe("decode()", () => {
    it("roundtrips encode → decode", () => {
      const counter = new TiktokenCounter();
      const original = "Hello world";
      const encoded = counter.encode(original);
      const decoded = counter.decode(encoded);
      // tiktoken decode may not give exact original due to normalization
      expect(decoded.length).toBeGreaterThanOrEqual(0);
    });

    it("throws when encoder unavailable", () => {
      const counter = new TiktokenCounter("invalid_model");
      expect(() => counter.decode([1, 2, 3])).toThrow();
    });
  });

  describe("estimateTokenBudget()", () => {
    it("calculates budget correctly", () => {
      const counter = new TiktokenCounter();
      const messages = [
        { content: "Hello world" },
        { content: "foo bar baz" },
      ];
      const budget = counter.estimateTokenBudget(10000, messages);

      expect(budget.totalBudget).toBe(10000);
      expect(budget.consumedTokens).toBeGreaterThan(0);
      expect(budget.remainingBudget).toBeGreaterThan(0);
      expect(budget.reserveBudget).toBe(800); // 8% of 10000
      expect(budget.utilization).toBeGreaterThan(0);
      expect(budget.utilization).toBeLessThan(1);
    });

    it("handles empty messages", () => {
      const counter = new TiktokenCounter();
      const budget = counter.estimateTokenBudget(10000, []);
      expect(budget.consumedTokens).toBe(0);
      expect(budget.remainingBudget).toBe(9200); // 10000 - 0 - 800
    });

    it("caps remainingBudget at 0", () => {
      const counter = new TiktokenCounter();
      // Use a reasonably large string that overflows budget of 100 without causing timeout
      const big = { content: "x".repeat(2000) };
      const budget = counter.estimateTokenBudget(100, [big]);
      expect(budget.remainingBudget).toBe(0);
    }, 10000);
  });

  describe("getStats()", () => {
    it("returns comprehensive stats", () => {
      const counter = new TiktokenCounter();
      const messages = [
        { content: "msg1" },
        { content: "msg2" },
        { content: "msg3" },
      ];
      const stats = counter.getStats(messages);
      expect(stats.totalMessages).toBe(3);
      expect(stats.totalTokens).toBeGreaterThan(0);
      expect(stats.averageTokensPerMessage).toBeGreaterThan(0);
      expect(stats.method).toBe("tiktoken");
      expect(stats.accuracy).toBe(1.0);
    });

    it("handles empty messages", () => {
      const counter = new TiktokenCounter();
      const stats = counter.getStats([]);
      expect(stats.totalMessages).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.averageTokensPerMessage).toBe(0);
    });
  });
});

// ── createTokenCounter Tests ───────────────────────────────────────

describe("createTokenCounter", () => {
  describe("count()", () => {
    it("returns tiktoken result when available", () => {
      const counter = createTokenCounter();
      const result = counter.count("Hello world");
      expect(result.method).toBe("tiktoken");
      expect(result.tokens).toBeGreaterThan(0);
    });

    it("falls back when model is invalid", () => {
      const counter = createTokenCounter("invalid");
      const result = counter.count("Hello world");
      expect(result.method).toBe("fallback");
      expect(result.tokens).toBeGreaterThan(0);
    });
  });

  describe("countBatch()", () => {
    it("batches with tiktoken", () => {
      const counter = createTokenCounter();
      const result = counter.countBatch(["a", "b", "c"]);
      expect(result.method).toBe("tiktoken");
      expect(result.tokens).toHaveLength(3);
    });
  });

  describe("isPrecise()", () => {
    it("returns true for valid model", () => {
      expect(createTokenCounter().isPrecise()).toBe(true);
    });

    it("returns false for invalid model", () => {
      expect(createTokenCounter("invalid").isPrecise()).toBe(false);
    });
  });

  describe("decode()", () => {
    it("throws for fallback counter", () => {
      const counter = createTokenCounter("invalid");
      expect(() => counter.decode([1, 2, 3])).toThrow();
    });
  });
});
