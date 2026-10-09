/**
 * claw-ctx v6.13.0 — P1 stage-progress trigger unit tests (design §6.1)
 */
import { describe, it, expect } from "vitest";
import {
  StageProgressTrigger,
  DEFAULT_STAGE_TRIGGER_CONFIG,
} from "../../src/stage-progress-trigger.js";

const ON = { enabled: true, boundaryBonus: 0.10, minTokens: 50000 };

describe("StageProgressTrigger", () => {
  it("default config is disabled with conservative constants", () => {
    expect(DEFAULT_STAGE_TRIGGER_CONFIG.enabled).toBe(false);
    expect(DEFAULT_STAGE_TRIGGER_CONFIG.boundaryBonus).toBe(0.10);
    expect(DEFAULT_STAGE_TRIGGER_CONFIG.minTokens).toBe(50000);
  });

  it("disabled ⇒ adjustThreshold always returns base (noteStage no-op)", () => {
    const t = new StageProgressTrigger(); // default disabled
    t.noteStage("s", "A");
    t.noteStage("s", "B");
    expect(t.adjustThreshold("s", 1000, 999999)).toBe(1000);
  });

  it("first observation is NOT a boundary", () => {
    const t = new StageProgressTrigger(ON);
    t.noteStage("s", "A");
    expect(t.adjustThreshold("s", 1000, 100000)).toBe(1000);
  });

  it("non-empty change is a boundary and discounts when tokens ≥ floor", () => {
    const t = new StageProgressTrigger(ON);
    t.noteStage("s", "A");
    t.noteStage("s", "B");
    expect(t.adjustThreshold("s", 1000, 100000)).toBe(900);
  });

  it("empty / undefined stage does not participate (never guessed)", () => {
    const t = new StageProgressTrigger(ON);
    t.noteStage("s", "A");
    t.noteStage("s", "");
    t.noteStage("s", undefined);
    expect(t.adjustThreshold("s", 1000, 100000)).toBe(1000);
  });

  it("returning to a previous value still counts as a change", () => {
    const t = new StageProgressTrigger(ON);
    t.noteStage("s", "A");
    t.noteStage("s", "B");
    expect(t.adjustThreshold("s", 1000, 100000)).toBe(900); // consume A→B
    t.noteStage("s", "A"); // B→A is a change
    expect(t.adjustThreshold("s", 1000, 100000)).toBe(900);
  });

  it("boundary below the floor ⇒ base (no discount)", () => {
    const t = new StageProgressTrigger(ON);
    t.noteStage("s", "A");
    t.noteStage("s", "B");
    expect(t.adjustThreshold("s", 1000, 49999)).toBe(1000);
  });

  it("PINNED same-turn expiry: T below floor ⇒ T+1 (stage unchanged, tokens clear) still base", () => {
    const t = new StageProgressTrigger(ON);
    t.noteStage("s", "A");
    t.noteStage("s", "B");
    // T: boundary pending but below floor → base; boundary is consumed regardless
    expect(t.adjustThreshold("s", 1000, 100)).toBe(1000);
    // T+1: stage unchanged, tokens now ≥ floor → still base (no mid-stage discount)
    expect(t.adjustThreshold("s", 1000, 100000)).toBe(1000);
  });

  it("boundary is one-shot even when consumed by a discount", () => {
    const t = new StageProgressTrigger(ON);
    t.noteStage("s", "A");
    t.noteStage("s", "B");
    expect(t.adjustThreshold("s", 1000, 100000)).toBe(900);
    expect(t.adjustThreshold("s", 1000, 100000)).toBe(1000); // already consumed
  });

  it("per-session isolation", () => {
    const t = new StageProgressTrigger(ON);
    t.noteStage("s1", "A");
    t.noteStage("s1", "B");
    expect(t.adjustThreshold("s1", 1000, 100000)).toBe(900);
    expect(t.adjustThreshold("s2", 1000, 100000)).toBe(1000);
  });

  it("resetSession clears state", () => {
    const t = new StageProgressTrigger(ON);
    t.noteStage("s", "A");
    t.noteStage("s", "B");
    t.resetSession("s");
    expect(t.adjustThreshold("s", 1000, 100000)).toBe(1000);
  });
});
