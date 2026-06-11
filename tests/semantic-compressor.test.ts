// claw-ctx v4.22.0 — SemanticCompressor tests
import { describe, it, expect } from "vitest";
import { SemanticCompressor } from "../src/semantic-compressor.js";

function makeMsg(content: string, role = "user") {
  return { message: { role, content } };
}

describe("SemanticCompressor", () => {
  const compressor = new SemanticCompressor();

  describe("scoreImportance", () => {
    it("scores code-related messages higher", () => {
      const msgs = [makeMsg("I will implement the function getUsers using TypeScript")];
      const result = compressor.scoreImportance(msgs);
      expect(result[0].score).toBeGreaterThanOrEqual(30);
      expect(result[0].factors).toContain("code");
    });

    it("scores decision messages higher", () => {
      const msgs = [makeMsg("I decided to use semantic compression instead of legacy")];
      const result = compressor.scoreImportance(msgs);
      expect(result[0].score).toBeGreaterThanOrEqual(25);
      expect(result[0].factors).toContain("decision");
    });

    it("scores entity-containing messages higher", () => {
      const msgs = [makeMsg("The claw-ctx v4.22.0 plugin integrates with Gateway")];
      const result = compressor.scoreImportance(msgs);
      expect(result[0].score).toBeGreaterThanOrEqual(20);
      expect(result[0].factors).toContain("entity");
    });

    it("scores question messages higher", () => {
      const msgs = [makeMsg("How should we handle the edge case with empty messages?")];
      const result = compressor.scoreImportance(msgs);
      expect(result[0].score).toBeGreaterThanOrEqual(15);
      expect(result[0].factors).toContain("question");
    });

    it("penalizes near-duplicate messages", () => {
      const msgs = [
        makeMsg("The claw-ctx v4.22.0 plugin integrates with Gateway for context management"),
        makeMsg("The claw-ctx v4.22.0 plugin integrates with Gateway for context handling"),
      ];
      const result = compressor.scoreImportance(msgs);
      expect(result[1].factors).toContain("duplicate");
      expect(result[1].score).toBeLessThan(result[0].score);
    });

    it("scores empty messages as zero", () => {
      const msgs = [makeMsg("")];
      const result = compressor.scoreImportance(msgs);
      expect(result[0].score).toBe(0);
    });

    it("accumulates multiple factors", () => {
      const msgs = [makeMsg("I decided to refactor the claw-ctx Gateway plugin — what approach should we take?")];
      const result = compressor.scoreImportance(msgs);
      // decision + entity + question = 60
      expect(result[0].score).toBeGreaterThanOrEqual(60);
      expect(result[0].factors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("extractEntities", () => {
    it("extracts project names and versions", () => {
      const msgs = [
        makeMsg("claw-ctx v4.22.0 and claw-mem v6.19.0 integration"),
      ];
      const entities = compressor.extractEntities(msgs);
      expect(entities).toContain("claw-ctx");
      expect(entities).toContain("claw-mem");
    });

    it("extracts PascalCase identifiers", () => {
      const msgs = [makeMsg("The SemanticCompressor class should handle MessageImportance")];
      const entities = compressor.extractEntities(msgs);
      expect(entities.some(e => e.includes("semanticcompressor"))).toBe(true);
    });

    it("returns empty for no entities", () => {
      const msgs = [makeMsg("hello world")];
      const entities = compressor.extractEntities(msgs);
      expect(entities.length).toBe(0);
    });
  });

  describe("extractDecisions", () => {
    it("extracts sentences with decision markers", () => {
      const msgs = [
        makeMsg("We decided to use semantic compression. The old approach was too simple."),
      ];
      const decisions = compressor.extractDecisions(msgs);
      expect(decisions.length).toBeGreaterThanOrEqual(1);
      expect(decisions[0]).toContain("decided");
    });

    it("returns empty for no decisions", () => {
      const msgs = [makeMsg("hello world")];
      const decisions = compressor.extractDecisions(msgs);
      expect(decisions.length).toBe(0);
    });
  });

  describe("compress", () => {
    it("keeps high-importance messages and newest messages", () => {
      const msgs: Array<{ message?: any }> = [];
      const tokens: number[] = [];
      // Generate 50 messages, some important, some not
      for (let i = 0; i < 50; i++) {
        if (i === 10) {
          msgs.push(makeMsg("I decided to refactor the claw-ctx Gateway integration — this is a key decision"));
          tokens.push(100);
        } else if (i === 25) {
          msgs.push(makeMsg("The bug is in src/semantic-compressor.ts at line 42 — need to fix"));
          tokens.push(80);
        } else {
          msgs.push(makeMsg(`Message ${i}: just a routine update with no special content here`));
          tokens.push(50);
        }
      }

      const result = compressor.compress(msgs, tokens, 2000);
      // Should keep the 2 high-importance messages + newest 20
      expect(result.keptIndices).toContain(5);
      expect(result.keptIndices).toContain(15);
      // Should have decisions extracted
      expect(result.decisions.length).toBeGreaterThan(0);
      // Should have entities extracted
      expect(result.entities.length).toBeGreaterThan(0);
      // Should keep newest messages
      for (let i = 30; i < 50; i++) {
        expect(result.keptIndices).toContain(i);
      }
    });

    it("generates summary with decisions and entities", () => {
      const msgs: Array<{ message?: any }> = [];
      const tokens: number[] = [];
      // Need enough messages that some get removed by compression
      for (let i = 0; i < 30; i++) {
        msgs.push(makeMsg(`Message ${i}: routine update with nothing special`));
        tokens.push(20);
      }
      msgs.push(makeMsg("I decided to use semantic compression for v4.22.0"));
      tokens.push(50);
      msgs.push(makeMsg("The claw-ctx plugin needs Gateway integration tests"));
      tokens.push(50);

      const result = compressor.compress(msgs, tokens, 300);
      expect(result.summary).toContain("Compacted History");
      expect(result.summary).toContain("Topics");
      expect(result.decisions.length).toBeGreaterThan(0);
    });
  });

  describe("buildSummary", () => {
    it("includes topics, decisions, and entities", () => {
      const summary = compressor.buildSummary(
        [makeMsg("test")], 5,
        ["decided to refactor"],
        ["claw-ctx", "Gateway"],
        ["refactor", "integration"]
      );
      expect(summary).toContain("refactor");
      expect(summary).toContain("decided to refactor");
      expect(summary).toContain("claw-ctx");
      expect(summary).toContain("Compacted History");
    });

    it("handles empty arrays gracefully", () => {
      const summary = compressor.buildSummary([makeMsg("test")], 1, [], [], []);
      expect(summary).toContain("Compacted History");
      expect(summary).not.toContain("Key decisions");
      expect(summary).not.toContain("Referenced entities");
    });
  });
});
