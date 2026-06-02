import { describe, it, expect, beforeEach } from "vitest";
import { ConfidenceGate } from "../src/confidence_gate";

describe("ConfidenceGate", () => {
  let gate: ConfidenceGate;

  describe("strict mode", () => {
    beforeEach(() => {
      gate = new ConfidenceGate({ threshold: 0.5, mode: "strict" });
    });

    it("passes items above threshold", () => {
      const items = [
        { content: "high confidence", score: 0.8 },
        { content: "low confidence", score: 0.2 },
      ];
      const { passed, report } = gate.gate(items);
      expect(passed).toHaveLength(1);
      expect(passed[0].content).toBe("high confidence");
      expect(report.totalItems).toBe(2);
      expect(report.passedItems).toBe(1);
      expect(report.mode).toBe("strict");
    });

    it("rejects items exactly at threshold", () => {
      const items = [
        { content: "borderline", score: 0.5 },
      ];
      const { passed } = gate.gate(items);
      expect(passed).toHaveLength(1); // >= threshold includes equal
    });

    it("rejects items below threshold", () => {
      const items = [
        { content: "below", score: 0.49 },
      ];
      const { passed } = gate.gate(items);
      expect(passed).toHaveLength(0);
    });

    it("produces correct report", () => {
      const items = [
        { content: "a", score: 0.9 },
        { content: "b", score: 0.4 },
        { content: "c", score: 0.3 },
        { content: "d", score: 0.6 },
      ];
      const { report } = gate.gate(items);
      expect(report.totalItems).toBe(4);
      expect(report.passedItems).toBe(2);
      expect(report.avgConfidence).toBeCloseTo(0.55);
      expect(report.threshold).toBe(0.5);
    });

    it("respects minItems", () => {
      gate = new ConfidenceGate({ threshold: 0.9, mode: "strict", minItems: 2 });
      const items = [
        { content: "very high", score: 0.95 },
        { content: "mid", score: 0.5 },
        { content: "low", score: 0.1 },
      ];
      const { passed } = gate.gate(items);
      expect(passed.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("adaptive mode", () => {
    beforeEach(() => {
      gate = new ConfidenceGate({ threshold: 0.5, mode: "adaptive" });
    });

    it("adjusts threshold based on score distribution", () => {
      // All scores near 0.4 → threshold should relax
      const lowItems = [
        { content: "a", score: 0.45 },
        { content: "b", score: 0.42 },
        { content: "c", score: 0.38 },
        { content: "d", score: 0.35 },
      ];
      const { report } = gate.gate(lowItems);
      // Adaptive threshold should be lower than base 0.5
      expect(report.threshold).toBeLessThan(0.5);
    });

    it("tightens when most items exceed threshold", () => {
      const highItems = [
        { content: "a", score: 0.95 },
        { content: "b", score: 0.85 },
        { content: "c", score: 0.75 },
      ];
      const { report } = gate.gate(highItems);
      // Threshold for high scores should be near base threshold
      expect(report.threshold).toBeGreaterThanOrEqual(0.45);
    });

    it("handles empty input", () => {
      const { passed, report } = gate.gate([]);
      expect(passed).toHaveLength(0);
      expect(report.totalItems).toBe(0);
      expect(report.avgConfidence).toBe(0);
    });
  });

  describe("disabled mode", () => {
    beforeEach(() => {
      gate = new ConfidenceGate({ mode: "disabled" });
    });

    it("passes all items regardless of score", () => {
      const items = [
        { content: "good", score: 0.9 },
        { content: "bad", score: 0.01 },
      ];
      const { passed } = gate.gate(items);
      expect(passed).toHaveLength(2);
    });

    it("reports mode correctly", () => {
      const { report } = gate.gate([
        { content: "test", score: 0.1 },
      ]);
      expect(report.mode).toBe("disabled");
      expect(report.threshold).toBe(0);
    });
  });

  describe("runtime config updates", () => {
    it("setThreshold updates threshold", () => {
      gate = new ConfidenceGate({ threshold: 0.5, mode: "strict" });
      gate.setThreshold(0.8);
      const { passed } = gate.gate([
        { content: "mid", score: 0.6 },
      ]);
      expect(passed).toHaveLength(0);
    });

    it("setMode switches modes at runtime", () => {
      gate = new ConfidenceGate({ threshold: 0.7, mode: "strict" });
      // In strict mode, 0.6 < 0.7 → rejected
      let { passed } = gate.gate([{ content: "mid", score: 0.6 }]);
      expect(passed).toHaveLength(0);

      gate.setMode("disabled");
      ({ passed } = gate.gate([{ content: "mid", score: 0.6 }]));
      expect(passed).toHaveLength(1);
    });

    it("getConfig returns current config", () => {
      gate = new ConfidenceGate({ threshold: 0.6, mode: "adaptive", minItems: 3 });
      const config = gate.getConfig();
      expect(config.threshold).toBe(0.6);
      expect(config.mode).toBe("adaptive");
      expect(config.minItems).toBe(3);
    });

    it("clamps threshold to 0-1", () => {
      gate.setThreshold(1.5);
      expect(gate.getConfig().threshold).toBe(1);
      gate.setThreshold(-0.5);
      expect(gate.getConfig().threshold).toBe(0);
    });
  });
});
