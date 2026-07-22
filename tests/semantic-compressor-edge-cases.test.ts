// claw-ctx v5.11.0 - SemanticCompressor edge case tests
import { describe, it, expect } from "vitest";
import { SemanticCompressor } from "../src/semantic-compressor.js";

function makeMsg(content: any, role = "user") {
  return { message: { role, content } };
}

describe("SemanticCompressor edge cases (v5.11.0)", () => {
  describe("L2: empty input handling", () => {
    it("compress() returns empty result for empty messages", () => {
      const c = new SemanticCompressor();
      const result = c.compress([], [], 1000);
      expect(result.keptIndices).toEqual([]);
      expect(result.removedIndices).toEqual([]);
      expect(result.summary).toBe("");
      expect(result.decisions).toEqual([]);
      expect(result.entities).toEqual([]);
      expect(result.topics).toEqual([]);
    });

    it("compress() returns empty result for null/undefined messages", () => {
      const c = new SemanticCompressor();
      const r1 = c.compress(null as any, [], 1000);
      const r2 = c.compress(undefined as any, [], 1000);
      expect(r1.keptIndices).toEqual([]);
      expect(r2.keptIndices).toEqual([]);
    });

    it("compress() throws on length mismatch", () => {
      const c = new SemanticCompressor();
      expect(() =>
        c.compress([makeMsg("hi")], [1, 2, 3], 1000),
      ).toThrow(/Length mismatch/);
    });

    it("scoreImportance handles empty array", () => {
      const c = new SemanticCompressor();
      expect(c.scoreImportance([])).toEqual([]);
    });
  });

  describe("L3: nested tool_use / tool_result extraction", () => {
    it("extracts text from tool_use content blocks", () => {
      const c = new SemanticCompressor();
      const msg = {
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", name: "read_file", input: { path: "/tmp/test.ts" } },
          ],
        },
      };
      const result = c.scoreImportance([msg]);
      // Tool use contains "test" and "ts" which match code/entity patterns
      expect(result[0].score).toBeGreaterThan(0);
    });

    it("extracts text from tool_result content blocks", () => {
      const c = new SemanticCompressor();
      const msg = {
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              content: "The file contains a TypeScript function that exports getUsers",
            },
          ],
        },
      };
      const result = c.scoreImportance([msg]);
      expect(result[0].score).toBeGreaterThan(0);
      expect(result[0].factors).toContain("code");
    });

    it("extracts text from array of mixed content blocks", () => {
      const c = new SemanticCompressor();
      const msg = {
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "I decided to use semantic compression" },
            { type: "tool_use", name: "compress", input: { threshold: 0.7 } },
          ],
        },
      };
      const result = c.scoreImportance([msg]);
      // Should have decision factor from text + entity from tool_use
      expect(result[0].factors).toContain("decision");
    });

    it("handles tool_result with array content", () => {
      const c = new SemanticCompressor();
      const msg = {
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              content: [
                { type: "text", text: "Result: the claw-ctx v5.11.0 plugin" },
              ],
            },
          ],
        },
      };
      const result = c.scoreImportance([msg]);
      expect(result[0].factors).toContain("entity");
    });

    it("extracts entities from nested tool_use/tool_result", () => {
      const c = new SemanticCompressor();
      const msgs = [
        {
          message: {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                name: "test",
                input: { project: "claw-ctx", version: "5.11.0" },
              },
            ],
          },
        },
      ];
      const entities = c.extractEntities(msgs);
      expect(entities).toContain("claw-ctx");
      expect(entities).toContain("5.11.0");
    });
  });

  describe("config: minKeep", () => {
    it("defaults to 20", () => {
      const c = new SemanticCompressor();
      // Build 30 messages, compress with small budget - should keep minKeep newest
      const msgs = Array.from({ length: 30 }, (_, i) =>
        makeMsg(`message ${i} with content`),
      );
      const tokens = msgs.map(() => 5);
      const result = c.compress(msgs, tokens, 50);
      // Should keep at least 20 newest
      expect(result.keptIndices.length).toBeGreaterThanOrEqual(20);
    });

    it("honors custom minKeep=5", () => {
      const c = new SemanticCompressor({ minKeep: 5 });
      const msgs = Array.from({ length: 30 }, (_, i) =>
        makeMsg(`message ${i} with content`),
      );
      const tokens = msgs.map(() => 5);
      const result = c.compress(msgs, tokens, 30);
      // With minKeep=5 and budget=30 (6 messages @ 5 tokens), should keep <= 6
      // but >= 5
      expect(result.keptIndices.length).toBeGreaterThanOrEqual(5);
      expect(result.keptIndices.length).toBeLessThanOrEqual(7);
    });

    it("honors custom minKeep=0", () => {
      const c = new SemanticCompressor({ minKeep: 0 });
      const msgs = Array.from({ length: 30 }, (_, i) =>
        makeMsg(`message ${i} with content`),
      );
      const tokens = msgs.map(() => 5);
      const result = c.compress(msgs, tokens, 25);
      expect(result.keptIndices.length).toBeLessThanOrEqual(5);
    });
  });

  describe("config: duplicateThreshold", () => {
    it("honors custom duplicateThreshold", () => {
      // With threshold 0.99, near-duplicate should not be flagged
      const c = new SemanticCompressor({ duplicateThreshold: 0.99 });
      const msgs = [
        makeMsg("The claw-ctx plugin integrates with Gateway for context management"),
        makeMsg("The claw-ctx plugin integrates with Gateway for context handling"),
      ];
      const result = c.scoreImportance(msgs);
      expect(result[1].factors).not.toContain("duplicate");
    });

    it("defaults to 0.7 threshold (flags near-duplicates)", () => {
      const c = new SemanticCompressor();
      const msgs = [
        makeMsg("The claw-ctx plugin integrates with Gateway for context management"),
        makeMsg("The claw-ctx plugin integrates with Gateway for context handling"),
      ];
      const result = c.scoreImportance(msgs);
      expect(result[1].factors).toContain("duplicate");
    });
  });

  describe("config: duplicateWindowSize", () => {
    it("honors custom duplicateWindowSize", () => {
      // Window=0 should never flag duplicates (no prior messages to check)
      const c = new SemanticCompressor({ duplicateWindowSize: 0 });
      const msgs = [
        makeMsg("The claw-ctx plugin integrates with Gateway for context management"),
        makeMsg("The claw-ctx plugin integrates with Gateway for context handling"),
      ];
      const result = c.scoreImportance(msgs);
      expect(result[1].factors).not.toContain("duplicate");
    });
  });

  describe("buildSummary compact format (v5.11.0)", () => {
    it("produces single-line summary with all fields", () => {
      const c = new SemanticCompressor();
      const summary = c.buildSummary([], 5, ["decide A"], ["claw-ctx"], ["code"]);
      expect(summary).toContain("Compacted History");
      expect(summary).toContain("Topics: code");
      expect(summary).toContain("decisions:");
      expect(summary).toContain("entities:");
      expect(summary).not.toContain("\n");
    });

    it("omits empty fields", () => {
      const c = new SemanticCompressor();
      const summary = c.buildSummary([], 3, [], [], ["code"]);
      expect(summary).toContain("Topics: code");
      expect(summary).not.toContain("decisions:");
      expect(summary).not.toContain("entities:");
    });

    it("uses fallback when no topics", () => {
      const c = new SemanticCompressor();
      const summary = c.buildSummary([], 1, [], [], []);
      expect(summary).toContain("Topics: general discussion");
    });

    it("limits decisions to 5 and entities to 8", () => {
      const c = new SemanticCompressor();
      const manyDecisions = Array.from({ length: 10 }, (_, i) => `decision ${i}`);
      const manyEntities = Array.from({ length: 10 }, (_, i) => `entity${i}`);
      const summary = c.buildSummary([], 5, manyDecisions, manyEntities, []);
      const decisionMatches = summary.match(/"[^"]+"/g);
      expect(decisionMatches?.length).toBeLessThanOrEqual(5);
      const entityPart = summary.split("entities:")[1] ?? "";
      expect(entityPart.split(",").length).toBeLessThanOrEqual(8);
    });
  });

  describe("performance: sliding window duplicate detection (L4)", () => {
    it("correctly flags duplicate across large message set", () => {
      const c = new SemanticCompressor();
      const original = "The claw-ctx plugin integrates with Gateway for context management";
      const msgs = [
        makeMsg(original),
        ...Array.from({ length: 50 }, (_, i) => makeMsg(`filler message ${i}`)),
        makeMsg(original + " slightly different"),
      ];
      const result = c.scoreImportance(msgs);
      // The duplicate is far from the original (>10 messages), should not flag
      expect(result[result.length - 1].factors).not.toContain("duplicate");
    });

    it("flags duplicate within window", () => {
      const c = new SemanticCompressor();
      const original = "The claw-ctx plugin integrates with Gateway for context management";
      const msgs = [
        makeMsg(original),
        makeMsg(original + " minor variation"),
      ];
      const result = c.scoreImportance(msgs);
      expect(result[1].factors).toContain("duplicate");
    });
  });
});
