/**
 * claw-ctx v5.10.0 — Token Count Cache Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TokenCountCache, BatchTokenCounter, getTokenCountCache, resetTokenCountCache, createBatchTokenCounter } from "../../src/token-count-cache.js";

describe("TokenCountCache", () => {
  let cache: TokenCountCache;

  beforeEach(() => {
    cache = new TokenCountCache(100, 60000);
  });

  afterEach(() => {
    cache.clear();
  });

  describe("constructor", () => {
    it("should create instance with default options", () => {
      const c = new TokenCountCache();
      expect(c).toBeDefined();
      expect(c.size).toBe(0);
    });

    it("should create instance with custom options", () => {
      const c = new TokenCountCache(500, 10000);
      expect(c).toBeDefined();
    });
  });

  describe("get/set", () => {
    it("should store and retrieve token counts", () => {
      cache.set("Hello world", 2);
      expect(cache.get("Hello world")).toBe(2);
    });

    it("should return undefined for missing keys", () => {
      expect(cache.get("not found")).toBeUndefined();
    });

    it("should handle different texts correctly", () => {
      cache.set("short", 1);
      cache.set("a longer text with more words", 6);
      expect(cache.get("short")).toBe(1);
      expect(cache.get("a longer text with more words")).toBe(6);
    });

    it("should update existing entries", () => {
      cache.set("test", 5);
      cache.set("test", 10);
      expect(cache.get("test")).toBe(10);
    });
  });

  describe("TTL", () => {
    it("should expire entries after TTL", async () => {
      const shortCache = new TokenCountCache(100, 50); // 50ms TTL
      shortCache.set("test", 5);
      expect(shortCache.get("test")).toBe(5);
      await new Promise((r) => setTimeout(r, 60));
      expect(shortCache.get("test")).toBeUndefined();
      shortCache.clear();
    });
  });

  describe("LRU eviction", () => {
    it("should evict oldest entries when full", () => {
      const smallCache = new TokenCountCache(10);
      for (let i = 0; i < 15; i++) {
        smallCache.set(`text ${i}`, i);
      }
      // First 5 should be evicted
      expect(smallCache.get("text 0")).toBeUndefined();
      expect(smallCache.get("text 4")).toBeUndefined();
      // Recent should still be there
      expect(smallCache.get("text 14")).toBe(14);
      smallCache.clear();
    });
  });

  describe("getStats", () => {
    it("should track hits and misses", () => {
      cache.set("test", 5);
      cache.get("test"); // hit
      cache.get("test"); // hit
      cache.get("missing"); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.666, 1);
    });

    it("should track evictions", () => {
      const smallCache = new TokenCountCache(5);
      for (let i = 0; i < 10; i++) {
        smallCache.set(`text ${i}`, i);
      }
      expect(smallCache.getStats().evictions).toBeGreaterThan(0);
      smallCache.clear();
    });
  });

  describe("clear", () => {
    it("should clear all entries", () => {
      cache.set("a", 1);
      cache.set("b", 2);
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.getStats().hits).toBe(0);
    });
  });
});

describe("BatchTokenCounter", () => {
  let counter: BatchTokenCounter;

  beforeEach(() => {
    resetTokenCountCache();
    counter = createBatchTokenCounter({
      count: (text: string) => ({ tokens: text.split(/\s+/).length, method: "tiktoken" as const }),
      isPrecise: () => true,
    });
  });

  afterEach(() => {
    resetTokenCountCache();
  });

  describe("countBatch", () => {
    it("should count tokens for multiple texts", () => {
      const result = counter.countBatch(["hello world", "foo bar baz"]);
      expect(result.tokens).toEqual([2, 3]);
      expect(result.method).toBe("tiktoken");
    });

    it("should cache results for repeated queries", () => {
      counter.countBatch(["test text", "another text"]);
      const result = counter.countBatch(["test text", "new text"]);
      expect(result.cached).toBe(1); // "test text" was cached
      expect(result.uncached).toBe(1); // "new text" is new
    });

    it("should return cached count from previous calls", () => {
      counter.countBatch(["cached text"]);
      const result = counter.countBatch(["cached text"]);
      expect(result.cached).toBe(1);
      expect(result.uncached).toBe(0);
    });

    it("should handle empty array", () => {
      const result = counter.countBatch([]);
      expect(result.tokens).toEqual([]);
      expect(result.cached).toBe(0);
    });
  });

  describe("countSingle", () => {
    it("should count single text", () => {
      const result = counter.countSingle("hello world test");
      expect(result.tokens).toBe(3);
      expect(result.cached).toBe(false);
    });

    it("should return cached result on second call", () => {
      counter.countSingle("test string");
      const result = counter.countSingle("test string");
      expect(result.cached).toBe(true);
    });
  });

  describe("getStats", () => {
    it("should return cache statistics", () => {
      counter.countBatch(["a", "b", "c"]);
      counter.countBatch(["a", "d"]); // "a" is cached

      const stats = counter.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(4); // b, c, d, and "a" first time
    });
  });
});

describe("Global Cache Instance", () => {
  beforeEach(() => {
    resetTokenCountCache();
  });

  afterEach(() => {
    resetTokenCountCache();
  });

  it("should return same instance from getTokenCountCache", () => {
    const c1 = getTokenCountCache();
    const c2 = getTokenCountCache();
    expect(c1).toBe(c2);
  });

  it("should reset instance", () => {
    getTokenCountCache();
    resetTokenCountCache();
    const c1 = getTokenCountCache();
    const c2 = getTokenCountCache();
    expect(c1).toBe(c2);
  });
});
