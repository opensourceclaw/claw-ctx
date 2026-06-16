import { describe, it, expect } from "vitest";
import { SelfRefiner, DEFAULT_SELF_REFINER_CONFIG } from "../src/self_refiner";

describe("SelfRefiner", () => {
  const makeRefiner = (overrides?: Partial<typeof DEFAULT_SELF_REFINER_CONFIG>) =>
    new SelfRefiner(overrides);

  // ── evaluate ─────────────────────────────────────────────────────

  describe("evaluate", () => {
    it("returns low score for empty output", () => {
      const refiner = makeRefiner();
      const result = refiner.evaluate("");
      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
      expect(result.issues).toContain("Empty output");
    });

    it("returns high score for clean output", () => {
      const refiner = makeRefiner();
      const result = refiner.evaluate(
        "The authentication module provides secure login with OAuth2 support and JWT token validation for all API endpoints."
      );
      expect(result.score).toBeGreaterThanOrEqual(0.9);
      expect(result.passed).toBe(true);
    });

    it("detects low-confidence expressions", () => {
      const refiner = makeRefiner();
      const result = refiner.evaluate(
        "I think this might be correct. I believe the answer is 42. Perhaps we should check. I'm not sure though."
      );
      expect(result.issues.some(i => i.includes("low-confidence"))).toBe(true);
      expect(result.score).toBeLessThan(1);
    });

    it("detects error-related language", () => {
      const refiner = makeRefiner();
      const result = refiner.evaluate(
        "The function call resulted in an error and the file was not found."
      );
      expect(result.issues.some(i => i.includes("error"))).toBe(true);
    });

    it("detects incomplete output", () => {
      const refiner = makeRefiner();
      const result = refiner.evaluate("This implementation needs TODO: add tests...");
      expect(result.issues.some(i => i.includes("incomplete"))).toBe(true);
    });

    it("detects self-contradiction", () => {
      const refiner = makeRefiner();
      const result = refiner.evaluate(
        "The code works but does not actually compile correctly."
      );
      expect(result.issues.some(i => i.includes("contradiction"))).toBe(true);
    });

    it("flags very short output", () => {
      const refiner = makeRefiner();
      const result = refiner.evaluate("OK");
      expect(result.score).toBeLessThan(0.95);
      expect(result.issues.some(i => i.includes("short"))).toBe(true);
    });

    it("passes with custom low threshold", () => {
      const refiner = makeRefiner({ qualityThreshold: 0.3 });
      const result = refiner.evaluate("I think maybe this could work.");
      expect(result.passed).toBe(true); // low threshold
    });
  });

  // ── refine ───────────────────────────────────────────────────────

  describe("refine", () => {
    it("removes TODO markers", () => {
      const refiner = makeRefiner();
      const result = refiner.refine(
        "The API is ready. TODO: add rate limiting.",
        "Output is incomplete"
      );
      expect(result).not.toContain("TODO");
    });

    it("returns original when no improvements needed", () => {
      const refiner = makeRefiner();
      const result = refiner.refine(
        "The deployment was successful.",
        "All good"
      );
      expect(result).toContain("[Refined based on: All good]");
    });
  });

  // ── run ──────────────────────────────────────────────────────────

  describe("run", () => {
    it("accepts high-quality output immediately", () => {
      const refiner = makeRefiner();
      const result = refiner.run(
        "The database migration completed successfully with all tables verified and indexes properly configured."
      );
      expect(result.accepted).toBe(true);
      expect(result.loops).toBe(0);
    });

    it("refines low-quality output", () => {
      const refiner = makeRefiner();
      const result = refiner.run(
        "I think maybe the code works but there was an error perhaps. TODO: fix things..."
      );
      expect(result.refinedOutput).toBeTruthy();
      expect(result.evaluationScore).toBeGreaterThanOrEqual(0);
    });

    it("respects maxRetries", () => {
      const refiner = makeRefiner({ maxRetries: 2, qualityThreshold: 0.95, triggerOn: ["always"] });
      const result = refiner.run(
        "I think this might possibly work. Not sure though."
      );
      expect(result.loops).toBeLessThanOrEqual(2);
    });

    it("does not refine when no trigger conditions met", () => {
      const refiner = makeRefiner({ triggerOn: ["error-detected"] });
      const result = refiner.run(
        "I think this is probably the right approach."
      );
      expect(result.loops).toBe(0); // no refinement triggered
    });

    it("always triggers when 'always' is configured", () => {
      const refiner = makeRefiner({ triggerOn: ["always"], qualityThreshold: 1.0 });
      const result = refiner.run("A short response.");
      expect(result.loops).toBeGreaterThan(0);
    });
  });

  // ── config ───────────────────────────────────────────────────────

  describe("config", () => {
    it("uses defaults when no config provided", () => {
      const refiner = new SelfRefiner();
      expect(refiner.config.maxRetries).toBe(3);
      expect(refiner.config.qualityThreshold).toBe(0.7);
      expect(refiner.config.triggerOn).toEqual(["low-confidence", "error-detected"]);
    });

    it("merges partial config with defaults", () => {
      const refiner = new SelfRefiner({ maxRetries: 5 });
      expect(refiner.config.maxRetries).toBe(5);
      expect(refiner.config.qualityThreshold).toBe(0.7); // default
    });
  });
});
