import { describe, it, expect } from "vitest";
import { TokenBudgetManager } from "../src/token_budget_manager";

function freshBm(opts?: any): TokenBudgetManager {
  return new TokenBudgetManager(opts);
}

describe("TokenBudgetManager", () => {
  describe("default config (v4.0.0: 60/10/10/20)", () => {
    it("allocates 60/10/10/20 by default", () => {
      const m = freshBm();
      const r = m.calculate(8000);
      expect(r.allocation.baseContext).toBe(4800);
      expect(r.allocation.crossDomainSignals).toBe(800);
      expect(r.allocation.ciSignals).toBe(800);
      expect(r.allocation.buffer).toBe(1600);
      expect(r.allocation.total).toBe(8000);
    });

    it("sums to total budget", () => {
      const m = freshBm();
      const r = m.calculate(10000);
      const { baseContext, crossDomainSignals, ciSignals, buffer } = r.allocation;
      expect(baseContext + crossDomainSignals + ciSignals + buffer).toBe(10000);
    });

    it("returns effective budgets", () => {
      const m = freshBm();
      const r = m.calculate(8000);
      expect(r.effectiveBaseBudget).toBe(4800);
      expect(r.crossDomainBudget).toBe(800);
      expect(r.ciBudget).toBe(800);
    });
  });

  describe("custom percentages", () => {
    it("accepts custom allocation", () => {
      const m = freshBm({
        baseContextPct: 50,
        crossDomainPct: 10,
        ciPct: 20,
        bufferPct: 20,
      });
      const r = m.calculate(10000);
      expect(r.allocation.baseContext).toBe(5000);
      expect(r.allocation.crossDomainSignals).toBe(1000);
      expect(r.allocation.ciSignals).toBe(2000);
      expect(r.allocation.buffer).toBe(2000);
    });

    it("throws when percentages don't sum to 100", () => {
      expect(() => {
        freshBm({ baseContextPct: 80, crossDomainPct: 10, ciPct: 10, bufferPct: 20 });
      }).toThrow("Budget percentages must sum to 100");
    });
  });

  describe("reserves", () => {
    it("reserveForCrossDomain returns correct reserve", () => {
      const m = freshBm();
      expect(m.reserveForCrossDomain(true)).toBe(800); // 10% of 8000
    });

    it("reserveForCrossDomain returns 0 when disabled", () => {
      const m = freshBm();
      expect(m.reserveForCrossDomain(false)).toBe(0);
    });

    it("reserveForCI returns correct reserve", () => {
      const m = freshBm();
      expect(m.reserveForCI(true)).toBe(800); // 10% of 8000
    });

    it("reserveForCI returns 0 when disabled", () => {
      const m = freshBm();
      expect(m.reserveForCI(false)).toBe(0);
    });
  });

  describe("canFit", () => {
    it("checks base budget", () => {
      const m = freshBm();
      expect(m.canFit(1000, 500, "base")).toBe(true);
      expect(m.canFit(4700, 500, "base")).toBe(false);
    });

    it("checks cross-domain budget", () => {
      const m = freshBm();
      expect(m.canFit(300, 400, "crossDomain")).toBe(true);
      expect(m.canFit(700, 200, "crossDomain")).toBe(false);
    });

    it("checks CI budget", () => {
      const m = freshBm();
      expect(m.canFit(300, 400, "ci")).toBe(true);
      expect(m.canFit(700, 200, "ci")).toBe(false);
    });
  });

  describe("remaining", () => {
    it("returns remaining budgets", () => {
      const m = freshBm();
      expect(m.remaining(2000, "base")).toBe(2800); // 4800 - 2000
      expect(m.remaining(200, "crossDomain")).toBe(600); // 800 - 200
      expect(m.remaining(100, "ci")).toBe(700); // 800 - 100
    });

    it("returns 0 when over budget", () => {
      const m = freshBm();
      expect(m.remaining(5000, "base")).toBe(0);
    });
  });

  describe("updateConfig", () => {
    it("updates percentages at runtime", () => {
      const m = freshBm();
      m.updateConfig({
        baseContextPct: 40,
        crossDomainPct: 15,
        ciPct: 15,
        bufferPct: 30,
      });
      const r = m.calculate(10000);
      expect(r.allocation.baseContext).toBe(4000);
      expect(r.allocation.crossDomainSignals).toBe(1500);
      expect(r.allocation.ciSignals).toBe(1500);
    });
  });

  describe("getConfig", () => {
    it("returns current config", () => {
      const m = freshBm();
      const config = m.getConfig();
      expect(config.totalBudget).toBe(8000);
      expect(config.baseContextPct).toBe(60);
      expect(config.crossDomainPct).toBe(10);
      expect(config.ciPct).toBe(10);
      expect(config.bufferPct).toBe(20);
    });
  });

  describe("edge cases: min/max clamping", () => {
    it("clamps crossDomain to maxCrossDomain", () => {
      const m = freshBm({
        baseContextPct: 30,
        crossDomainPct: 60,
        ciPct: 5,
        bufferPct: 5,
      });
      // crossDomain % (6000) > maxCrossDomain (5000 default)
      const r = m.calculate(10000);
      expect(r.allocation.crossDomainSignals).toBeLessThanOrEqual(5000);
    });

    it("clamps ciSignals to maxCI", () => {
      const m = freshBm({
        baseContextPct: 30,
        crossDomainPct: 5,
        ciPct: 60,
        bufferPct: 5,
      });
      const r = m.calculate(10000);
      expect(r.allocation.ciSignals).toBeLessThanOrEqual(3000);
    });

    it("applies minBaseContext when base is too low", () => {
      const m = freshBm({
        baseContextPct: 5,
        crossDomainPct: 10,
        ciPct: 80,
        bufferPct: 5,
      });
      const r = m.calculate(10000);
      expect(r.allocation.baseContext).toBeGreaterThanOrEqual(1000);
    });
  });

  describe("custom max limits", () => {
    it("respects custom maxCrossDomain", () => {
      const m = freshBm({
        baseContextPct: 50,
        crossDomainPct: 30,
        ciPct: 10,
        bufferPct: 10,
        maxCrossDomain: 2000,
      });
      const r = m.calculate(10000);
      expect(r.allocation.crossDomainSignals).toBeLessThanOrEqual(2000);
    });

    it("respects custom maxCI", () => {
      const m = freshBm({
        baseContextPct: 50,
        crossDomainPct: 10,
        ciPct: 30,
        bufferPct: 10,
        maxCI: 2000,
      });
      const r = m.calculate(10000);
      expect(r.allocation.ciSignals).toBeLessThanOrEqual(2000);
    });
  });
});
