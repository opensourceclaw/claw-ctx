import type { TaskType } from "../adaptive/task-type-detector.js";
import type { PredictedItem } from "./types.js";

interface PreloadEntry {
  items: PredictedItem[];
  loadedAt: number;
  ttl: number;
}

/** PreloadManager — in-memory cache for predicted context items. */
export class PreloadManager {
  private cache = new Map<TaskType, PreloadEntry>();
  private defaultTTL = 60000; // 1 minute
  // ponytail: simple Map-based cache; add IndexedDB/file backing when persistence matters

  preload(taskType: TaskType, items: PredictedItem[], ttl?: number): void {
    this.cache.set(taskType, {
      items,
      loadedAt: Date.now(),
      ttl: ttl ?? this.defaultTTL,
    });
  }

  getPreloaded(taskType: TaskType): PredictedItem[] | null {
    const entry = this.cache.get(taskType);
    if (!entry) return null;
    if (Date.now() - entry.loadedAt > entry.ttl) {
      this.cache.delete(taskType);
      return null;
    }
    return entry.items;
  }

  invalidate(taskType?: TaskType): void {
    if (taskType) this.cache.delete(taskType);
    else this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}
