// claw-ctx v4.20.0 — AutoSessionController tests
import { describe, it, expect } from "vitest";
import { AutoSessionController, DEFAULT_AUTO_SESSION_CONFIG } from "../src/auto-session.js";

describe("AutoSessionController", () => {
  it("shouldSuggestNewSession returns false when drift below threshold", () => {
    const ctrl = new AutoSessionController({ driftThreshold: 0.9 });
    expect(ctrl.shouldSuggestNewSession(0.7)).toBe(false);
  });

  it("shouldSuggestNewSession returns true when drift above threshold", () => {
    const ctrl = new AutoSessionController({ driftThreshold: 0.9 });
    expect(ctrl.shouldSuggestNewSession(0.92)).toBe(true);
  });

  it("shouldSuggestNewSession respects cooldown", () => {
    const ctrl = new AutoSessionController({ suggestionCooldownMs: 10000 });
    expect(ctrl.shouldSuggestNewSession(0.95)).toBe(true);
    ctrl.generateSuggestion();
    // immediately after — should be false due to cooldown
    expect(ctrl.shouldSuggestNewSession(0.95)).toBe(false);
  });

  it("generateSuggestion returns non-empty string", () => {
    const ctrl = new AutoSessionController();
    const suggestion = ctrl.generateSuggestion();
    expect(suggestion.length).toBeGreaterThan(0);
    expect(suggestion).toContain("new session");
  });

  it("reset clears state", () => {
    const ctrl = new AutoSessionController();
    ctrl.generateSuggestion();
    ctrl.reset();
    const stats = ctrl.getStats();
    expect(stats.lastSuggestionAt).toBeNull();
    expect(stats.cooldownActive).toBe(false);
  });

  it("getStats returns correct cooldownActive", () => {
    const ctrl = new AutoSessionController({ suggestionCooldownMs: 999999 });
    ctrl.generateSuggestion();
    expect(ctrl.getStats().cooldownActive).toBe(true);
  });

  it("uses defaults when no config provided", () => {
    const ctrl = new AutoSessionController();
    expect(ctrl.config.driftThreshold).toBe(DEFAULT_AUTO_SESSION_CONFIG.driftThreshold);
    expect(ctrl.config.suggestionCooldownMs).toBe(DEFAULT_AUTO_SESSION_CONFIG.suggestionCooldownMs);
  });
});
