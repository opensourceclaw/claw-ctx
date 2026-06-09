/**
 * claw-ctx v4.19.0 — Edge case tests for stability improvements.
 */
import { describe, it, expect } from "vitest";
import { SelfRefiner } from "../src/self_refiner";
import { PromptStrategyController } from "../src/prompt_strategy_controller";
import { PositionOptimizer } from "../src/position_optimizer";
import { StructuredContextHandler } from "../src/structured_context_handler";
import { MultimodalContextHandler } from "../src/multimodal_context_handler";

// ── Edge cases across all modules ────────────────────────────────────

describe("SelfRefiner edge cases", () => {
  it("handles null input gracefully", () => {
    const refiner = new SelfRefiner();
    const result = refiner.evaluate(null as unknown as string);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it("handles very long output without exceptions", () => {
    const refiner = new SelfRefiner();
    const longText = "x".repeat(100000);
    const result = refiner.evaluate(longText);
    expect(result.score).toBeDefined();
  });

  it("converges on identical content", () => {
    const refiner = new SelfRefiner({ triggerOn: ["always"], maxRetries: 3 });
    const result = refiner.run("A simple correct answer.");
    expect(result.loops).toBeLessThanOrEqual(3);
  });
});

describe("PromptStrategyController edge cases", () => {
  it("handles empty task content", () => {
    const ctrl = new PromptStrategyController();
    const taskType = ctrl.detectTaskType("");
    expect(taskType).toBe("quick-answer");
  });

  it("handles null context gracefully", () => {
    const ctrl = new PromptStrategyController();
    const strategy = ctrl.selectStrategy({
      taskType: "",
      content: "fix the bug",
    });
    expect(strategy).toBeDefined();
  });

  it("handles all strategy types in apply", () => {
    const ctrl = new PromptStrategyController();
    const strategies = ["direct", "chain-of-thought", "tree-of-thoughts", "graph-of-thoughts", "self-consistency"] as const;
    for (const s of strategies) {
      const result = ctrl.applyStrategy("test", s);
      expect(typeof result).toBe("string");
    }
  });
});

describe("PositionOptimizer edge cases", () => {
  it("handles empty messages", () => {
    const opt = new PositionOptimizer();
    expect(opt.optimize([])).toHaveLength(0);
  });

  it("compresses single message to budget 1", () => {
    const opt = new PositionOptimizer();
    const msgs = Array.from({ length: 50 }, (_, i) => ({
      role: "user",
      content: `message ${i}`,
    }));
    const result = opt.slidingWindowCompress(msgs, 1);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("StructuredContextHandler edge cases", () => {
  it("handles invalid JSON gracefully", () => {
    const handler = new StructuredContextHandler();
    expect(handler.detect("{invalid json")).toBeNull();
  });

  it("handles empty CSV lines", () => {
    const handler = new StructuredContextHandler();
    const result = handler.verbalize("\n\n");
    expect(typeof result).toBe("string");
  });

  it("handles null in tableToMarkdown", () => {
    const handler = new StructuredContextHandler();
    expect(handler.tableToMarkdown(null as unknown as Record<string, unknown>[])).toBe("");
  });
});

describe("MultimodalContextHandler edge cases", () => {
  it("handles empty message content", () => {
    const handler = new MultimodalContextHandler();
    const result = handler.extractMultimodalContent({ role: "user", content: "" });
    expect(result).toHaveLength(0);
  });

  it("handles null url in modalityToText", () => {
    const handler = new MultimodalContextHandler();
    const result = handler.modalityToText({ type: "video" });
    expect(result).toContain("[Video");
  });

  it("handles large token array compression", () => {
    const handler = new MultimodalContextHandler();
    const tokens = Array.from({ length: 10000 }, (_, i) => i);
    const result = handler.compressVisualTokens(tokens, 0.1);
    expect(result.length).toBeLessThan(tokens.length);
  });
});
