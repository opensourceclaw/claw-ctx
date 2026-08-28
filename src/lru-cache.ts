/**
 * claw-ctx - Context Engine for OpenClaw
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
 * claw-ctx v5.11.0 - LRU Cache
 *
 * Bounded LRU cache with optional TTL. Used to wrap session-level caches
 * (_memorySearchCache, _rlGovernanceCache, _crossDomainCache) to prevent
 * unbounded growth in long-running sessions.
 */

export interface LRUCacheOptions {
  /** Maximum entries. When exceeded, least-recently-used is evicted. */
  maxSize: number;
  /** Optional TTL in milliseconds. Expired entries are skipped on read. */
  ttlMs?: number;
}

interface Entry<V> {
  value: V;
  /** Insertion / last-access timestamp. */
  ts: number;
}

export class LRUCache<K, V> {
  private readonly maxSize: number;
  private readonly ttlMs?: number;
  private readonly map = new Map<K, Entry<V>>();

  constructor(opts: LRUCacheOptions) {
    if (opts.maxSize < 0) {
      throw new Error(`LRUCache maxSize must be >= 0, got ${opts.maxSize}`);
    }
    this.maxSize = opts.maxSize;
    this.ttlMs = opts.ttlMs;
  }

  /**
   * Returns the cached value if present and not expired, else undefined.
   * Accessing a value refreshes its LRU position (Map iteration order).
   */
  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      this.map.delete(key);
      return undefined;
    }
    // Refresh LRU position: delete + re-insert.
    this.map.delete(key);
    this.map.set(key, { value: entry.value, ts: Date.now() });
    return entry.value;
  }

  /**
   * Insert or update a value. Evicts LRU entry when over capacity.
   * No-op when maxSize is 0.
   */
  set(key: K, value: V): void {
    if (this.maxSize === 0) return;
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // Map iterates in insertion order; first entry is LRU.
      const lruKey = this.map.keys().next().value;
      if (lruKey !== undefined) this.map.delete(lruKey);
    }
    this.map.set(key, { value, ts: Date.now() });
  }

  /** Remove a single entry. No-op if not present. */
  delete(key: K): boolean {
    return this.map.delete(key);
  }

  /** Current entry count (includes expired entries until pruned). */
  get size(): number {
    return this.map.size;
  }

  /** Whether the cache has any entries. */
  has(key: K): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.map.delete(key);
      return false;
    }
    return true;
  }

  /** Remove all entries. */
  clear(): void {
    this.map.clear();
  }

  /**
   * Sweep all expired entries. Returns the count of pruned entries.
   * No-op when TTL is not configured.
   */
  prune(): number {
    if (this.ttlMs === undefined) return 0;
    let pruned = 0;
    for (const [key, entry] of this.map) {
      if (this.isExpired(entry)) {
        this.map.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  /**
   * Iterate over live entries in LRU order (oldest first).
   * Expired entries are skipped (and deleted as encountered).
   */
  entries(): IterableIterator<[K, V]> {
    return this.liveEntries();
  }

  private *liveEntries(): IterableIterator<[K, V]> {
    for (const [key, entry] of [...this.map]) {
      if (this.isExpired(entry)) {
        this.map.delete(key);
        continue;
      }
      yield [key, entry.value];
    }
  }

  private isExpired(entry: Entry<V>): boolean {
    if (this.ttlMs === undefined) return false;
    return Date.now() - entry.ts > this.ttlMs;
  }
}
