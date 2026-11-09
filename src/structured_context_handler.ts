/**
 * claw-ctx — Context Engine for OpenClaw
 *
 * Copyright 2026 Peter Cheng
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
  /** KG relation quality rules (single tuning point). */
  relationQuality?: Partial<RelationQualityConfig>;
}

/** Minimum-quality rules for knowledge-graph relation extraction. */
export interface RelationQualityConfig {
  /** Words that can never be a subject/object entity. */
  stopwords: string[];
  /** Entity must be at least this many characters long. */
  minEntityLength: number;
  /** Maximum words merged into one entity (1 = single-token entities). */
  maxEntityWords: number;
}

export const DEFAULT_RELATION_QUALITY: RelationQualityConfig = {
  stopwords: [
    "a", "an", "the", "this", "that", "these", "those",
    "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
    "is", "are", "was", "were", "be", "been", "being",
    "of", "to", "in", "on", "for", "with", "and", "or", "but", "as", "at",
    "by", "from", "it", "its", "i", "you", "he", "she", "they", "we",
    "me", "him", "her", "them", "us", "my", "your", "his", "their", "our",
  ],
  minEntityLength: 3,
  maxEntityWords: 3,
};

// Action-verb / explicit relation verbs only. Copulas (is/are/was) never form
// a relation on their own — question sentences used to yield junk triples like
// `what --[is]--> the`.
const RELATION_VERBS: string[] = [
  "has|have",
  "contains|includes",
  "depends on|requires|needs",
  "writes|runs|cuts|builds|owns|manages|uses|supports|stores|searches|deploys|reviews|generates|produces|designs",
];

// Entity tokens: start with a letter, may carry hyphens/underscores. Relation
// verbs are excluded so a greedy multi-word entity can never swallow the next
// predicate (e.g. "code and runs tests").
const ENTITY_TOKEN = "[A-Za-z][A-Za-z0-9_-]*";
const ENTITY_VERB_LOOKAHEAD = "(?!(?:has|have|contains|includes|depends|requires|needs|writes|runs|cuts|builds|owns|manages|uses|supports|stores|searches|deploys|reviews|generates|produces|designs)\\b)";
// Conjunctions end an entity: without this, `A builds B and C reviews D` merged
// "B and C" into the object and the second clause was never matched.
const ENTITY_CONJ_BOUNDARY = "(?!(?:and|or|but)\\b)";
const ENTITY_EDGE = `${ENTITY_VERB_LOOKAHEAD}${ENTITY_CONJ_BOUNDARY}`;

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
  relationQuality: RelationQualityConfig;
  private relationPatterns: RegExp[];

  constructor(config?: Partial<StructuredDataConfig>) {
    this.config = { ...DEFAULT_STRUCTURED_CONFIG, ...config };
    this.relationQuality = {
      ...DEFAULT_RELATION_QUALITY,
      ...(config?.relationQuality ?? {}),
    };
    const extraWords = Math.max(0, this.relationQuality.maxEntityWords - 1);
    const entity = `(?:${ENTITY_EDGE}${ENTITY_TOKEN})(?:\\s+${ENTITY_EDGE}${ENTITY_TOKEN}){0,${extraWords}}`;
    this.relationPatterns = RELATION_VERBS.map(
      (verbs) => new RegExp(`\\b(${entity})\\s+(${verbs})\\s+(${entity})`, "gi"),
    );
  }

  private isQualityEntity(word: string): boolean {
    const w = word.toLowerCase();
    return w.length >= this.relationQuality.minEntityLength
      && !this.relationQuality.stopwords.includes(w);
  }

  /** Merge multi-word entities and strip leading/trailing stopwords (OBS-3). */
  private normalizeEntity(raw: string): string {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    while (words.length > 0 && this.relationQuality.stopwords.includes(words[0].toLowerCase())) {
      words.shift();
    }
    while (words.length > 0 && this.relationQuality.stopwords.includes(words[words.length - 1].toLowerCase())) {
      words.pop();
    }
    return words.join(" ");
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
    const seen = new Set<string>();

    for (const pattern of this.relationPatterns) {
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(data)) !== null) {
        const subject = this.normalizeEntity(match[1]);
        const predicate = match[2].toLowerCase();
        const object = this.normalizeEntity(match[3]);
        if (!this.isQualityEntity(subject) || !this.isQualityEntity(object)) continue;

        const key = `${subject.toLowerCase()}|${predicate}|${object.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        relations.push({ subject, predicate, object });
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
        if (relations.length === 0) {
          // Nothing survived the quality gates: return the input untouched so
          // callers comparing verbalized-vs-original never inject a KG block.
          return data;
        }
        const relStr = relations.slice(0, 10)
          .map(r => `  ${r.subject} --[${r.predicate}]--> ${r.object}`)
          .join("\n");
        return `[Structured Data: Knowledge Graph — ${relations.length} relations]\n${relStr}`;
      }
      default:
        return data;
    }
  }
}
