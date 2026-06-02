import { describe, it, expect, beforeEach } from "vitest";
import {
  RLInjector,
  MockRLProvider,
  type RLExperience,
} from "../src/rl_injector";

describe("RLInjector", () => {
  let injector: RLInjector;
  let provider: MockRLProvider;

  beforeEach(() => {
    provider = new MockRLProvider();
    injector = new RLInjector(provider);
  });

  it("returns empty when provider has no experiences", async () => {
    const result = await injector.inject({
      sessionId: "s1",
    });
    expect(result.experiences).toHaveLength(0);
    expect(result.injectedTokens).toBe(0);
  });

  it("injects experiences from provider", async () => {
    const exp: RLExperience = {
      id: "rl-001",
      taskType: "code-review",
      outcome: "success",
      pattern: "Always check for null before accessing properties",
      confidence: 0.85,
      learnedAt: new Date(),
    };
    provider.addExperience(exp);

    const result = await injector.inject({
      sessionId: "s1",
      taskType: "code-review",
    });
    expect(result.experiences).toHaveLength(1);
    expect(result.experiences[0].taskType).toBe("code-review");
    expect(result.injectedTokens).toBeGreaterThan(0);
  });

  it("filters by taskType", async () => {
    provider.addExperience({
      id: "rl-001",
      taskType: "code-review",
      outcome: "success",
      pattern: "pattern A",
      confidence: 0.8,
      learnedAt: new Date(),
    });
    provider.addExperience({
      id: "rl-002",
      taskType: "refactoring",
      outcome: "failure",
      pattern: "pattern B",
      confidence: 0.6,
      learnedAt: new Date(),
    });

    const result = await injector.inject({
      sessionId: "s1",
      taskType: "refactoring",
    });
    expect(result.experiences).toHaveLength(1);
    expect(result.experiences[0].taskType).toBe("refactoring");
  });

  it("respects topK limit", async () => {
    for (let i = 0; i < 10; i++) {
      provider.addExperience({
        id: `rl-${i}`,
        taskType: "test",
        outcome: "success",
        pattern: `pattern ${i}`,
        confidence: 0.5,
        learnedAt: new Date(),
      });
    }

    const result = await injector.inject({
      sessionId: "s1",
      taskType: "test",
      topK: 3,
    });
    expect(result.experiences.length).toBeLessThanOrEqual(3);
  });

  describe("formatForContext", () => {
    it("formats success experiences", () => {
      const exps: RLExperience[] = [
        {
          id: "rl-001",
          taskType: "debugging",
          outcome: "success",
          pattern: "Check error logs first",
          confidence: 0.9,
          learnedAt: new Date(),
        },
      ];
      const text = injector.formatForContext(exps);
      expect(text).toContain("✅");
      expect(text).toContain("Learned (success)");
      expect(text).toContain("Check error logs first");
      expect(text).toContain("90%");
    });

    it("formats failure experiences", () => {
      const exps: RLExperience[] = [
        {
          id: "rl-001",
          taskType: "deployment",
          outcome: "failure",
          pattern: "Don't deploy on Friday",
          confidence: 0.7,
          learnedAt: new Date(),
        },
      ];
      const text = injector.formatForContext(exps);
      expect(text).toContain("❌");
      expect(text).toContain("Caution (failure)");
      expect(text).toContain("Don't deploy on Friday");
    });

    it("returns empty string for empty list", () => {
      const text = injector.formatForContext([]);
      expect(text).toBe("");
    });
  });

  it("setProvider replaces provider at runtime", async () => {
    const exp: RLExperience = {
      id: "rl-001",
      taskType: "test",
      outcome: "success",
      pattern: "old pattern",
      confidence: 0.5,
      learnedAt: new Date(),
    };
    provider.addExperience(exp);

    const result1 = await injector.inject({ sessionId: "s1" });
    expect(result1.experiences).toHaveLength(1);

    const newProvider = new MockRLProvider();
    injector.setProvider(newProvider);

    const result2 = await injector.inject({ sessionId: "s1" });
    expect(result2.experiences).toHaveLength(0);
  });

  it("default provider returns empty", async () => {
    const defaultInjector = new RLInjector();
    const result = await defaultInjector.inject({ sessionId: "s1" });
    expect(result.experiences).toHaveLength(0);
  });
});
