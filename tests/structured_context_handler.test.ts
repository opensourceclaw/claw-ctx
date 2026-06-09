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
    it("extracts is-a relations", () => {
      const handler = new StructuredContextHandler();
      const rels = handler.extractRelations("Alice is a developer. Bob is a designer.", "kg");
      expect(rels.length).toBeGreaterThan(0);
    });

    it("extracts has relations", () => {
      const handler = new StructuredContextHandler();
      const rels = handler.extractRelations("Project has moduleA. Project has moduleB.", "kg");
      expect(rels.length).toBeGreaterThan(0);
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
