import { describe, it, expect, beforeEach } from "vitest";
import {
  GovernanceInjector,
  MockGovernanceProvider,
  type GovernanceSignal,
} from "../src/governance_injector";

describe("GovernanceInjector", () => {
  let injector: GovernanceInjector;
  let provider: MockGovernanceProvider;

  beforeEach(() => {
    provider = new MockGovernanceProvider();
    injector = new GovernanceInjector(provider);
  });

  it("returns empty when provider has no signals", async () => {
    const result = await injector.inject({
      sessionId: "s1",
    });
    expect(result.signals).toHaveLength(0);
    expect(result.injectedTokens).toBe(0);
  });

  it("injects governance signals", async () => {
    provider.addSignal({
      layer: "L1",
      type: "intent_check",
      result: "approved",
      reason: "Task aligns with safety policy",
      timestamp: new Date(),
    });

    const result = await injector.inject({
      sessionId: "s1",
    });
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].layer).toBe("L1");
    expect(result.signals[0].result).toBe("approved");
  });

  it("filters by governance layers", async () => {
    provider.addSignal({
      layer: "L1",
      type: "intent_nlp",
      result: "approved",
      timestamp: new Date(),
    });
    provider.addSignal({
      layer: "L3",
      type: "safety_check",
      result: "warning",
      reason: "Potential file deletion",
      timestamp: new Date(),
    });
    provider.addSignal({
      layer: "L6",
      type: "ethics_review",
      result: "approved",
      timestamp: new Date(),
    });

    const result = await injector.inject({
      sessionId: "s1",
      governanceLayers: ["L3", "L6"],
    });
    expect(result.signals).toHaveLength(2);
    const layers = result.signals.map((s) => s.layer);
    expect(layers).toContain("L3");
    expect(layers).toContain("L6");
    expect(layers).not.toContain("L1");
  });

  describe("formatForContext", () => {
    it("groups signals by layer", () => {
      const signals: GovernanceSignal[] = [
        {
          layer: "L1",
          type: "intent_check",
          result: "approved",
          timestamp: new Date(),
        },
        {
          layer: "L1",
          type: "intent_nlp",
          result: "warning",
          reason: "Ambiguous request",
          timestamp: new Date(),
        },
        {
          layer: "L3",
          type: "safety_boundary",
          result: "approved",
          timestamp: new Date(),
        },
      ];
      const text = injector.formatForContext(signals);
      expect(text).toContain("[L1]");
      expect(text).toContain("Intent Alignment");
      expect(text).toContain("[L3]");
      expect(text).toContain("Safety Boundaries");
      expect(text).toContain("🟢");
      expect(text).toContain("approved");
    });

    it("shows all result types", () => {
      const signals: GovernanceSignal[] = [
        { layer: "L2", type: "value_check", result: "approved", timestamp: new Date() },
        { layer: "L2", type: "value_constraint", result: "rejected", reason: "Violates policy", timestamp: new Date() },
        { layer: "L2", type: "value_boundary", result: "warning", reason: "Near limit", timestamp: new Date() },
      ];
      const text = injector.formatForContext(signals);
      expect(text).toContain("🟢");
      expect(text).toContain("🔴");
      expect(text).toContain("🟡");
      expect(text).toContain("Violates policy");
    });

    it("returns empty string for empty signals", () => {
      const text = injector.formatForContext([]);
      expect(text).toBe("");
    });
  });

  it("setProvider replaces provider at runtime", async () => {
    provider.addSignal({
      layer: "L1",
      type: "test",
      result: "approved",
      timestamp: new Date(),
    });

    const result1 = await injector.inject({ sessionId: "s1" });
    expect(result1.signals).toHaveLength(1);

    const newProvider = new MockGovernanceProvider();
    injector.setProvider(newProvider);

    const result2 = await injector.inject({ sessionId: "s1" });
    expect(result2.signals).toHaveLength(0);
  });

  it("default provider returns empty", async () => {
    const defaultInjector = new GovernanceInjector();
    const result = await defaultInjector.inject({ sessionId: "s1" });
    expect(result.signals).toHaveLength(0);
  });
});
