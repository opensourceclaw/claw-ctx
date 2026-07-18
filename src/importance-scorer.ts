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
 * claw-ctx v5.10.0 — Importance Scorer
 *
 * Parallel importance scoring and incremental compression for
 * memory-efficient context management.
 */

import type { MessageImportance, CompressionResult } from "./semantic-compressor.js";

// ── Pre-compiled Patterns ───────────────────────────────────────────

const CODE_PATTERNS: RegExp[] = [
  /\b(function|class|interface|type|const|let|var|import|export|async|await)\b/,
  /```[\s\S]*?```/,
  /`[^`]+`/,
  /\b(?:ts|js|py|go|rs|java|json|yaml|sql|sh)\b/i,
];

const DECISION_PATTERNS: RegExp[] = [
  /\b(decided?|decision|choose|chosen|agreed|confirmed?|approved?|finalized?|settled?)\b/i,
  /\b(will|going to|should|must|need to)\s+\w+/i,
  /\b(action item|next step|todo|plan|approach|strategy)\b/i,
  /\b(✅|✔️|☑️|✓|done|completed?|resolved?|fixed?)\b/,
];

const ENTITY_PATTERNS: RegExp[] = [
  /\b(?:claw-ctx|claw-mem|claw|openclaw|gateway|plugin|neoclaw|edith|friday|jarvis)\b/gi,
  /\bv?\d+\.\d+\.\d+\b/g,
  /\b(?:https?:\/\/|www\.)[^\s]+/g,
  /\b(?:[A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g,
  /\b(?:[\w.-]+\.(?:ts|js|py|json|md|yml|yaml))\b/g,
];

const QUESTION_PATTERNS: RegExp[] = [
  /\?$/m,
  /\b(what|how|why|when|where|who|which|could you|can you|would you|please)\b.*\?/i,
];

const CODE_BOOST = 30;
const ENTITY_BOOST = 20;
const DECISION_BOOST = 25;
const QUESTION_BOOST = 15;
const DUPLICATE_PENALTY = -20;

// ── Helpers ─────────────────────────────────────────────────────────

function extractText(msg: unknown): string {
  if (!msg) return "";
  const c = (msg as { content?: unknown }).content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((b: unknown) =>
        typeof b === "string" ? b : (b as { text?: string; thinking?: string })?.text ?? (b as { text?: string; thinking?: string })?.thinking ?? ""
      )
      .join(" ");
  }
  return String(c ?? "");
}

function checkPatterns(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = new Set([...wordsA].filter((x) => wordsB.has(x)));
  return intersection.size / (wordsA.size + wordsB.size - intersection.size);
}

// ── ImportanceScorer ────────────────────────────────────────────────

export interface ScorerConfig {
  batchSize: number;
  duplicateWindow: number;
}

export const DEFAULT_SCORER_CONFIG: ScorerConfig = {
  batchSize: 50,
  duplicateWindow: 10,
};

/**
 * Optimized importance scorer with parallel processing.
 * Pre-compiles patterns for efficient reuse.
 */
export class ImportanceScorer {
  private compiledPatterns: Map<string, RegExp[]>;
  private config: ScorerConfig;

  constructor(config: Partial<ScorerConfig> = {}) {
    this.config = { ...DEFAULT_SCORER_CONFIG, ...config };
    // Pre-compile all patterns once
    this.compiledPatterns = new Map([
      ["code", CODE_PATTERNS],
      ["decision", DECISION_PATTERNS],
      ["entity", ENTITY_PATTERNS],
      ["question", QUESTION_PATTERNS],
    ]);
  }

  /**
   * Score messages in parallel using async batching.
   * Non-blocking to avoid starving the event loop.
   */
  async scoreBatch(
    messages: Array<{ message?: unknown }>,
    onProgress?: (progress: number) => void
  ): Promise<MessageImportance[]> {
    const results: MessageImportance[] = new Array(messages.length);
    const texts = messages.map((e) => extractText(e.message));
    let processed = 0;

    const processChunk = (): Promise<void> => {
      return new Promise((resolve) => {
        const end = Math.min(processed + this.config.batchSize, messages.length);

        for (let i = processed; i < end; i++) {
          results[i] = this.scoreOne(texts, i);
        }

        processed = end;
        onProgress?.(processed / messages.length);

        if (processed < messages.length) {
          setImmediate(() => resolve(processChunk()));
        } else {
          resolve();
        }
      });
    };

    await processChunk();
    return results;
  }

  /**
   * Score messages synchronously (for simpler use cases).
   */
  scoreSync(messages: Array<{ message?: unknown }>): MessageImportance[] {
    const texts = messages.map((e) => extractText(e.message));
    return texts.map((_, i) => this.scoreOne(texts, i));
  }

  /**
   * Score a single message.
   */
  private scoreOne(texts: string[], index: number): MessageImportance {
    const text = texts[index];
    let score = 0;
    const factors: string[] = [];

    if (text.length < 5) {
      return { index, score: 0, factors: ["empty"], snippet: text.slice(0, 80) };
    }

    if (checkPatterns(text, this.compiledPatterns.get("code")!)) {
      score += CODE_BOOST;
      factors.push("code");
    }
    if (checkPatterns(text, this.compiledPatterns.get("decision")!)) {
      score += DECISION_BOOST;
      factors.push("decision");
    }
    if (checkPatterns(text, this.compiledPatterns.get("entity")!)) {
      score += ENTITY_BOOST;
      factors.push("entity");
    }
    if (checkPatterns(text, this.compiledPatterns.get("question")!)) {
      score += QUESTION_BOOST;
      factors.push("question");
    }

    // Duplicate penalty: check against previous messages
    const windowStart = Math.max(0, index - this.config.duplicateWindow);
    for (let j = windowStart; j < index; j++) {
      if (jaccardSimilarity(text, texts[j]) > 0.7) {
        score += DUPLICATE_PENALTY;
        factors.push("duplicate");
        break;
      }
    }

    return { index, score, factors, snippet: text.slice(0, 120) };
  }

  /**
   * Get compiled patterns (for testing/debugging).
   */
  getPatterns(): Map<string, RegExp[]> {
    return this.compiledPatterns;
  }
}

// ── IncrementalCompressor ───────────────────────────────────────────

export interface IncrementalConfig {
  chunkSize: number;
  minKeep: number;
}

export const DEFAULT_INCREMENTAL_CONFIG: IncrementalConfig = {
  chunkSize: 100,
  minKeep: 20,
};

export interface CompressionChunk {
  keptIndices: number[];
  removedIndices: number[];
  tokensUsed: number;
  summary: string;
}

/**
 * Incremental compressor that processes messages in chunks.
 * Avoids memory spikes by processing incrementally.
 */
export class IncrementalCompressor {
  private scorer: ImportanceScorer;
  private config: IncrementalConfig;

  constructor(config: Partial<IncrementalConfig> = {}) {
    this.config = { ...DEFAULT_INCREMENTAL_CONFIG, ...config };
    this.scorer = new ImportanceScorer();
  }

  /**
   * Compress large message history incrementally.
   * Avoids memory spikes by processing in chunks.
   */
  async compressIncremental(
    messages: Array<{ message?: unknown }>,
    msgTokens: number[],
    targetTokens: number,
    onProgress?: (progress: number) => void
  ): Promise<CompressionResult> {
    const chunks = this.chunkMessages(messages, this.config.chunkSize);
    let totalProcessed = 0;
    let accumulated = this.emptyResult();
    let remainingBudget = targetTokens;

    for (const chunk of chunks) {
      const chunkResult = await this.compressChunk(
        chunk.messages,
        msgTokens.slice(chunk.startIndex, chunk.endIndex),
        remainingBudget,
        chunk.startIndex
      );

      // Calculate tokens used from kept indices
      let chunkTokensUsed = 0;
      for (const idx of chunkResult.keptIndices) {
        chunkTokensUsed += msgTokens[idx] || 0;
      }

      accumulated = this.mergeResults(accumulated, chunkResult);
      remainingBudget -= chunkTokensUsed;
      totalProcessed += chunk.messages.length;
      onProgress?.(totalProcessed / messages.length);

      // Yield to event loop
      await new Promise((resolve) => setImmediate(resolve));
    }

    return accumulated;
  }

  /**
   * Compress synchronously (for smaller message sets).
   */
  compressSync(
    messages: Array<{ message?: unknown }>,
    msgTokens: number[],
    targetTokens: number
  ): CompressionResult {
    const importance = this.scorer.scoreSync(messages);
    return this.selectMessages(messages, msgTokens, importance, targetTokens, 0);
  }

  /**
   * Split messages into chunks.
   */
  private chunkMessages(
    messages: Array<{ message?: unknown }>,
    size: number
  ): Array<{ messages: Array<{ message?: unknown }>; startIndex: number; endIndex: number }> {
    const chunks: Array<{
      messages: Array<{ message?: unknown }>;
      startIndex: number;
      endIndex: number;
    }> = [];

    for (let i = 0; i < messages.length; i += size) {
      const end = Math.min(i + size, messages.length);
      chunks.push({
        messages: messages.slice(i, end),
        startIndex: i,
        endIndex: end,
      });
    }

    return chunks;
  }

  /**
   * Compress a single chunk.
   */
  private async compressChunk(
    messages: Array<{ message?: unknown }>,
    chunkTokens: number[],
    budget: number,
    offset: number
  ): Promise<CompressionResult> {
    const importance = await this.scorer.scoreBatch(messages);
    return this.selectMessages(messages, chunkTokens, importance, budget, offset);
  }

  /**
   * Select messages to keep based on importance and budget.
   */
  private selectMessages(
    messages: Array<{ message?: unknown }>,
    msgTokens: number[],
    importance: MessageImportance[],
    budget: number,
    offset: number
  ): CompressionResult {
    const totalMsgs = messages.length;
    const minKeep = Math.min(this.config.minKeep, totalMsgs);
    const keepSet = new Set<number>();

    // Always keep the newest minKeep messages
    let newestTokens = 0;
    for (let i = totalMsgs - minKeep; i < totalMsgs; i++) {
      keepSet.add(i + offset);
      newestTokens += msgTokens[i] || 0;
    }

    const remainingBudget = budget - newestTokens;

    // Score older messages and pick high-importance ones within budget
    const scored = importance
      .map((imp, i) => ({ ...imp, tokens: msgTokens[i] || 0, actualIndex: i + offset }))
      .filter((s) => !keepSet.has(s.actualIndex))
      .slice(0, totalMsgs - minKeep)
      .sort((a, b) => b.score - a.score);

    let usedBudget = 0;
    for (const item of scored) {
      if (usedBudget + item.tokens > remainingBudget) continue;
      keepSet.add(item.actualIndex);
      usedBudget += item.tokens;
    }

    const keptIndices: number[] = [];
    const removedIndices: number[] = [];
    for (let i = 0; i < totalMsgs; i++) {
      if (keepSet.has(i + offset)) {
        keptIndices.push(i + offset);
      } else {
        removedIndices.push(i + offset);
      }
    }

    // Extract summary info
    const decisions = this.extractDecisions(messages);
    const entities = this.extractEntities(messages);
    const topics = this.extractTopics(messages);
    const summary = this.buildSummary(removedIndices.length, decisions, entities, topics);

    return { keptIndices, removedIndices, summary, decisions, entities, topics };
  }

  /**
   * Merge two compression results.
   */
  private mergeResults(a: CompressionResult, b: CompressionResult): CompressionResult {
    return {
      keptIndices: [...a.keptIndices, ...b.keptIndices],
      removedIndices: [...a.removedIndices, ...b.removedIndices],
      summary: a.summary + "\n" + b.summary,
      decisions: [...new Set([...a.decisions, ...b.decisions])],
      entities: [...new Set([...a.entities, ...b.entities])],
      topics: [...new Set([...a.topics, ...b.topics])],
    };
  }

  /**
   * Create empty result.
   */
  private emptyResult(): CompressionResult {
    return {
      keptIndices: [],
      removedIndices: [],
      summary: "",
      decisions: [],
      entities: [],
      topics: [],
    };
  }

  /**
   * Extract decisions from messages.
   */
  private extractDecisions(messages: Array<{ message?: unknown }>): string[] {
    const decisions: string[] = [];
    for (const entry of messages) {
      const text = extractText(entry.message);
      if (checkPatterns(text, DECISION_PATTERNS)) {
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

  /**
   * Extract entities from messages.
   */
  private extractEntities(messages: Array<{ message?: unknown }>): string[] {
    const seen = new Set<string>();
    for (const entry of messages) {
      const text = extractText(entry.message);
      for (const pattern of ENTITY_PATTERNS) {
        const matches = text.match(pattern);
        if (matches) {
          for (const m of matches) {
            const normalized = m.toLowerCase();
            if (!seen.has(normalized)) seen.add(normalized);
          }
        }
      }
    }
    return [...seen].slice(0, 20);
  }

  /**
   * Extract topics from messages.
   */
  private extractTopics(messages: Array<{ message?: unknown }>): string[] {
    const keywordSet = new Set([
      "code",
      "bug",
      "fix",
      "deploy",
      "test",
      "refactor",
      "build",
      "config",
      "error",
      "performance",
      "api",
      "database",
      "task",
      "version",
      "release",
      "review",
      "compile",
      "compact",
      "compaction",
      "context",
      "token",
      "memory",
      "session",
      "plugin",
      "gateway",
      "TypeScript",
      "openclaw",
      "claw-ctx",
      "claw-mem",
      "devclaw",
      "integration",
      "verification",
      "design",
      "architecture",
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

  /**
   * Build summary for removed messages.
   */
  private buildSummary(
    removedCount: number,
    decisions: string[],
    entities: string[],
    topics: string[]
  ): string {
    const topicStr = topics.length > 0 ? topics.join(", ") : "general discussion";
    const decisionStr =
      decisions.length > 0
        ? `\nKey decisions: ${decisions.map((d) => `"${d}"`).join("; ")}`
        : "";
    const entityStr =
      entities.length > 0 ? `\nReferenced entities: ${entities.slice(0, 10).join(", ")}` : "";

    return `[Compacted History — ${removedCount} earlier messages summarized]
