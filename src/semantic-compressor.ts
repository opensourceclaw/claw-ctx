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
  if (Array.isArray(c)) return c.map((b: any) => typeof b === "string" ? b : b?.text ?? b?.thinking ?? "").join(" ");
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

export class SemanticCompressor {
  private minKeep = 20;

  scoreImportance(messages: Array<{ message?: any }>): MessageImportance[] {
    const texts = messages.map((e, i) => ({ index: i, text: extractText(e.message) }));
    const results: MessageImportance[] = [];

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

      // Duplicate penalty: check against previous messages
      for (let j = Math.max(0, i - 10); j < i; j++) {
        if (jaccardSimilarity(text, texts[j].text) > 0.7) {
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
    const topicStr = topics.length > 0 ? topics.join(", ") : "general discussion";
    const decisionStr = decisions.length > 0
      ? `\nKey decisions: ${decisions.map(d => `"${d}"`).join("; ")}`
      : "";
    const entityStr = entities.length > 0
      ? `\nReferenced entities: ${entities.slice(0, 10).join(", ")}`
      : "";

    return `[Compacted History — ${count} earlier messages summarized]
Topics: ${topicStr}${decisionStr}${entityStr}

Continue with the current task using the remaining recent context below.`;
  }

  compress(
    messages: Array<{ message?: any }>,
    msgTokens: number[],
    targetTokens: number
  ): CompressionResult {
    const importance = this.scoreImportance(messages);
    const totalMsgs = messages.length;

    // Sort by importance score descending, keep high-scoring messages
    const scored = importance.map(imp => ({ ...imp, tokens: msgTokens[imp.index] || 0 }));

    // Strategy: keep at least minKeep newest messages, then fill budget with
    // high-importance messages from the older portion
    const minKeep = Math.min(this.minKeep, totalMsgs);
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
