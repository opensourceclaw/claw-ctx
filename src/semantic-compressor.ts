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
 * claw-ctx v4.22.0 — Semantic Compressor
 *
 * Scores message importance to preserve key context (decisions, code, entities)
 * during compaction, rather than pure token-count truncation.
 */

export interface MessageImportance {
  index: number;
  score: number;
  factors: string[];
  snippet: string;
}

export interface CompressionResult {
  keptIndices: number[];
  removedIndices: number[];
  summary: string;
  decisions: string[];
  entities: string[];
  topics: string[];
}

const CODE_PATTERNS = [
  /\b(function|class|interface|type|const|let|var|import|export|async|await)\b/,
  /```[\s\S]*?```/,
  /`[^`]+`/,
  /\b(?:ts|js|py|go|rs|java|json|yaml|sql|sh)\b/i,
];

const DECISION_PATTERNS = [
  /\b(decided?|decision|choose|chosen|agreed|confirmed?|approved?|finalized?|settled?)\b/i,
  /\b(will|going to|should|must|need to)\s+\w+/i,
  /\b(action item|next step|todo|plan|approach|strategy)\b/i,
  /\b(✅|✔️|☑️|✓|done|completed?|resolved?|fixed?)\b/,
];

const ENTITY_PATTERNS = [
  /\b(?:claw-ctx|claw-mem|claw|openclaw|gateway|plugin|neoclaw|edith|friday|jarvis)\b/gi,
  /\bv?\d+\.\d+\.\d+\b/g,
  /\b(?:https?:\/\/|www\.)[^\s]+/g,
  /\b(?:[A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g,
  /\b(?:[\w.-]+\.(?:ts|js|py|json|md|yml|yaml))\b/g,
];

const QUESTION_PATTERNS = [
  /\?$/m,
  /\b(what|how|why|when|where|who|which|could you|can you|would you|please)\b.*\?/i,
];

const CODE_BOOST = 30;
const ENTITY_BOOST = 20;
const DECISION_BOOST = 25;
const QUESTION_BOOST = 15;
const DUPLICATE_PENALTY = -20;

function extractText(msg: any): string {
  if (!msg) return "";
  const c = msg.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c.map((b: any) => {
      if (typeof b === "string") return b;
      if (b?.text) return b.text;
      if (b?.thinking) return b.thinking;
      // v5.11.0: L3 - Handle nested tool_use / tool_result content blocks
      if (b?.type === "tool_use") {
        try {
          return JSON.stringify({ tool: b.name, input: b.input });
        } catch {
          return `[tool_use: ${b.name ?? "unknown"}]`;
        }
      }
      if (b?.type === "tool_result") {
        const inner = Array.isArray(b.content)
          ? b.content.map((x: any) => x?.text ?? "").join("")
          : String(b.content ?? "");
        return `[tool_result: ${inner}]`;
      }
      return "";
    }).join(" ").trim();
  }
  return String(c ?? "");
}

function checkPatterns(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text));
}

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  return intersection.size / (wordsA.size + wordsB.size - intersection.size);
}

/**
 * v5.11.0: Set-based Jaccard similarity - avoids re-tokenizing strings
 * when the caller already has a word Set (used by the incremental duplicate
 * detector in scoreImportance).
 */
function jaccardSetSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  let intersection = 0;
  for (const w of smaller) if (larger.has(w)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

/**
 * v5.11.0: Tokenize a message into a Set of lowercased words > 3 chars.
 * Used to share the tokenization result across Jaccard comparisons within
 * the duplicate detection window.
 */
function tokenize(text: string): Set<string> {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  return new Set(words);
}

export interface SemanticCompressorConfig {
  /** Minimum number of newest messages always kept. Default: 20. */
  minKeep?: number;
  /** Sliding window size for near-duplicate detection. Default: 10. */
  duplicateWindowSize?: number;
  /** Jaccard threshold above which a message is flagged as duplicate. Default: 0.7. */
  duplicateThreshold?: number;
}

export class SemanticCompressor {
  private readonly config: Required<SemanticCompressorConfig>;

  constructor(config?: SemanticCompressorConfig) {
    this.config = {
      minKeep: config?.minKeep ?? 20,
      duplicateWindowSize: config?.duplicateWindowSize ?? 10,
      duplicateThreshold: config?.duplicateThreshold ?? 0.7,
    };
  }

  scoreImportance(messages: Array<{ message?: any }>): MessageImportance[] {
    const texts = messages.map((e, i) => ({ index: i, text: extractText(e.message) }));
    const results: MessageImportance[] = [];
    // v5.11.0: L4 - Sliding window of tokenized word Sets, reuses prior
    // tokenization instead of re-splitting strings for each Jaccard check.
    const window = new Map<number, Set<string>>();

    for (let i = 0; i < texts.length; i++) {
      const { index, text } = texts[i];
      let score = 0;
      const factors: string[] = [];

      if (text.length < 5) {
        results.push({ index, score: 0, factors: ["empty"], snippet: text.slice(0, 80) });
        continue;
      }

      if (checkPatterns(text, CODE_PATTERNS)) {
        score += CODE_BOOST;
        factors.push("code");
      }
      if (checkPatterns(text, DECISION_PATTERNS)) {
        score += DECISION_BOOST;
        factors.push("decision");
      }
      if (checkPatterns(text, ENTITY_PATTERNS)) {
        score += ENTITY_BOOST;
        factors.push("entity");
      }
      if (checkPatterns(text, QUESTION_PATTERNS)) {
        score += QUESTION_BOOST;
        factors.push("question");
      }

      // v5.11.0: L4 - Tokenize once per message, reuse via sliding window.
      // Avoids O(n*k) re-tokenization when checking against prior messages.
      const tokens = tokenize(text);
      window.set(i, tokens);
      // Evict entries outside the duplicate window (keeps Map bounded).
      const windowStart = i - this.config.duplicateWindowSize;
      if (windowStart > 0) {
        const evictKey = windowStart - 1;
        if (window.has(evictKey)) window.delete(evictKey);
      }

      // Duplicate penalty: check against previous messages in the window
      for (let j = Math.max(0, i - this.config.duplicateWindowSize); j < i; j++) {
        const prevTokens = window.get(j);
        if (prevTokens && jaccardSetSimilarity(tokens, prevTokens) > this.config.duplicateThreshold) {
          score += DUPLICATE_PENALTY;
          factors.push("duplicate");
          break;
        }
      }

      results.push({ index, score, factors, snippet: text.slice(0, 120) });
    }

    return results;
  }

  extractEntities(messages: Array<{ message?: any }>): string[] {
    const seen = new Set<string>();
    for (const entry of messages) {
      const text = extractText(entry.message);
      for (const pattern of ENTITY_PATTERNS) {
        const matches = text.match(pattern);
        if (matches) for (const m of matches) {
          const normalized = m.toLowerCase();
          if (!seen.has(normalized)) seen.add(normalized);
        }
      }
    }
    return [...seen].slice(0, 20);
  }

  extractDecisions(messages: Array<{ message?: any }>): string[] {
    const decisions: string[] = [];
    for (const entry of messages) {
      const text = extractText(entry.message);
      if (checkPatterns(text, DECISION_PATTERNS)) {
        // Extract the sentence containing the decision marker
        const sentences = text.split(/[.!?\n]+/);
        for (const s of sentences) {
          if (checkPatterns(s, DECISION_PATTERNS) && s.trim().length > 10) {
            decisions.push(s.trim().slice(0, 150));
            if (decisions.length >= 8) return decisions;
          }
        }
      }
    }
    return decisions;
  }

  extractTopics(messages: Array<{ message?: any }>): string[] {
    const keywordSet = new Set([
      "code", "bug", "fix", "deploy", "test", "refactor", "build",
      "config", "error", "performance", "api", "database", "task",
      "version", "release", "review", "compile", "compact", "compaction",
      "context", "token", "memory", "session", "plugin", "gateway",
      "TypeScript", "openclaw", "claw-ctx", "claw-mem", "devclaw",
      "integration", "verification", "design", "architecture",
    ]);
    const topics = new Set<string>();
    for (const entry of messages) {
      const text = extractText(entry.message);
      for (const kw of keywordSet) {
        if (text.toLowerCase().includes(kw.toLowerCase())) topics.add(kw);
      }
    }
    return [...topics].slice(0, 15);
  }

  buildSummary(messages: Array<{ message?: any }>, count: number, decisions: string[], entities: string[], topics: string[]): string {
    // v5.11.0: Compact single-line summary. Omit empty fields to save tokens.
    const parts: string[] = [`[Compacted History - ${count} msgs]`];
    if (topics.length > 0) {
      parts.push(`Topics: ${topics.join(",")}`);
    } else {
      parts.push("Topics: general discussion");
    }
    if (decisions.length > 0) {
      parts.push(`decisions: ${decisions.slice(0, 5).map(d => `"${d}"`).join(";")}`);
    }
    if (entities.length > 0) {
      parts.push(`entities: ${entities.slice(0, 8).join(",")}`);
    }
    return parts.join(" | ");
  }

  compress(
    messages: Array<{ message?: any }>,
    msgTokens: number[],
    targetTokens: number
  ): CompressionResult {
    // v5.11.0: L2 - Explicit empty input short-circuit
    if (!messages || messages.length === 0) {
      return {
        keptIndices: [],
        removedIndices: [],
        summary: "",
        decisions: [],
        entities: [],
        topics: [],
      };
    }
    if (messages.length !== msgTokens.length) {
      throw new Error(
        `Length mismatch: messages=${messages.length} tokens=${msgTokens.length}`,
      );
    }

    const importance = this.scoreImportance(messages);
    const totalMsgs = messages.length;

    // Sort by importance score descending, keep high-scoring messages
    const scored = importance.map(imp => ({ ...imp, tokens: msgTokens[imp.index] || 0 }));

    // Strategy: keep at least minKeep newest messages, then fill budget with
    // high-importance messages from the older portion
    const minKeep = Math.min(this.config.minKeep, totalMsgs);
    const keepSet = new Set<number>();

    // Always keep the newest minKeep messages
    let newestTokens = 0;
    for (let i = totalMsgs - minKeep; i < totalMsgs; i++) {
      keepSet.add(i);
      newestTokens += msgTokens[i] || 0;
    }

    const remainingBudget = targetTokens - newestTokens;

    // Score older messages and pick high-importance ones within budget
    const older = scored.slice(0, totalMsgs - minKeep)
      .filter(s => !keepSet.has(s.index))
      .sort((a, b) => b.score - a.score);

    let usedBudget = 0;
    for (const item of older) {
      if (usedBudget + item.tokens > remainingBudget) continue;
      keepSet.add(item.index);
      usedBudget += item.tokens;
    }

    const keptIndices: number[] = [];
    const removedIndices: number[] = [];
    for (let i = 0; i < totalMsgs; i++) {
      if (keepSet.has(i)) keptIndices.push(i);
      else removedIndices.push(i);
    }

    const removedMsgs = removedIndices.map(i => messages[i]);
    const decisions = this.extractDecisions(messages);
    const entities = this.extractEntities(messages);
    const topics = this.extractTopics(messages);
    const summary = this.buildSummary(removedMsgs, removedIndices.length, decisions, entities, topics);

    return { keptIndices, removedIndices, summary, decisions, entities, topics };
  }
}
