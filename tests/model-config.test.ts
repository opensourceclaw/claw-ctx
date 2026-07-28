import { describe, it, expect } from "vitest";
import { getModelConfigs, type ModelConfig } from "../src/index.js";

describe("getModelConfigs", () => {
  it("should return configs for all builtin models", () => {
    const configs = getModelConfigs();
    expect(Object.keys(configs).length).toBeGreaterThanOrEqual(35);
  });

  it("should include required fields", () => {
    const configs = getModelConfigs();
    for (const [, config] of Object.entries(configs)) {
      expect(config).toHaveProperty("contextWindow");
      expect(config).toHaveProperty("compressionThreshold");
      expect(config).toHaveProperty("effectiveWindowRatio");
      expect(config).toHaveProperty("proactiveThreshold");
    }
  });

  it("should calculate proactiveThreshold correctly (75% of contextWindow)", () => {
    const configs = getModelConfigs();
    for (const [, config] of Object.entries(configs)) {
      const expected = Math.floor(config.contextWindow * 0.75);
      expect(config.proactiveThreshold).toBe(expected);
    }
  });

  it("should return positive values for all fields", () => {
    const configs = getModelConfigs();
    for (const [, config] of Object.entries(configs)) {
      expect(config.contextWindow).toBeGreaterThan(0);
      expect(config.compressionThreshold).toBeGreaterThan(0);
      expect(config.effectiveWindowRatio).toBeGreaterThan(0);
      expect(config.proactiveThreshold).toBeGreaterThan(0);
    }
  });
});
