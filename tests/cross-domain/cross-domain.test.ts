import { describe, it, expect } from "vitest";
import { DomainClassifier } from "../../src/cross-domain/domain-classifier";
import { SignalAggregator } from "../../src/cross-domain/signal-aggregator";
import { CrossDomainFusion } from "../../src/cross-domain/fusion";

describe("DomainClassifier", () => {
  const c = new DomainClassifier();

  it("classifies claw-mem source as memory", () => {
    const r = c.classify({ id: "1", content: "test", source: "claw-mem", timestamp: 1 });
    expect(r.domain).toBe("memory");
    expect(r.confidence).toBe(0.9);
  });

  it("classifies policy source as governance", () => {
    const r = c.classify({ id: "2", content: "test", source: "gov_policy_check", timestamp: 1 });
    expect(r.domain).toBe("governance");
  });

  it("classifies pipeline source as ci", () => {
    const r = c.classify({ id: "3", content: "test", source: "ci_pipeline", timestamp: 1 });
    expect(r.domain).toBe("ci");
  });

  it("classifies session source as session", () => {
    const r = c.classify({ id: "4", content: "test", source: "conversation_001", timestamp: 1 });
    expect(r.domain).toBe("session");
  });

  it("falls back to unknown for unrecognized source", () => {
    const r = c.classify({ id: "5", content: "test", source: "random_thing", timestamp: 1 });
    expect(r.domain).toBe("unknown");
    expect(r.confidence).toBe(0.3);
  });
});

describe("SignalAggregator", () => {
  const signals = [
    { id: "1", content: "a", source: "claw-mem", timestamp: 1, domain: "memory" as const, confidence: 0.9 },
    { id: "2", content: "b", source: "gov_rule", timestamp: 1, domain: "governance" as const, confidence: 0.8 },
    { id: "3", content: "c", source: "ci_deploy", timestamp: 1, domain: "ci" as const, confidence: 0.7 },
  ];

  it("weighted strategy returns default weights", () => {
    const a = new SignalAggregator("weighted");
    const result = a.aggregate(signals);
    expect(result.weights.memory).toBe(0.3);
    expect(result.weights.governance).toBe(0.25);
  });

  it("priority strategy sorts governance first", () => {
    const a = new SignalAggregator("priority");
    const result = a.aggregate(signals);
    expect(result.signals[0]!.domain).toBe("governance");
  });

  it("adaptive strategy adjusts weights by confidence", () => {
    const a = new SignalAggregator("adaptive");
    const result = a.aggregate(signals);
    expect(result.weights.memory).toBeGreaterThan(0);
  });
});

describe("CrossDomainFusion", () => {
  it("fuses multiple signals", () => {
    const f = new CrossDomainFusion();
    const result = f.fuse([
      { id: "1", content: "security audit passed", source: "governance_check", timestamp: 1 },
      { id: "2", content: "deployment successful", source: "ci_deploy", timestamp: 1 },
    ]);
    expect(result.signals.length).toBe(2);
    expect(result.recommendations.length).toBe(1);
    expect(result.tokenCount).toBeGreaterThan(0);
  });

  it("generates memory+session recommendation", () => {
    const f = new CrossDomainFusion();
    const result = f.fuse([
      { id: "1", content: "remember this", source: "claw-mem", timestamp: 1 },
      { id: "2", content: "current session", source: "conversation", timestamp: 1 },
    ]);
    expect(result.recommendations.some((r) => r.includes("Memory + Session"))).toBe(true);
  });

  it("no recommendations for single domain", () => {
    const f = new CrossDomainFusion();
    const result = f.fuse([
      { id: "1", content: "test", source: "claw-mem", timestamp: 1 },
    ]);
    expect(result.recommendations.length).toBe(0);
  });
});
