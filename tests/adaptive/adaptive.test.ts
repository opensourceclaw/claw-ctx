import { describe, it, expect } from "vitest";
import { TaskTypeDetector } from "../../src/adaptive/task-type-detector";
import { selectStrategy, adjustParameters } from "../../src/adaptive/injection-strategy";
import { AdaptiveInjector } from "../../src/adaptive/adaptive-injector";

describe("TaskTypeDetector", () => {
  const d = new TaskTypeDetector();

  it("detects coding from implement", () => {
    expect(d.detect("implement a new login feature").type).toBe("coding");
  });
  it("detects debugging from fix bug", () => {
    expect(d.detect("fix bug in auth module").type).toBe("debugging");
  });
  it("detects review from review PR", () => {
    expect(d.detect("review this PR for security").type).toBe("review");
  });
  it("detects planning from design", () => {
    expect(d.detect("design the new architecture").type).toBe("planning");
  });
  it("detects question from what is", () => {
    expect(d.detect("what is the best approach").type).toBe("question");
  });
  it("falls back to unknown for empty input", () => {
    expect(d.detect("").type).toBe("unknown");
  });
});

describe("InjectionStrategy", () => {
  it("coding uses aggressive strategy", () => {
    const s = selectStrategy("coding");
    expect(s.mode).toBe("aggressive");
    expect(s.maxTokens).toBe(4000);
  });
  it("question uses minimal strategy", () => {
    const s = selectStrategy("question");
    expect(s.mode).toBe("minimal");
    expect(s.maxTokens).toBe(1500);
  });
  it("adjustParameters respects budget cap", () => {
    const s = selectStrategy("coding");
    const a = adjustParameters(s, { budget: 1000 });
    expect(a.maxTokens).toBe(1000);
  });
  it("adjustParameters boosts for urgency", () => {
    const s = selectStrategy("coding");
    const a = adjustParameters(s, { urgency: "high" });
    expect(a.maxTokens).toBeGreaterThan(4000);
  });
});

describe("AdaptiveInjector", () => {
  it("injects with correct task type", async () => {
    const ai = new AdaptiveInjector();
    const result = await ai.inject("implement login feature");
    expect(result.taskType).toBe("coding");
    expect(result.strategy.mode).toBe("aggressive");
    expect(result.confidence).toBeGreaterThan(0);
  });
  it("applies budget constraint", async () => {
    const ai = new AdaptiveInjector();
    const result = await ai.inject("fix bug in auth", { budget: 500 });
    expect(result.adjustedMaxTokens).toBe(500);
  });
});
