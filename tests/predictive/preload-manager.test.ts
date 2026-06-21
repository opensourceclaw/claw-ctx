import { describe, it, expect } from "vitest";
import { PreloadManager } from "../../src/predictive/preload-manager.js";
import type { PredictedItem } from "../../src/predictive/types.js";

const items: PredictedItem[] = [
  { key: "typescript", confidence: 0.9, source: "frequency" },
  { key: "deploy", confidence: 0.7, source: "co-occurrence" },
];

describe("PreloadManager", () => {
  it("preload and getPreloaded roundtrip", () => {
    const manager = new PreloadManager();
    manager.preload("coding", items);
    const result = manager.getPreloaded("coding");
    expect(result).toEqual(items);
  });

  it("getPreloaded returns null for unknown task type", () => {
    const manager = new PreloadManager();
    expect(manager.getPreloaded("review")).toBeNull();
  });

  it("expired cache returns null", async () => {
    const manager = new PreloadManager();
    manager.preload("coding", items, 1); // 1ms TTL
    await new Promise((r) => setTimeout(r, 10));
    expect(manager.getPreloaded("coding")).toBeNull();
    expect(manager.size()).toBe(0);
  });

  it("invalidate clears specific task type", () => {
    const manager = new PreloadManager();
    manager.preload("coding", items);
    manager.preload("debugging", [{ key: "error", confidence: 0.8, source: "frequency" }]);
    manager.invalidate("coding");
    expect(manager.getPreloaded("coding")).toBeNull();
    expect(manager.getPreloaded("debugging")).not.toBeNull();
  });

  it("invalidate without arg clears all", () => {
    const manager = new PreloadManager();
    manager.preload("coding", items);
    manager.preload("debugging", [{ key: "error", confidence: 0.8, source: "frequency" }]);
    manager.invalidate();
    expect(manager.getPreloaded("coding")).toBeNull();
    expect(manager.getPreloaded("debugging")).toBeNull();
    expect(manager.size()).toBe(0);
  });

  it("size returns cache entry count", () => {
    const manager = new PreloadManager();
    expect(manager.size()).toBe(0);
    manager.preload("coding", items);
    expect(manager.size()).toBe(1);
    manager.preload("debugging", items);
    expect(manager.size()).toBe(2);
  });
});
