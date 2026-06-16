/**
 * Tests for QualityEvaluator — 4-dimensional output quality evaluation.
 */
import { describe, it, expect } from "vitest";
import { QualityEvaluator } from "../../src/self-refinement/quality-evaluator.js";

describe("QualityEvaluator", () => {
  const makeEvaluator = (overrides?: Record<string, number>) =>
    new QualityEvaluator(overrides);

  it("returns low score for empty output", () => {
    const e = makeEvaluator();
    const r = e.evaluate("");
    expect(r.overallScore).toBe(0);
    expect(r.passed).toBe(false);
    expect(r.issues).toContain("Empty output");
  });

  it("returns high score for clean output", () => {
    const e = makeEvaluator();
    const r = e.evaluate(
      "The system processes requests asynchronously using a message queue. " +
      "Each worker picks up tasks and executes them independently."
    );
    expect(r.overallScore).toBeGreaterThanOrEqual(0.7);
    expect(r.passed).toBe(true);
  });

  it("detects incomplete markers in completeness dimension", () => {
    const e = makeEvaluator();
    const r = e.evaluate("TODO: implement the function and FIXME: fix the bug");
    const comp = r.dimensions.find(d => d.name === "completeness");
    expect(comp).toBeDefined();
    expect(comp!.score).toBeLessThan(1);
    expect(comp!.issues.length).toBeGreaterThan(0);
  });

  it("detects short output", () => {
    const e = makeEvaluator();
    const r = e.evaluate("short");
    expect(r.overallScore).toBeLessThan(0.95);
    const comp = r.dimensions.find(d => d.name === "completeness");
    expect(comp).toBeDefined();
    expect(comp!.score).toBeLessThan(0.8);
  });

  it("detects truncation (no sentence ending)", () => {
    const e = makeEvaluator();
    const r = e.evaluate("The result is that the system should");
    expect(r.overallScore).toBeLessThan(1);
  });

  it("detects error-related language in accuracy dimension", () => {
    const e = makeEvaluator();
    const r = e.evaluate("The application crashed with an error and failed to start");
    const acc = r.dimensions.find(d => d.name === "accuracy");
    expect(acc).toBeDefined();
    expect(acc!.score).toBeLessThan(1);
  });

  it("detects low-confidence expressions", () => {
    const e = makeEvaluator();
    const r = e.evaluate("I think this might work, perhaps we can try it. I believe it's probably correct. Maybe we should test it.");
    const acc = r.dimensions.find(d => d.name === "accuracy");
    expect(acc).toBeDefined();
    expect(acc!.score).toBeLessThan(1);
  });

  it("detects self-contradiction in consistency dimension", () => {
    const e = makeEvaluator();
    const r = e.evaluate("The API is fast but it is not reliable. However it is not production-ready.");
    const con = r.dimensions.find(d => d.name === "consistency");
    expect(con).toBeDefined();
    expect(con!.score).toBeLessThan(1);
  });

  it("detects stance reversal", () => {
    const e = makeEvaluator();
    const r = e.evaluate("On the one hand we should use REST. On the other hand we should use GraphQL.");
    const con = r.dimensions.find(d => d.name === "consistency");
    expect(con).toBeDefined();
    expect(con!.score).toBeLessThan(1);
  });

  it("flags excessively long output in readability dimension", () => {
    const e = makeEvaluator();
    const long = "x".repeat(60000);
    const r = e.evaluate(long);
    const read = r.dimensions.find(d => d.name === "readability");
    expect(read).toBeDefined();
    expect(read!.score).toBeLessThan(1);
  });

  it("detects missing paragraph structure", () => {
    const e = makeEvaluator();
    const noParagraphs = "Word ".repeat(300);
    const r = e.evaluate(noParagraphs);
    const read = r.dimensions.find(d => d.name === "readability");
    expect(read).toBeDefined();
    expect(read!.issues.length).toBeGreaterThan(0);
  });

  it("respects custom quality threshold", () => {
    const e = makeEvaluator({ qualityThreshold: 0.3 });
    const r = e.evaluate("A short but complete and accurate response.");
    expect(r.passed).toBe(true);
  });

  it("returns correct dimension breakdown", () => {
    const e = makeEvaluator();
    const r = e.evaluate("Complete and accurate response with no issues.");
    expect(r.dimensions).toHaveLength(4);
    expect(r.dimensions.map(d => d.name).sort()).toEqual([
      "accuracy", "completeness", "consistency", "readability",
    ]);
  });

  it("detects unclosed code fence", () => {
    const e = makeEvaluator();
    const r = e.evaluate("Here is the code:\n```\nconst x = 1;\n```\nAnd more:\n```\nconst y = 2;");
    const read = r.dimensions.find(d => d.name === "readability");
    expect(read).toBeDefined();
    expect(read!.issues.length).toBeGreaterThan(0);
  });

  it("detects undefined/null references", () => {
    const e = makeEvaluator();
    const r = e.evaluate("The value was undefined because the result was null");
    const acc = r.dimensions.find(d => d.name === "accuracy");
    expect(acc).toBeDefined();
    expect(acc!.score).toBeLessThan(1);
  });
});
