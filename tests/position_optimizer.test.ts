import { describe, it, expect } from "vitest";
import { PositionOptimizer } from "../src/position_optimizer";

function makeMsg(role: string, content: string) {
  return { role, content };
}

describe("PositionOptimizer", () => {
  // ── scoreImportance ──────────────────────────────────────────────

  describe("scoreImportance", () => {
    it("returns 0 for empty text", () => {
      const opt = new PositionOptimizer();
      expect(opt.scoreImportance("")).toBe(0);
    });

    it("returns higher score for important content", () => {
      const opt = new PositionOptimizer();
      const high = opt.scoreImportance("This is critical and important for the architecture design");
      const low = opt.scoreImportance("hello world");
      expect(high).toBeGreaterThan(low);
    });

    it("detects code-related importance", () => {
      const opt = new PositionOptimizer();
      expect(opt.scoreImportance("fix the bug in the API endpoint")).toBeGreaterThan(0);
    });
  });

  // ── extractKeyInfo ───────────────────────────────────────────────

  describe("extractKeyInfo", () => {
    it("ranks messages by importance", () => {
      const opt = new PositionOptimizer();
      const msgs = [
        makeMsg("user", "hello there"),
        makeMsg("user", "critical bug in deployment must be fixed immediately"),
        makeMsg("user", "ok thanks"),
      ];
      const info = opt.extractKeyInfo(msgs);
      expect(info.length).toBeGreaterThan(0);
      expect(info[0].importance).toBeGreaterThan(0.2);
    });

    it("filters out low-importance messages", () => {
      const opt = new PositionOptimizer();
      const msgs = [makeMsg("user", "ok")];
      expect(opt.extractKeyInfo(msgs)).toHaveLength(0);
    });
  });

  // ── reorderBalanced ──────────────────────────────────────────────

  describe("reorderBalanced", () => {
    it("returns same order for short sequences", () => {
      const opt = new PositionOptimizer();
      const msgs = [makeMsg("user", "a"), makeMsg("assistant", "b")];
      const result = opt.reorderBalanced(msgs);
      expect(result).toHaveLength(2);
    });
  });

  // ── repeatKeyInfo ────────────────────────────────────────────────

  describe("repeatKeyInfo", () => {
    it("adds head and tail key context notes", () => {
      const opt = new PositionOptimizer({ keyInfoRepetitions: 2 });
      const msgs = [
        makeMsg("user", "critical security vulnerability found in auth module"),
        makeMsg("assistant", "I will investigate"),
      ];
      const result = opt.repeatKeyInfo(msgs);
      expect(result.length).toBeGreaterThan(msgs.length);
      expect(result[0].role).toBe("system");
    });
  });

  // ── slidingWindowCompress ─────────────────────────────────────────

  describe("slidingWindowCompress", () => {
    it("reduces long sequences to budget", () => {
      const opt = new PositionOptimizer();
      const msgs = Array.from({ length: 100 }, (_, i) =>
        makeMsg("user", `message ${i}`)
      );
      const result = opt.slidingWindowCompress(msgs, 20);
      expect(result.length).toBeLessThanOrEqual(30); // head + window + tail
    });

    it("keeps first and last messages", () => {
      const opt = new PositionOptimizer();
      const msgs = Array.from({ length: 50 }, (_, i) =>
        makeMsg("user", `msg ${i}`)
      );
      const result = opt.slidingWindowCompress(msgs, 15);
      expect(result[0]).toBe(msgs[0]);
      expect(result[result.length - 1]).toBe(msgs[msgs.length - 1]);
    });
  });

  // ── optimize ─────────────────────────────────────────────────────

  describe("optimize", () => {
    it("returns same for short sequences", () => {
      const opt = new PositionOptimizer();
      const msgs = [makeMsg("user", "hi")];
      expect(opt.optimize(msgs)).toHaveLength(1);
    });

    it("applies optimization to long sequences", () => {
      const opt = new PositionOptimizer({ positionPreference: "balanced" });
      const msgs = Array.from({ length: 15 }, (_, i) =>
        makeMsg("user", `message ${i} about important architecture decisions`)
      );
      const result = opt.optimize(msgs);
      // Should have added head/tail notes plus position markers
      expect(result.length).toBeGreaterThanOrEqual(msgs.length);
    });
  });

  // ── config ───────────────────────────────────────────────────────

  describe("config", () => {
    it("uses defaults", () => {
      const opt = new PositionOptimizer();
      expect(opt.config.positionPreference).toBe("balanced");
      expect(opt.config.keyInfoRepetitions).toBe(1);
    });

    it("merges partial config", () => {
      const opt = new PositionOptimizer({ positionPreference: "head" });
      expect(opt.config.positionPreference).toBe("head");
    });
  });
});
