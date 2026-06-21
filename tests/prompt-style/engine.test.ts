import { describe, it, expect } from "vitest";
import { PromptStyleEngine, resolveStyle } from "../../src/prompt-style/index.js";
import type { PromptStyle } from "../../src/prompt-style/types.js";

const items = [
  { content: "User is working on claw-ctx context engine", score: 0.9 },
  { content: "Previous session discussed token budget management", score: 0.7 },
  { content: "Deploy pipeline failed due to missing env var", score: 0.5 },
  { content: "Test coverage target is 85%", score: 0.3 },
  { content: "Security audit flagged session token storage", score: 0.1 },
];

describe("PromptStyleEngine", () => {
  // ── Style output tests ───────────────────────────────────────────

  it("applyStyle with descriptive", () => {
    const engine = new PromptStyleEngine();
    const result = engine.applyStyle(items, "descriptive");
    expect(result.block).toContain("[Context] Relevant information:");
    expect(result.block).toContain("- User is working on claw-ctx");
    expect(result.itemCount).toBe(5);
    expect(result.style).toBe("descriptive");
  });

  it("applyStyle with prescriptive", () => {
    const engine = new PromptStyleEngine();
    const result = engine.applyStyle(items, "prescriptive");
    expect(result.block).toContain("Use the following to answer:");
    expect(result.itemCount).toBe(5);
  });

  it("applyStyle with prohibitive", () => {
    const engine = new PromptStyleEngine();
    const result = engine.applyStyle(items, "prohibitive");
    expect(result.block).toContain("DO NOT use items tagged");
    expect(result.itemCount).toBe(5);
  });

  it("applyStyle with explanatory includes reasons", () => {
    const engine = new PromptStyleEngine();
    const result = engine.applyStyle(items, "explanatory");
    expect(result.block).toContain("Selected because:");
    // top 3 scored items should appear as reasons
    expect(result.block).toContain("claw-ctx context engine");
    expect(result.block).toContain("token budget management");
    expect(result.itemCount).toBe(5);
  });

  it("applyStyle with conditional includes conditions", () => {
    const engine = new PromptStyleEngine();
    const result = engine.applyStyle(items, "conditional");
    expect(result.block).toContain("If the request involves:");
    // "deploy" and "security" keywords should be extracted
    expect(result.block).toMatch(/deploy|security/);
    expect(result.itemCount).toBe(5);
  });

  // ── setStyle / getStyle ──────────────────────────────────────────

  it("setStyle and getStyle roundtrip", () => {
    const engine = new PromptStyleEngine();
    engine.setStyle("prescriptive");
    expect(engine.getStyle()).toBe("prescriptive");
    engine.setStyle("conditional");
    expect(engine.getStyle()).toBe("conditional");
  });

  it("applyStyle uses currentStyle when no explicit style given", () => {
    const engine = new PromptStyleEngine();
    engine.setStyle("conditional");
    const result = engine.applyStyle(items);
    expect(result.style).toBe("conditional");
    expect(result.block).toContain("If the request involves:");
  });

  // ── Edge cases ───────────────────────────────────────────────────

  it("empty items returns block with zero count", () => {
    const engine = new PromptStyleEngine();
    const result = engine.applyStyle([], "descriptive");
    expect(result.itemCount).toBe(0);
    expect(result.block).not.toContain("undefined");
    expect(result.block).not.toContain("null");
  });

  it("items with no scores get explanatory reasons fallback", () => {
    const engine = new PromptStyleEngine();
    const noscores = [
      { content: "item a" },
      { content: "item b" },
    ];
    const result = engine.applyStyle(noscores, "explanatory");
    expect(result.block).toContain("general relevance");
    expect(result.itemCount).toBe(2);
  });

  it("conditional with no keyword items falls back", () => {
    const engine = new PromptStyleEngine();
    const plain = [{ content: "hello world" }];
    const result = engine.applyStyle(plain, "conditional");
    expect(result.block).toContain("any of the above topics");
  });

  // ── Custom templates ─────────────────────────────────────────────

  it("custom template via constructor merges with defaults", () => {
    const engine = new PromptStyleEngine({
      descriptive: { template: "[CTX] Custom: {items}" },
    });
    const result = engine.applyStyle(items, "descriptive");
    expect(result.block).toContain("[CTX] Custom:");
    expect(result.block).not.toContain("Relevant information");

    // Other styles keep defaults
    const prescriptiveResult = engine.applyStyle(items, "prescriptive");
    expect(prescriptiveResult.block).toContain("Use the following to answer:");
  });

  // ── getConfig ────────────────────────────────────────────────────

  it("getConfig returns config for current or specified style", () => {
    const engine = new PromptStyleEngine();
    expect(engine.getConfig().type).toBe("descriptive");
    expect(engine.getConfig("prescriptive").type).toBe("prescriptive");
  });

  // ── Style output validity ────────────────────────────────────────

  it("all styles produce valid non-empty blocks", () => {
    const engine = new PromptStyleEngine();
    const styles: PromptStyle[] = [
      "descriptive", "prescriptive", "prohibitive", "explanatory", "conditional",
    ];
    for (const style of styles) {
      const result = engine.applyStyle(items, style);
      expect(result.block).toBeTruthy();
      expect(result.block).not.toContain("undefined");
      expect(result.block).not.toContain("null");
      expect(result.block).not.toContain("NaN");
    }
  });
});

// ── resolveStyle ───────────────────────────────────────────────────

describe("resolveStyle", () => {
  it("maps coding to prescriptive", () => {
    expect(resolveStyle("coding")).toBe("prescriptive");
  });

  it("maps debugging to conditional", () => {
    expect(resolveStyle("debugging")).toBe("conditional");
  });

  it("explicit style overrides task type mapping", () => {
    expect(resolveStyle("coding", "prohibitive")).toBe("prohibitive");
  });

  it("unknown task type falls back to descriptive", () => {
    expect(resolveStyle("unknown")).toBe("descriptive");
  });
});
