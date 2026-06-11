// claw-ctx v4.20.0 — AutoCompactController tests
import { describe, it, expect } from "vitest";
import { AutoCompactController, DEFAULT_AUTO_COMPACT_CONFIG } from "../src/auto-compact.js";

describe("AutoCompactController", () => {
  it("shouldCompact returns false when drift below threshold", () => {
    const ctrl = new AutoCompactController({ driftThreshold: 0.7 });
    expect(ctrl.shouldCompact(0.5)).toBe(false);
  });

  it("shouldCompact returns true when drift above threshold", () => {
    const ctrl = new AutoCompactController({ driftThreshold: 0.7 });
    expect(ctrl.shouldCompact(0.75)).toBe(true);
  });

  it("shouldCompact returns false after maxCompactsPerSession reached", () => {
    const ctrl = new AutoCompactController({ maxCompactsPerSession: 2, cooldownMs: 0 });
    expect(ctrl.shouldCompact(0.8)).toBe(true);
    ctrl.recordCompact();
    expect(ctrl.shouldCompact(0.8)).toBe(true);
    ctrl.recordCompact();
    expect(ctrl.shouldCompact(0.8)).toBe(false);
  });

  it("shouldCompact respects cooldown", () => {
    const ctrl = new AutoCompactController({ cooldownMs: 1000 });
    expect(ctrl.shouldCompact(0.8)).toBe(true);
    ctrl.recordCompact();
    // immediately after — should be false due to cooldown
    expect(ctrl.shouldCompact(0.8)).toBe(false);
  });

  it("reset clears all state", () => {
    const ctrl = new AutoCompactController();
    ctrl.shouldCompact(0.8);
    ctrl.recordCompact();
    ctrl.reset();
    const stats = ctrl.getStats();
    expect(stats.compactCount).toBe(0);
    expect(stats.lastCompactAt).toBeNull();
  });

  it("getStats returns correct cooldownActive", () => {
    const ctrl = new AutoCompactController({ cooldownMs: 999999 });
    ctrl.shouldCompact(0.8);
    ctrl.recordCompact();
    expect(ctrl.getStats().cooldownActive).toBe(true);
  });

  it("uses defaults when no config provided", () => {
    const ctrl = new AutoCompactController();
    expect(ctrl.config.driftThreshold).toBe(DEFAULT_AUTO_COMPACT_CONFIG.driftThreshold);
    expect(ctrl.config.cooldownMs).toBe(DEFAULT_AUTO_COMPACT_CONFIG.cooldownMs);
    expect(ctrl.config.maxCompactsPerSession).toBe(DEFAULT_AUTO_COMPACT_CONFIG.maxCompactsPerSession);
  });
});
