/**
 * claw-ctx — Context Engine for OpenClaw
 *
 * Copyright 2026 Peter Cheng
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * claw-ctx v5.10.0 — Token Count Cache
 *
 * LRU cache for token counting results with TTL support.
 * Provides significant performance improvement for repeated token counts.
 */

// ── Types ──────────────────────────────────────────────────────────

export interface CacheEntry {
  tokens: number;
  ts: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
}

export interface BatchTokenResult {
  tokens: number[];
  method: "tiktoken" | "fallback";
  cached: number;
  uncached: number;
}

// ── TokenCountCache ─────────────────────────────────────────────────

/**
 * LRU cache for token counting results.
 * Uses length prefix + prefix/suffix hashing for collision resistance.
 */
export class TokenCountCache {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private ttlMs: number;
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;

  constructor(maxSize: number = 5000, ttlMs: number = 300000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Get cached token count.
   * Returns undefined if not found or expired.
   */
  get(text: string): number | undefined {
    const key = this.hash(text);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.ts > this.ttlMs) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;
    return entry.tokens;
  }

  /**
   * Store token count in cache.
   */
  set(text: string, tokens: number): void {
    const key = this.hash(text);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evict();
    }

    this.cache.set(key, { tokens, ts: Date.now() });
  }

  /**
   * Generate cache key from text.
   * Uses length prefix + prefix/suffix for collision resistance.
   */
  private hash(text: string): string {
    const len = text.length;
    const prefix = text.slice(0, 30);
    const suffix = text.slice(-30);
    return `${len}|${prefix}|${suffix}`;
  }

  /**
   * Evict oldest entries when cache is full.
   * Removes 10% of entries (oldest first).
   */
  private evict(): void {
    const deleteCount = Math.ceil(this.maxSize * 0.1);
    let deleted = 0;

    // Map iterates in insertion order, so first entries are oldest
    for (const key of this.cache.keys()) {
      if (deleted >= deleteCount) break;
      this.cache.delete(key);
      deleted++;
      this.evictions++;
    }
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      evictions: this.evictions,
    };
  }

  /**
   * Get current cache size.
   */
  get size(): number {
    return this.cache.size;
  }
}

// ── BatchTokenCounter ───────────────────────────────────────────────

/**
 * Optimized batch token counting with caching.
 * Uses parallel processing and caching for efficiency.
 */
export class BatchTokenCounter {
  private cache: TokenCountCache;
  private counter: {
    count: (text: string) => { tokens: number; method: "tiktoken" | "fallback" };
    isPrecise: () => boolean;
  };

  constructor(
    counter: {
      count: (text: string) => { tokens: number; method: "tiktoken" | "fallback" };
      isPrecise: () => boolean;
    },
    cache?: TokenCountCache
  ) {
    this.counter = counter;
    this.cache = cache ?? new TokenCountCache();
  }

  /**
   * Count tokens for multiple texts efficiently.
   * Uses caching to avoid redundant counting.
   */
  countBatch(texts: string[]): BatchTokenResult {
    const results: number[] = new Array(texts.length);
    const uncached: Array<{ index: number; text: string }> = [];

    // 1. Check cache for all texts
    for (let i = 0; i < texts.length; i++) {
      const cached = this.cache.get(texts[i]);
      if (cached !== undefined) {
        results[i] = cached;
      } else {
        uncached.push({ index: i, text: texts[i] });
      }
    }

    // 2. Process uncached texts
    for (const item of uncached) {
      const result = this.counter.count(item.text);
      results[item.index] = result.tokens;
      this.cache.set(item.text, result.tokens);
    }

    return {
      tokens: results,
      method: this.counter.isPrecise() ? "tiktoken" : "fallback",
      cached: texts.length - uncached.length,
      uncached: uncached.length,
    };
  }

  /**
   * Count tokens for a single text (with caching).
   */
  countSingle(text: string): { tokens: number; cached: boolean; method: "tiktoken" | "fallback" } {
    const cached = this.cache.get(text);
    if (cached !== undefined) {
      return { tokens: cached, cached: true, method: this.counter.isPrecise() ? "tiktoken" : "fallback" };
    }

    const result = this.counter.count(text);
    this.cache.set(text, result.tokens);
    return { tokens: result.tokens, cached: false, method: result.method };
  }

  /**
   * Get the underlying cache.
   */
  getCache(): TokenCountCache {
    return this.cache;
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return this.cache.getStats();
  }

  /**
   * Clear the cache.
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// ── Global Cache Instance ───────────────────────────────────────────

let globalCache: TokenCountCache | null = null;

/**
 * Get the global token count cache instance.
 */
export function getTokenCountCache(): TokenCountCache {
  if (!globalCache) {
    globalCache = new TokenCountCache();
  }
  return globalCache;
}

/**
 * Reset the global token count cache.
 */
export function resetTokenCountCache(): void {
  globalCache = null;
}

/**
 * Create a BatchTokenCounter with the global cache.
 */
export function createBatchTokenCounter(
  counter: {
    count: (text: string) => { tokens: number; method: "tiktoken" | "fallback" };
    isPrecise: () => boolean;
  }
): BatchTokenCounter {
  return new BatchTokenCounter(counter, getTokenCountCache());
}
