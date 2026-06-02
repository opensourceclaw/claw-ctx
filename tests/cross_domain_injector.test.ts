import { describe, it, expect, beforeEach } from "vitest";
import {
  CrossDomainInjector,
  MockCrossDomainProvider,
  type InjectedSignal,
} from "../src/cross_domain_injector";

function makeSignal(overrides: Partial<InjectedSignal> = {}): InjectedSignal {
  return {
    sourcePillar: overrides.sourcePillar ?? "stark",
    sourceAgent: overrides.sourceAgent ?? "stark-agent",
    summary: overrides.summary ?? "Fixed Django N+1 query issue",
    correlation: overrides.correlation ?? 0.85,
    suggestion: overrides.suggestion ?? "User may be experiencing technical challenges",
    timestamp: overrides.timestamp ?? new Date(),
    tokenCount: overrides.tokenCount ?? 0,
  };
}

describe("CrossDomainInjector", () => {
  let injector: CrossDomainInjector;
  let provider: MockCrossDomainProvider;

  beforeEach(() => {
    provider = new MockCrossDomainProvider();
    injector = new CrossDomainInjector(provider);
  });

  it("returns empty when provider has no signals", async () => {
    const result = await injector.inject({
      sessionId: "s1",
      currentPillar: "pepper",
      currentIntent: "chat",
    });
    expect(result.signals).toHaveLength(0);
    expect(result.totalTokens).toBe(0);
  });

  it("injects signals from other pillars", async () => {
    provider.addSignal(
      makeSignal({ sourcePillar: "stark", sourceAgent: "stark-agent" })
    );

    const result = await injector.inject({
      sessionId: "s1",
      currentPillar: "pepper",
      currentIntent: "chat",
    });
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].sourcePillar).toBe("stark");
  });

  it("filters out signals from the same pillar", async () => {
    provider.addSignal(
      makeSignal({ sourcePillar: "stark", sourceAgent: "stark-agent" })
    );
    provider.addSignal(
      makeSignal({ sourcePillar: "pepper", sourceAgent: "pepper-agent" })
    );

    const result = await injector.inject({
      sessionId: "s1",
      currentPillar: "pepper",
      currentIntent: "wellness",
    });
    // Should only include stark signal, not pepper
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].sourcePillar).toBe("stark");
  });

  it("filters by time range", async () => {
    const recentSignal = makeSignal({
      sourcePillar: "stark",
      timestamp: new Date(),
    });
    const oldSignal = makeSignal({
      sourcePillar: "jarvis",
      timestamp: new Date(Date.now() - 48 * 3600 * 1000), // 2 days ago
    });
    provider.addSignal(recentSignal);
    provider.addSignal(oldSignal);

    const result = await injector.inject({
      sessionId: "s1",
      currentPillar: "pepper",
      currentIntent: "chat",
      timeRange: "6h",
    });
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].sourcePillar).toBe("stark");
  });

  it("sorts by correlation descending", async () => {
    provider.addSignal(makeSignal({ sourcePillar: "a", correlation: 0.5 }));
    provider.addSignal(makeSignal({ sourcePillar: "b", correlation: 0.9 }));
    provider.addSignal(makeSignal({ sourcePillar: "c", correlation: 0.7 }));

    const result = await injector.inject({
      sessionId: "s1",
      currentPillar: "pepper",
      currentIntent: "chat",
    });
    expect(result.signals[0].correlation).toBe(0.9);
    expect(result.signals[1].correlation).toBe(0.7);
    expect(result.signals[2].correlation).toBe(0.5);
  });

  it("respects maxSignals limit", async () => {
    for (let i = 0; i < 10; i++) {
      provider.addSignal(
        makeSignal({ sourcePillar: `pillar-${i}`, correlation: 0.5 + i * 0.05 })
      );
    }

    const result = await injector.inject({
      sessionId: "s1",
      currentPillar: "pepper",
      currentIntent: "chat",
      maxSignals: 2,
    });
    expect(result.signals.length).toBeLessThanOrEqual(2);
  });

  it("calculates token counts", async () => {
    provider.addSignal(
      makeSignal({
        sourcePillar: "stark",
        summary: "A sufficiently long summary to consume tokens",
        suggestion: "A meaningful suggestion for the context",
      })
    );

    const result = await injector.inject({
      sessionId: "s1",
      currentPillar: "pepper",
      currentIntent: "chat",
    });
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(result.signals[0].tokenCount).toBeGreaterThan(0);
  });

  describe("formatForContext", () => {
    it("formats signals with pillar and agent info", () => {
      const signals = [
        makeSignal({
          sourcePillar: "stark",
          sourceAgent: "stark-dev",
          summary: "Fixed N+1 queries",
          suggestion: "Performance may be improved",
          correlation: 0.85,
        }),
      ];

      const text = injector.formatForContext(signals);
      expect(text).toContain("[Cross-Domain Signals]");
      expect(text).toContain("[stark]");
      expect(text).toContain("stark-dev");
      expect(text).toContain("Fixed N+1 queries");
      expect(text).toContain("Performance may be improved");
      expect(text).toContain("85%");
    });

    it("handles multiple signals from different pillars", () => {
      const signals = [
        makeSignal({ sourcePillar: "stark", sourceAgent: "s1", correlation: 0.9 }),
        makeSignal({ sourcePillar: "jarvis", sourceAgent: "j1", correlation: 0.6 }),
      ];

      const text = injector.formatForContext(signals);
      expect(text).toContain("[stark]");
      expect(text).toContain("[jarvis]");
    });

    it("returns empty string for empty list", () => {
      expect(injector.formatForContext([])).toBe("");
    });
  });

  it("setProvider replaces provider at runtime", async () => {
    provider.addSignal(makeSignal({ sourcePillar: "stark" }));
    const r1 = await injector.inject({
      sessionId: "s1", currentPillar: "pepper", currentIntent: "chat",
    });
    expect(r1.signals).toHaveLength(1);

    injector.setProvider(new MockCrossDomainProvider());
    const r2 = await injector.inject({
      sessionId: "s1", currentPillar: "pepper", currentIntent: "chat",
    });
    expect(r2.signals).toHaveLength(0);
  });

  it("default provider returns empty", async () => {
    const defaultInjector = new CrossDomainInjector();
    const result = await defaultInjector.inject({
      sessionId: "s1",
      currentPillar: "pepper",
      currentIntent: "chat",
    });
    expect(result.signals).toHaveLength(0);
  });
});
