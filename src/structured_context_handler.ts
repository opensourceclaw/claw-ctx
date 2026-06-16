/**
 * claw-ctx — Context Engine for OpenClaw
 *
 * Copyright 2026 OpenSourceClaw Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * claw-ctx v4.17.0 — Structured Context Handler
 *
 * Detects and converts structured data (Table/JSON/SQL-result/CSV/KG)
 * into natural language for injection into the LLM context.
 */

export type StructuredDataType = "table" | "json" | "sql-result" | "csv" | "kg";

export interface StructuredDataConfig {
  supportedTypes: StructuredDataType[];
  maxRows: number;
  compressionStrategy: "truncate" | "summarize" | "sample" | "schema-only";
  preserveRelations: boolean;
}

export interface Relation {
  subject: string;
  predicate: string;
  object: string;
}

export interface QueryResult {
  columns: string[];
  rows: Array<Array<string | number | null>>;
  rowCount: number;
}

export const DEFAULT_STRUCTURED_CONFIG: StructuredDataConfig = {
  supportedTypes: ["table", "json", "sql-result", "csv", "kg"],
  maxRows: 20,
  compressionStrategy: "summarize",
  preserveRelations: true,
};

// ── StructuredContextHandler ──────────────────────────────────────────

export class StructuredContextHandler {
  config: StructuredDataConfig;

  constructor(config?: Partial<StructuredDataConfig>) {
    this.config = { ...DEFAULT_STRUCTURED_CONFIG, ...config };
  }

  /** Detect the type of structured data from its format. */
  detect(data: string): StructuredDataType | null {
    if (!data?.trim()) return null;

    const trimmed = data.trim();

    // JSON detection: starts with { or [
    if (/^\s*[\{\[]/.test(trimmed)) {
      try {
        JSON.parse(trimmed);
        return "json";
      } catch { /* not valid JSON */ }
    }

    // CSV detection: comma-separated with consistent columns
    const lines = trimmed.split("\n").filter(l => l.trim());
    if (lines.length >= 2) {
      const commas0 = (lines[0].match(/,/g) || []).length;
      if (commas0 > 0) {
        const allMatch = lines.slice(1, 5).every(l =>
          (l.match(/,/g) || []).length === commas0
        );
        if (allMatch) return "csv";
      }
    }

    // Table detection: markdown table (| separator)
    if (/\|.*\|/.test(trimmed) && /\|[-:\s|]+\|/.test(trimmed)) {
      return "table";
    }

    // SQL result detection
    if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE)\b/i.test(trimmed)) {
      return "sql-result";
    }

    // KG detection: triple-like patterns
    if (/\b\w+\s+(is|has|contains|relates|connected)\s+\w+/i.test(trimmed)) {
      return "kg";
    }

    return null;
  }

  /** Convert a data array to a markdown table. */
  tableToMarkdown(table: Record<string, unknown>[]): string {
    if (!table?.length) return "";

    const keys = Object.keys(table[0]);
    if (keys.length === 0) return "";

    // Header
    const header = "| " + keys.join(" | ") + " |";
    // Separator
    const sep = "|" + keys.map(() => "---").join("|") + "|";
    // Rows
    const rows = table.slice(0, this.config.maxRows).map(row =>
      "| " + keys.map(k => String(row[k] ?? "")).join(" | ") + " |"
    );

    return [header, sep, ...rows].join("\n");
  }

  /** Summarize JSON data into natural language. */
  jsonToSummary(json: unknown): string {
    if (json === null || json === undefined) return "Empty data";

    if (Array.isArray(json)) {
      if (json.length === 0) return "Empty array";
      const sample = json.slice(0, 3);
      return `Array with ${json.length} items. Sample: ${JSON.stringify(sample)}`;
    }

    if (typeof json === "object") {
      const obj = json as Record<string, unknown>;
      const keys = Object.keys(obj);
      if (keys.length === 0) return "Empty object";
      if (keys.length <= 5) {
        return `Object with fields: ${keys.join(", ")}. Values: ${JSON.stringify(obj)}`;
      }
      return `Object with ${keys.length} fields: ${keys.slice(0, 5).join(", ")}... and ${keys.length - 5} more`;
    }

    return String(json);
  }

  /** Summarize SQL query result into compact form. */
  sqlResultSummarize(result: QueryResult, maxRows: number = 20): string {
    const limit = Math.min(result.rowCount, maxRows || this.config.maxRows);
    const cols = result.columns;

    if (!cols?.length || !result.rows?.length) {
      return `Query returned ${result.rowCount} rows with columns: ${cols.join(", ")}`;
    }

    const sampleRows = result.rows.slice(0, limit);
    const rowStr = sampleRows.map(r =>
      cols.map((c, i) => `${c}=${r[i] ?? "NULL"}`).join(", ")
    ).join("\n  ");

    const extra = result.rowCount > limit ? `\n  ... and ${result.rowCount - limit} more rows` : "";

    return `Query result: ${result.rowCount} rows, ${cols.length} columns (${cols.join(", ")})\n  ${rowStr}${extra}`;
  }

  /** Extract subject-predicate-object relations from text data. */
  extractRelations(data: string, _type: StructuredDataType): Relation[] {
    if (!data?.trim()) return [];

    const relations: Relation[] = [];
    const patterns = [
      /\b(\w+)\s+(is|are)\s+(a|an|the)\s+(\w+)/gi,
      /\b(\w+)\s+(has|have)\s+(\w+)/gi,
      /\b(\w+)\s+(contains|includes)\s+(\w+)/gi,
      /\b(\w+)\s+(depends on|requires|needs)\s+(\w+)/gi,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(data)) !== null) {
        const m = match;
        const groups = m.filter((_, i) => i > 0 && m[i] !== undefined);
        if (groups.length >= 3) {
          relations.push({
            subject: groups[0],
            predicate: groups[1].toLowerCase(),
            object: groups[2],
          });
        }
        if (relations.length >= 50) break;
      }
    }

    return relations;
  }

  /** Main verbalization: convert structured data to natural language. */
  verbalize(data: string, type?: StructuredDataType): string {
    if (!data?.trim()) return "";

    const detectedType = type || this.detect(data);
    if (!detectedType) return data; // not structured, return as-is

    switch (detectedType) {
      case "json": {
        try {
          const parsed = JSON.parse(data);
          return `[Structured Data: JSON]\n${this.jsonToSummary(parsed)}`;
        } catch {
          return data;
        }
      }
      case "csv": {
        const lines = data.trim().split("\n");
        const headers = lines[0].split(",").map(h => h.trim());
        const rowCount = lines.length - 1;
        const sample = lines.slice(1, 4).join("\n");
        return `[Structured Data: CSV — ${rowCount} rows, columns: ${headers.join(", ")}]\n${sample}`;
      }
      case "table": {
        return `[Structured Data: Markdown Table]\n${data.trim()}`;
      }
      case "sql-result": {
        return `[Structured Data: SQL Query]\n${data.trim()}`;
      }
      case "kg": {
        const relations = this.extractRelations(data, "kg");
        if (relations.length > 0) {
          const relStr = relations.slice(0, 10)
            .map(r => `  ${r.subject} --[${r.predicate}]--> ${r.object}`)
            .join("\n");
          return `[Structured Data: Knowledge Graph — ${relations.length} relations]\n${relStr}`;
        }
        return `[Structured Data: Knowledge Graph]\n${data.trim()}`;
      }
      default:
        return data;
    }
  }
}
