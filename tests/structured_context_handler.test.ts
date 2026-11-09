import { describe, it, expect } from "vitest";
import { StructuredContextHandler } from "../src/structured_context_handler";

describe("StructuredContextHandler", () => {
  // ── detect ────────────────────────────────────────────────────────

  describe("detect", () => {
    it("detects JSON object", () => {
      const handler = new StructuredContextHandler();
      expect(handler.detect('{"name":"test","value":42}')).toBe("json");
    });

    it("detects JSON array", () => {
      const handler = new StructuredContextHandler();
      expect(handler.detect('[{"a":1},{"a":2}]')).toBe("json");
    });

    it("detects CSV", () => {
      const handler = new StructuredContextHandler();
      const csv = "name,age,city\nAlice,30,NYC\nBob,25,LA\nCharlie,35,SF";
      expect(handler.detect(csv)).toBe("csv");
    });

    it("detects markdown table", () => {
      const handler = new StructuredContextHandler();
      const table = "| Name | Age |\n|------|-----|\n| Alice | 30 |";
      expect(handler.detect(table)).toBe("table");
    });

    it("detects KG-like patterns", () => {
      const handler = new StructuredContextHandler();
      expect(handler.detect("Alice is a person. Alice has projectA.")).toBe("kg");
    });

    it("returns null for plain text", () => {
      const handler = new StructuredContextHandler();
      expect(handler.detect("hello world")).toBeNull();
    });

    it("returns null for empty string", () => {
      const handler = new StructuredContextHandler();
      expect(handler.detect("")).toBeNull();
    });
  });

  // ── tableToMarkdown ───────────────────────────────────────────────

  describe("tableToMarkdown", () => {
    it("converts object array to markdown table", () => {
      const handler = new StructuredContextHandler();
      const result = handler.tableToMarkdown([
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
      ]);
      expect(result).toContain("| name | age |");
      expect(result).toContain("| Alice | 30 |");
    });

    it("returns empty for empty array", () => {
      const handler = new StructuredContextHandler();
      expect(handler.tableToMarkdown([])).toBe("");
    });
  });

  // ── jsonToSummary ─────────────────────────────────────────────────

  describe("jsonToSummary", () => {
    it("summarizes array with count", () => {
      const handler = new StructuredContextHandler();
      const result = handler.jsonToSummary([1, 2, 3, 4, 5]);
      expect(result).toContain("5 items");
    });

    it("summarizes small object", () => {
      const handler = new StructuredContextHandler();
      const result = handler.jsonToSummary({ name: "test", version: "1.0" });
      expect(result).toContain("name");
      expect(result).toContain("version");
    });

    it("handles empty array", () => {
      const handler = new StructuredContextHandler();
      expect(handler.jsonToSummary([])).toBe("Empty array");
    });
  });

  // ── sqlResultSummarize ────────────────────────────────────────────

  describe("sqlResultSummarize", () => {
    it("formats query result", () => {
      const handler = new StructuredContextHandler();
      const result = handler.sqlResultSummarize({
        columns: ["id", "name"],
        rows: [[1, "Alice"], [2, "Bob"]],
        rowCount: 2,
      });
      expect(result).toContain("2 rows");
      expect(result).toContain("id=1, name=Alice");
    });
  });

  // ── extractRelations ─────────────────────────────────────────────

  describe("extractRelations", () => {
    it("extracts action-verb relations", () => {
      const handler = new StructuredContextHandler();
      const rels = handler.extractRelations("Friday writes code. Edith runs tests.", "kg");
      expect(rels.length).toBeGreaterThan(0);
      expect(rels[0]).toMatchObject({ subject: "Friday", predicate: "writes", object: "code" });
    });

    it("extracts has relations", () => {
      const handler = new StructuredContextHandler();
      const rels = handler.extractRelations("Project has moduleA. Project has moduleB.", "kg");
      expect(rels.length).toBeGreaterThan(0);
    });

    it("does not turn question words into a relation (OBS-2)", () => {
      const handler = new StructuredContextHandler();
      expect(handler.extractRelations("what is the release process", "kg")).toEqual([]);
    });

    it("drops stopword/short entities", () => {
      const handler = new StructuredContextHandler();
      expect(handler.extractRelations("it has x", "kg")).toEqual([]);
    });

    it("honours configurable quality rules", () => {
      expect(new StructuredContextHandler().extractRelations("Bo has module", "kg")).toEqual([]);
      const relaxed = new StructuredContextHandler({
        relationQuality: { minEntityLength: 2 },
      });
      expect(relaxed.extractRelations("Bo has module", "kg").length).toBeGreaterThan(0);
    });

    // ── OBS-3: composite entity truncation ──────────────────────────────
    it("merges multi-word entities instead of truncating them", () => {
      const handler = new StructuredContextHandler();
      expect(handler.extractRelations("release pipeline has strict order", "kg")).toContainEqual({
        subject: "release pipeline", predicate: "has", object: "strict order",
      });
      expect(handler.extractRelations("memory manager stores session data", "kg")).toContainEqual({
        subject: "memory manager", predicate: "stores", object: "session data",
      });
      expect(handler.extractRelations("claw-mem has three tiers", "kg")).toContainEqual({
        subject: "claw-mem", predicate: "has", object: "three tiers",
      });
      expect(handler.extractRelations("context engine requires token budget", "kg")).toContainEqual({
        subject: "context engine", predicate: "requires", object: "token budget",
      });
      expect(handler.extractRelations("openclaw plugin sdk depends on node runtime", "kg")).toContainEqual({
        subject: "openclaw plugin sdk", predicate: "depends on", object: "node runtime",
      });
    });

    it("strips leading/trailing stopwords from merged entities", () => {
      const handler = new StructuredContextHandler();
      const rels = handler.extractRelations("the release pipeline has the strict order", "kg");
      expect(rels[0]).toMatchObject({ subject: "release pipeline", object: "strict order" });
    });

    it("does not swallow the next clause subject across conjunctions (OBS-3 rework)", () => {
      const handler = new StructuredContextHandler();
      const rels = handler.extractRelations("Kai builds gateways and Edith reviews releases", "kg");
      expect(rels).toContainEqual({ subject: "Kai", predicate: "builds", object: "gateways" });
      expect(rels).toContainEqual({ subject: "Edith", predicate: "reviews", object: "releases" });
      expect(rels.some((r) => r.object.includes("and"))).toBe(false);
    });

    it("splits a second clause with a different subject", () => {
      const handler = new StructuredContextHandler();
      const rels = handler.extractRelations("Friday writes code and Karen runs releases", "kg");
      expect(rels).toContainEqual({ subject: "Friday", predicate: "writes", object: "code" });
      expect(rels).toContainEqual({ subject: "Karen", predicate: "runs", object: "releases" });
    });

    it("conjunction boundary never invents a wrong subject (OBS-2 check)", () => {
      const handler = new StructuredContextHandler();
      const rels = handler.extractRelations("claw-mem has three tiers and supports semantic search", "kg");
      expect(rels).toContainEqual({ subject: "claw-mem", predicate: "has", object: "three tiers" });
      expect(rels.some((r) => r.subject === "tiers")).toBe(false);
    });

    it("fragment→composite fixture: fragments disappear, composites stay", () => {
      const handler = new StructuredContextHandler();
      const text = "release pipeline has strict order. memory manager stores session data.";
      const rels = handler.extractRelations(text, "kg");
      const subjects = rels.map((r) => r.subject);
      const objects = rels.map((r) => r.object);
      expect(subjects).not.toContain("pipeline");
      expect(subjects).not.toContain("manager");
      expect(subjects).toContain("release pipeline");
      expect(subjects).toContain("memory manager");
      expect(objects).toContain("strict order");
      expect(objects).toContain("session data");
    });
  });

  // ── verbalize ─────────────────────────────────────────────────────

  describe("verbalize", () => {
    it("verbalizes JSON to natural language", () => {
      const handler = new StructuredContextHandler();
      const result = handler.verbalize('{"name":"test"}');
      expect(result).toContain("[Structured Data: JSON]");
    });

    it("verbalizes CSV with headers", () => {
      const handler = new StructuredContextHandler();
      const csv = "name,age\nAlice,30\nBob,25";
      const result = handler.verbalize(csv);
      expect(result).toContain("[Structured Data: CSV");
    });

    it("returns plain text unchanged", () => {
      const handler = new StructuredContextHandler();
      expect(handler.verbalize("hello world")).toBe("hello world");
    });

    it("does not emit a KG block for a question with no valid relations (OBS-2)", () => {
      const handler = new StructuredContextHandler();
      const text = "what is the release process";
      const out = handler.verbalize(text);
      expect(out).toBe(text);
      expect(out).not.toContain("Knowledge Graph");
    });

    it("verbalizes valid relations without the junk triple", () => {
      const handler = new StructuredContextHandler();
      const out = handler.verbalize("Friday writes code", "kg");
      expect(out).toContain("Friday --[writes]--> code");
      expect(out).not.toContain("what --[is]--> the");
    });
  });

  // ── config ───────────────────────────────────────────────────────

  describe("config", () => {
    it("uses defaults", () => {
      const handler = new StructuredContextHandler();
      expect(handler.config.maxRows).toBe(20);
      expect(handler.config.compressionStrategy).toBe("summarize");
    });
  });
});
