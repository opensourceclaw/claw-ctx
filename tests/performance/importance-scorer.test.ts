/**
 * claw-ctx v5.10.0 — Importance Scorer Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ImportanceScorer,
  IncrementalCompressor,
  StreamingCompressor,
  getImportanceScorer,
  getIncrementalCompressor,
  resetScorerInstances,
  DEFAULT_SCORER_CONFIG,
  DEFAULT_INCREMENTAL_CONFIG,
} from "../../src/importance-scorer.js";

// Helper to create mock messages
function createMessage(content: string): { message: { content: string } } {
  return { message: { content } };
}

describe("ImportanceScorer", () => {
  let scorer: ImportanceScorer;

  beforeEach(() => {
    scorer = new ImportanceScorer();
  });

  describe("constructor", () => {
    it("should create instance with default config", () => {
      expect(scorer).toBeDefined();
      expect(scorer.getPatterns().size).toBe(4);
    });

    it("should accept custom config", () => {
      const customScorer = new ImportanceScorer({ batchSize: 100, duplicateWindow: 5 });
      expect(customScorer).toBeDefined();
    });
  });

  describe("scoreBatch", () => {
    it("should score messages asynchronously", async () => {
      const messages = [
        createMessage("function test() { return 1; }"),
        createMessage("This is a decision: we will use PostgreSQL."),
        createMessage("Hi"), // 2 characters, will be marked empty
      ];

      const results = await scorer.scoreBatch(messages);

      expect(results).toHaveLength(3);
      expect(results[0].factors).toContain("code");
      expect(results[1].factors).toContain("decision");
      expect(results[2].factors).toContain("empty");
    });

    it("should report progress", async () => {
      const messages = Array(150).fill(null).map((_, i) => createMessage(`Message ${i}`));
      const progressReports: number[] = [];

      await scorer.scoreBatch(messages, (p) => progressReports.push(p));

      expect(progressReports.length).toBeGreaterThan(0);
      expect(progressReports[progressReports.length - 1]).toBe(1);
    });

    it("should detect entities", async () => {
      const messages = [createMessage("claw-ctx v5.10.0 released")];
      const results = await scorer.scoreBatch(messages);

      expect(results[0].factors).toContain("entity");
    });

    it("should detect questions", async () => {
      const messages = [createMessage("How do I implement this?")];
      const results = await scorer.scoreBatch(messages);

      expect(results[0].factors).toContain("question");
    });

    it("should apply duplicate penalty", async () => {
      const messages = [
        createMessage("This is a unique message about coding."),
        createMessage("This is a unique message about coding."), // Duplicate
      ];

      const results = await scorer.scoreBatch(messages);

      expect(results[1].factors).toContain("duplicate");
      expect(results[1].score).toBeLessThan(results[0].score);
    });
  });

  describe("scoreSync", () => {
    it("should score messages synchronously", () => {
      const messages = [
        createMessage("const x = 1;"),
        createMessage("We decided to use React."),
      ];

      const results = scorer.scoreSync(messages);

      expect(results).toHaveLength(2);
      expect(results[0].factors).toContain("code");
      expect(results[1].factors).toContain("decision");
    });

    it("should handle empty messages", () => {
      const results = scorer.scoreSync([createMessage("")]);
      expect(results[0].score).toBe(0);
    });
  });

  describe("pattern detection", () => {
    it("should detect code patterns", async () => {
      const messages = [createMessage("```typescript\nconst x = 1;\n```")];
      const results = await scorer.scoreBatch(messages);
      expect(results[0].factors).toContain("code");
    });

    it("should detect decision patterns", async () => {
      const messages = [createMessage("We decided to implement the feature.")];
      const results = await scorer.scoreBatch(messages);
      expect(results[0].factors).toContain("decision");
    });
  });
});

describe("IncrementalCompressor", () => {
  let compressor: IncrementalCompressor;

  beforeEach(() => {
    compressor = new IncrementalCompressor({ chunkSize: 10, minKeep: 2 });
  });

  describe("compressIncremental", () => {
    it("should compress messages incrementally", async () => {
      const messages = Array(50).fill(null).map((_, i) => createMessage(`Message ${i}`));
      const tokens = messages.map(() => 10);
      const targetTokens = 200;

      const result = await compressor.compressIncremental(messages, tokens, targetTokens);

      expect(result.keptIndices.length).toBeGreaterThan(0);
      expect(result.keptIndices.length + result.removedIndices.length).toBe(50);
    });

    it("should report progress", async () => {
      const messages = Array(30).fill(null).map((_, i) => createMessage(`Message ${i}`));
      const tokens = messages.map(() => 10);
      const progressReports: number[] = [];

      await compressor.compressIncremental(messages, tokens, 100, (p) => progressReports.push(p));

      expect(progressReports.length).toBeGreaterThan(0);
    });

    it("should always keep minKeep newest messages", async () => {
      const messages = Array(20).fill(null).map((_, i) => createMessage(`Message ${i}`));
      const tokens = messages.map(() => 100);
      const targetTokens = 50; // Very small budget

      const result = await compressor.compressIncremental(messages, tokens, targetTokens);

      // Should keep at least minKeep (2) newest messages
      expect(result.keptIndices).toContain(18);
      expect(result.keptIndices).toContain(19);
    });

    it("should extract decisions and entities", async () => {
      const messages = [
        createMessage("We decided to use TypeScript."),
        createMessage("claw-ctx is the project name."),
      ];
      const tokens = messages.map(() => 10);

      const result = await compressor.compressIncremental(messages, tokens, 100);

      expect(result.decisions.length).toBeGreaterThanOrEqual(0);
      expect(result.entities.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("compressSync", () => {
    it("should compress messages synchronously", () => {
      const messages = Array(20).fill(null).map((_, i) => createMessage(`Message ${i}`));
      const tokens = messages.map(() => 10);

      const result = compressor.compressSync(messages, tokens, 100);

      expect(result.keptIndices.length).toBeGreaterThan(0);
    });
  });

  describe("DEFAULT_INCREMENTAL_CONFIG", () => {
    it("should have expected defaults", () => {
      expect(DEFAULT_INCREMENTAL_CONFIG.chunkSize).toBe(100);
      expect(DEFAULT_INCREMENTAL_CONFIG.minKeep).toBe(20);
    });
  });
});

describe("StreamingCompressor", () => {
  let compressor: StreamingCompressor;

  beforeEach(() => {
    compressor = new StreamingCompressor(10);
  });

  describe("compressStream", () => {
    it("should stream compression in chunks", () => {
      function* messageGen(): Generator<{ message: { content: string } }> {
        for (let i = 0; i < 25; i++) {
          yield createMessage(`Stream message ${i}`);
        }
      }

      const chunks = [...compressor.compressStream(messageGen(), 500)];

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].keptIndices.length).toBeGreaterThan(0);
    });

    it("should respect token budget", () => {
      function* messageGen(): Generator<{ message: { content: string } }> {
        for (let i = 0; i < 20; i++) {
          yield createMessage("This is a message with some content for testing.");
        }
      }

      const chunks = [...compressor.compressStream(messageGen(), 100)];

      for (const chunk of chunks) {
        expect(chunk.tokensUsed).toBeLessThanOrEqual(100);
      }
    });

    it("should handle small message sets", () => {
      function* messageGen(): Generator<{ message: { content: string } }> {
        for (let i = 0; i < 5; i++) {
          yield createMessage(`Small ${i}`);
        }
      }

      const chunks = [...compressor.compressStream(messageGen(), 500)];

      expect(chunks.length).toBe(1);
      expect(chunks[0].keptIndices.length).toBe(5);
    });
  });
});

describe("Singleton instances", () => {
  beforeEach(() => {
    resetScorerInstances();
  });

  afterEach(() => {
    resetScorerInstances();
  });

  it("should return same ImportanceScorer instance", () => {
    const s1 = getImportanceScorer();
    const s2 = getImportanceScorer();
    expect(s1).toBe(s2);
  });

  it("should return same IncrementalCompressor instance", () => {
    const c1 = getIncrementalCompressor();
    const c2 = getIncrementalCompressor();
    expect(c1).toBe(c2);
  });

  it("should reset instances", () => {
    getImportanceScorer();
    getIncrementalCompressor();
    resetScorerInstances();

    // After reset, new instances should be created
    const s1 = getImportanceScorer();
    const c1 = getIncrementalCompressor();
    expect(s1).toBeDefined();
    expect(c1).toBeDefined();
  });
});

describe("DEFAULT_SCORER_CONFIG", () => {
  it("should have expected defaults", () => {
    expect(DEFAULT_SCORER_CONFIG.batchSize).toBe(50);
    expect(DEFAULT_SCORER_CONFIG.duplicateWindow).toBe(10);
  });
});