Topics: ${topicStr}${decisionStr}${entityStr}`;
  }
}

// ── StreamingCompressor ──────────────────────────────────────────────

/**
 * Memory-efficient compression using generators.
 * Streams messages through compression pipeline.
 */
export class StreamingCompressor {
  private chunkSize: number;

  constructor(chunkSize: number = 100) {
    this.chunkSize = chunkSize;
  }

  /**
   * Stream messages through compression pipeline.
   * Uses generators to avoid loading all messages into memory.
   */
  *compressStream(
    messages: Generator<{ message?: unknown }>,
    tokenBudget: number
  ): Generator<CompressionChunk> {
    let budget = tokenBudget;
    const buffer: Array<{ message?: unknown }> = [];

    for (const msg of messages) {
      buffer.push(msg);

      if (buffer.length >= this.chunkSize) {
        const chunk = this.processBuffer(buffer, budget);
        budget -= chunk.tokensUsed;
        yield chunk;
        // Keep last 20 for context continuity
        buffer.length = 0;
      }
    }

    // Process remaining
    if (buffer.length > 0) {
      yield this.processBuffer(buffer, budget);
    }
  }

  /**
   * Process a buffer of messages.
   */
  private processBuffer(
    buffer: Array<{ message?: unknown }>,
    budget: number
  ): CompressionChunk {
    // Simple implementation: keep all within budget
    const keptIndices: number[] = [];
    const removedIndices: number[] = [];
    let tokensUsed = 0;

    // For streaming, we estimate tokens
    for (let i = 0; i < buffer.length; i++) {
      const text = extractText(buffer[i].message);
      const estimatedTokens = Math.ceil(text.length / 4); // rough estimate

      if (tokensUsed + estimatedTokens <= budget * 0.9) {
        keptIndices.push(i);
        tokensUsed += estimatedTokens;
      } else {
        removedIndices.push(i);
      }
    }

    return {
      keptIndices,
      removedIndices,
      tokensUsed,
      summary: `[Streamed chunk: ${keptIndices.length} kept, ${removedIndices.length} removed]`,
    };
  }
}

// ── Singleton Instances ─────────────────────────────────────────────

let globalScorer: ImportanceScorer | null = null;
let globalCompressor: IncrementalCompressor | null = null;

/**
 * Get the global importance scorer instance.
 */
export function getImportanceScorer(): ImportanceScorer {
  if (!globalScorer) {
    globalScorer = new ImportanceScorer();
  }
  return globalScorer;
}

/**
 * Get the global incremental compressor instance.
 */
export function getIncrementalCompressor(): IncrementalCompressor {
  if (!globalCompressor) {
    globalCompressor = new IncrementalCompressor();
  }
  return globalCompressor;
}

/**
 * Reset singleton instances.
 */
export function resetScorerInstances(): void {
  globalScorer = null;
  globalCompressor = null;
}
