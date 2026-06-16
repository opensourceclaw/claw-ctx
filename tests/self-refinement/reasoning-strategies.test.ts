/**
 * Tests for reasoning strategies (CoT / ToT / GoT).
 */
import { describe, it, expect } from "vitest";
import { ChainOfThoughtStrategy } from "../../src/self-refinement/reasoning-strategies/chain-of-thought.js";
import { TreeOfThoughtsStrategy } from "../../src/self-refinement/reasoning-strategies/tree-of-thoughts.js";
import { GraphOfThoughtsStrategy } from "../../src/self-refinement/reasoning-strategies/graph-of-thoughts.js";
import type { ReasoningStrategy } from "../../src/self-refinement/reasoning-strategies/base.js";

describe("ChainOfThoughtStrategy", () => {
  const s = new ChainOfThoughtStrategy();

  it("has correct name", () => {
    expect(s.name).toBe("chain-of-thought");
  });

  it("apply adds step-by-step prompt", () => {
    const result = s.apply("Write a function");
    expect(result).toContain("Write a function");
    expect(result).toContain("step by step");
  });

  it("getSystemPromptAddition returns correct string", () => {
    const add = s.getSystemPromptAddition();
    expect(add).toContain("chain-of-thought");
    expect(add).toContain("step by step");
  });
});

describe("TreeOfThoughtsStrategy", () => {
  const s = new TreeOfThoughtsStrategy();

  it("has correct name", () => {
    expect(s.name).toBe("tree-of-thoughts");
  });

  it("apply adds exploration prompt", () => {
    const result = s.apply("Design a system");
    expect(result).toContain("Design a system");
    expect(result).toContain("multiple solution paths");
  });

  it("getSystemPromptAddition returns correct string", () => {
    const add = s.getSystemPromptAddition();
    expect(add).toContain("tree-of-thoughts");
    expect(add).toContain("multiple solution paths");
  });
});

describe("GraphOfThoughtsStrategy", () => {
  const s = new GraphOfThoughtsStrategy();

  it("has correct name", () => {
    expect(s.name).toBe("graph-of-thoughts");
  });

  it("apply adds network prompt", () => {
    const result = s.apply("Architecture plan");
    expect(result).toContain("Architecture plan");
    expect(result).toContain("network of ideas");
  });

  it("getSystemPromptAddition returns correct string", () => {
    const add = s.getSystemPromptAddition();
    expect(add).toContain("graph-of-thoughts");
    expect(add).toContain("network of ideas");
  });
});

describe("ReasoningStrategy interface", () => {
  it("all strategies implement the interface", () => {
    const strategies: ReasoningStrategy[] = [
      new ChainOfThoughtStrategy(),
      new TreeOfThoughtsStrategy(),
      new GraphOfThoughtsStrategy(),
    ];

    for (const s of strategies) {
      expect(s.name).toBeDefined();
      expect(typeof s.apply).toBe("function");
      expect(typeof s.getSystemPromptAddition).toBe("function");
    }
  });

  it("apply with enableNShot adds n-shot hint", () => {
    const s = new ChainOfThoughtStrategy();
    const result = s.apply("Test", { enableNShot: 3 });
    expect(result).toContain("3 examples");
  });

  it("apply with empty prompt returns non-empty", () => {
    const s = new ChainOfThoughtStrategy();
    const result = s.apply("");
    expect(result.length).toBeGreaterThan(0);
  });
});
