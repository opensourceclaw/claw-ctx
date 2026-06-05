// Tests for DriftBudgetLinker — claw-ctx v4.6.0

import { describe, it, expect, beforeEach } from "vitest";
import { DriftBudgetLinker, DEFAULT_DRIFT_BUDGET_CONFIG } from "../src/drift-budget-linker";
import type { DriftDetector } from "../src/drift-detector";

function makeMockDetector(driftScore = 0): DriftDetector {
  return { getDriftScore: () => driftScore } as DriftDetector;
}

const baseAllocation = {
  sessionId: "test",
  totalBudget: 10000,
  baseContext: 6000,
  crossDomain: 1000,
  ci: 1000,
  buffer: 2000,
  taskType: "coding" as const,
  taskConfidence: 0.8,
  quality: 0.7,
  driftScore: 0,
  timestamp: Date.now(),
};

describe("DriftBudgetLinker", () => {
  let linker: DriftBudgetLinker;
  let detector: DriftDetector;

  beforeEach(() => {
    detector = makeMockDetector(0);
    linker = new DriftBudgetLinker(detector);
  });

  describe("adjustBudget", () => {
    it("should not adjust when drift is below threshold", () => {
      const result = linker.adjustBudget(baseAllocation, 0.3);
      expect(result.driftAdjusted).toBe(false);
      expect(result.buffer).toBe(2000);
    });

    it("should increase buffer when drift exceeds threshold", () => {
      const result = linker.adjustBudget(baseAllocation, 0.7);
      expect(result.driftAdjusted).toBe(true);
      expect(result.buffer).toBeGreaterThan(2000);
      expect(result.baseContext).toBeLessThan(6000);
      expect(result.total).toBe(10000);
    });

    it("should keep crossDomain and ci unchanged", () => {
      const result = linker.adjustBudget(baseAllocation, 0.8);
      expect(result.crossDomain).toBe(1000);
      expect(result.ci).toBe(1000);
    });

    it("should cap buffer at 40% of total", () => {
      linker.updateConfig({ bufferIncreaseRatio: 3.0 });
      const result = linker.adjustBudget(baseAllocation, 0.9);
      expect(result.buffer).toBeLessThanOrEqual(4000);
    });

    it("should cap baseContext at 20% of total minimum", () => {
      linker.updateConfig({ bufferIncreaseRatio: 5.0 });
      const result = linker.adjustBudget(baseAllocation, 0.9);
      expect(result.baseContext).toBeGreaterThanOrEqual(2000);
    });
  });

  describe("isEnabled / setEnabled", () => {
    it("should be enabled by default", () => {
      expect(linker.isEnabled()).toBe(true);
    });

    it("should not adjust when disabled", () => {
      linker.setEnabled(false);
      const result = linker.adjustBudget(baseAllocation, 0.9);
      expect(result.driftAdjusted).toBe(false);
    });
  });

  describe("shouldAdjust", () => {
    it("should return true when drift exceeds threshold", () => {
      const d = makeMockDetector(0.7);
      const l = new DriftBudgetLinker(d);
      expect(l.shouldAdjust()).toBe(true);
    });

    it("should return false when drift is low", () => {
      expect(linker.shouldAdjust()).toBe(false);
    });
  });

  describe("DEFAULT_DRIFT_BUDGET_CONFIG", () => {
    it("should have correct defaults", () => {
      expect(DEFAULT_DRIFT_BUDGET_CONFIG.driftThreshold).toBe(0.5);
      expect(DEFAULT_DRIFT_BUDGET_CONFIG.bufferIncreaseRatio).toBe(1.5);
      expect(DEFAULT_DRIFT_BUDGET_CONFIG.enabled).toBe(true);
    });
  });
});
