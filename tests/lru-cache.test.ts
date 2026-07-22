// claw-ctx v5.11.0 - LRUCache tests
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { LRUCache } from "../src/lru-cache.js";

describe("LRUCache", () => {
  describe("basic operations", () => {
    it("set/get returns value", () => {
      const cache = new LRUCache<string, number>({ maxSize: 4 });
      cache.set("a", 1);
      expect(cache.get("a")).toBe(1);
    });

    it("get returns undefined for missing key", () => {
      const cache = new LRUCache<string, number>({ maxSize: 4 });
      expect(cache.get("missing")).toBeUndefined();
    });

    it("has() returns true/false correctly", () => {
      const cache = new LRUCache<string, number>({ maxSize: 4 });
      cache.set("a", 1);
      expect(cache.has("a")).toBe(true);
      expect(cache.has("b")).toBe(false);
    });

    it("delete removes entry", () => {
      const cache = new LRUCache<string, number>({ maxSize: 4 });
      cache.set("a", 1);
      expect(cache.delete("a")).toBe(true);
      expect(cache.delete("a")).toBe(false);
      expect(cache.size).toBe(0);
    });

    it("clear removes all entries", () => {
      const cache = new LRUCache<string, number>({ maxSize: 4 });
      cache.set("a", 1);
      cache.set("b", 2);
      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe("LRU eviction", () => {
    it("evicts oldest entry when capacity exceeded", () => {
      const cache = new LRUCache<string, number>({ maxSize: 2 });
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe(2);
      expect(cache.get("c")).toBe(3);
    });

    it("get refreshes LRU position", () => {
      const cache = new LRUCache<string, number>({ maxSize: 2 });
      cache.set("a", 1);
      cache.set("b", 2);
      // Access "a" so "b" becomes LRU
      cache.get("a");
      cache.set("c", 3);
      expect(cache.get("a")).toBe(1);
      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("c")).toBe(3);
    });

    it("set on existing key refreshes position", () => {
      const cache = new LRUCache<string, number>({ maxSize: 2 });
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("a", 10); // refresh + update
      cache.set("c", 3);
      expect(cache.get("a")).toBe(10);
      expect(cache.get("b")).toBeUndefined();
    });

    it("maxSize=1 holds only one entry", () => {
      const cache = new LRUCache<string, number>({ maxSize: 1 });
      cache.set("a", 1);
      cache.set("b", 2);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe(2);
    });

    it("maxSize=0 never holds entries", () => {
      const cache = new LRUCache<string, number>({ maxSize: 0 });
      cache.set("a", 1);
      expect(cache.size).toBe(0);
      expect(cache.get("a")).toBeUndefined();
    });

    it("throws on negative maxSize", () => {
      expect(() => new LRUCache<string, number>({ maxSize: -1 })).toThrow(
        /maxSize must be >= 0/,
      );
    });
  });

  describe("TTL", () => {
    it("expires entries after TTL", () => {
      const cache = new LRUCache<string, number>({ maxSize: 4, ttlMs: 100 });
      cache.set("a", 1);
      expect(cache.get("a")).toBe(1);

      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now + 101);
      expect(cache.get("a")).toBeUndefined();
      vi.useRealTimers();
    });

    it("isExpired entries are removed on has()", () => {
      const cache = new LRUCache<string, number>({ maxSize: 4, ttlMs: 50 });
      cache.set("a", 1);
      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 51);
      expect(cache.has("a")).toBe(false);
      expect(cache.size).toBe(0);
      vi.useRealTimers();
    });

    it("prune() removes all expired entries", () => {
      const cache = new LRUCache<string, number>({ maxSize: 4, ttlMs: 50 });
      cache.set("a", 1);
      cache.set("b", 2);
      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 51);
      expect(cache.prune()).toBe(2);
      expect(cache.size).toBe(0);
      vi.useRealTimers();
    });

    it("prune() is no-op when TTL not configured", () => {
      const cache = new LRUCache<string, number>({ maxSize: 4 });
      cache.set("a", 1);
      expect(cache.prune()).toBe(0);
    });
  });

  describe("entries iteration", () => {
    it("yields live entries in LRU order (oldest first)", () => {
      const cache = new LRUCache<string, number>({ maxSize: 4 });
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);
      cache.get("a"); // make "b" LRU
      const entries = [...cache.entries()];
      expect(entries).toEqual([
        ["b", 2],
        ["c", 3],
        ["a", 1],
      ]);
    });

    it("skips expired entries", () => {
      const cache = new LRUCache<string, number>({ maxSize: 4, ttlMs: 50 });
      cache.set("a", 1);
      cache.set("b", 2);
      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 51);
      const entries = [...cache.entries()];
      expect(entries).toEqual([]);
      vi.useRealTimers();
    });
  });
});
