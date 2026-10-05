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

// v6.11.0 P2: screening tables are the single source of truth (P4 metrics).
import {
  CRITICAL_STATE_KEYWORDS,
  NEXT_ACTION_KEYWORDS,
} from "./metrics/optimizer-metrics.js";

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
  /** v6.11.0: three-section breakdown (only when summarySchema="three-section") */
  sections?: SummarySections;
  /** v6.11.0: self-consistency verdict (only when summarySchema="three-section") */
  consistency?: ConsistencyVerdict;
}

// ── v6.11.0 P2: three-section summary schema ────────────────────────────────

export type SummarySchema = "legacy" | "three-section";

export interface SummarySections {
  /** 段1: 已记录的发现/决策/实体 */
  recordedFindings: string;
  /** 段2: 工作区状态 */
  workspaceState: string;
  /** 段3: 下一步动作 */
  nextAction: string;
}

export type ConsistencyVerdict =
  | { status: "pass" }
  | { status: "rejected"; reason: string }
  | { status: "degraded"; reason: string };

export interface SummaryOutput {
  text: string;
  sections: SummarySections;
  consistency: ConsistencyVerdict;
}

/** Completion-state markers (bilingual; bare 「已」matched conservatively below). */
const COMPLETION_WORDS = [
  "done", "completed", "finished", "closed", "resolved",
  "完成", "关闭", "搞定",
];

/** English completion words as word-boundary regexes — otherwise "resolved"
 *  fires inside "unresolved", breaking the degraded-fallback invariant. */
const COMPLETION_EN_RES = ["done", "completed", "finished", "closed", "resolved"]
  .map((w) => new RegExp(`\\b${w}\\b`));

/** Conservative 「已」: only before a completion-ish character (design §4.1). */
const COMPLETION_PATTERNS = [/已(?=[完关成解])/];

/** Unresolved-state markers in workspace state. */
const UNRESOLVED_WORDS = [
  "open", "unresolved", "pending", "blocked", "failing", "todo",
  "未解决", "待", "阻塞", "失败", "未修复",
];

const MAX_SENTENCE_LEN = 160;
const MAX_SENTENCES_PER_SECTION = 2;
const SENTENCE_BOUNDARY_CHARS = ".!?。！？\n";

function boundaryStart(lower: string, i: number): number {
  let j = i;
  let steps = 0;
  while (j > 0 && steps < MAX_SENTENCE_LEN && !SENTENCE_BOUNDARY_CHARS.includes(lower[j - 1])) {
    j--; steps++;
  }
  return j;
}

function boundaryEnd(lower: string, i: number): number {
  let j = i;
  let steps = 0;
  while (j < lower.length && steps < MAX_SENTENCE_LEN && !SENTENCE_BOUNDARY_CHARS.includes(lower[j])) {
    j++; steps++;
  }
  return j;
}

// v6.11.0 perf (design §6.5 CPU pairing <2%): ONE combined lazy pass feeds
// BOTH sections — two full scans of the removed text were the dominant cost
// on large payloads (profile: gate regexes ≈2.5% self-time each).
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const COMBINED_SCAN_RE = new RegExp(
  [...CRITICAL_STATE_KEYWORDS, ...NEXT_ACTION_KEYWORDS].map(escapeRe).join("|"),
  "gi",
);
const STATE_SET = new Set<string>(CRITICAL_STATE_KEYWORDS);

function pickBothSentences(
  text: string,
  lower: string,
): { state: string; action: string } {
  const stateAt = new Set<number>();
  const actionAt = new Set<number>();
  const stateHits: string[] = [];
  const actionHits: string[] = [];

  for (const m of lower.matchAll(COMBINED_SCAN_RE)) {
    if (
      stateHits.length >= MAX_SENTENCES_PER_SECTION &&
      actionHits.length >= MAX_SENTENCES_PER_SECTION
    ) {
      break;
    }
    const isState = STATE_SET.has(m[0].toLowerCase());
    const at = isState ? stateAt : actionAt;
    const hits = isState ? stateHits : actionHits;
    if (hits.length >= MAX_SENTENCES_PER_SECTION) continue;
    const b1 = boundaryStart(lower, m.index);
    if (at.has(b1)) continue;
    const sent = text
      .slice(b1, boundaryEnd(lower, m.index + m[0].length))
      .trim()
      .replace(/^[-•\s]+/, "");
    // dedupe by sentence POSITION, not by text — identical wording at
    // different offsets is still one more sentence (perf + semantics)
    if (!sent || sent.length > MAX_SENTENCE_LEN) continue;
    at.add(b1);
    hits.push(sent);
  }

  return {
    state: stateHits.length > 0 ? stateHits.join("; ") : NONE_RECORDED,
    action: actionHits.length > 0 ? actionHits.join("; ") : NONE_RECORDED,
  };
}

/** R1 (design-review 2026-10-05): placeholder must NOT contain any
 *  NEXT_ACTION_KEYWORDS entry — otherwise the sentinel sample is swallowed
 *  by its own screening table and missingNextActionPct reads low. */
const NONE_RECORDED = "(none recorded)";

/** R2(a) (design-review 2026-10-05): degraded fallback keeps the
 *  "always lands a next step" promise (contains table word "next step"). */
const DEGRADED_NEXT_ACTION = "Next step: resolve unresolved items";

function matchesAny(text: string, words: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w));
}

function isCompletion(text: string): boolean {
  const lower = text.toLowerCase();
  const cn = COMPLETION_WORDS.filter((w) => !/^[a-z]/i.test(w));
  return (
    COMPLETION_EN_RES.some((p) => p.test(lower)) ||
    cn.some((w) => lower.includes(w)) ||
    COMPLETION_PATTERNS.some((p) => p.test(text))
  );
}

function isUnresolved(text: string): boolean {
  return matchesAny(text, UNRESOLVED_WORDS);
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

// Entity-name recognition keywords for natural-language extraction (not dependencies).
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
  /** v6.11.0 P2: summary schema. Default "legacy" = v6.10.4 byte-equal. */
  summarySchema?: SummarySchema;
}

export class SemanticCompressor {
  private readonly config: Required<SemanticCompressorConfig>;

  constructor(config?: SemanticCompressorConfig) {
    this.config = {
      minKeep: config?.minKeep ?? 20,
      duplicateWindowSize: config?.duplicateWindowSize ?? 10,
      duplicateThreshold: config?.duplicateThreshold ?? 0.7,
      summarySchema: config?.summarySchema ?? "legacy",
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

  /**
   * v6.11.0 P2: three-section summary with self-consistency state machine
   * (design §2.1/§4.2). Pure local keyword screening — no LLM calls.
   */
  buildSummarySections(
    messages: Array<{ message?: any }>,
    count: number,
    decisions: string[],
    entities: string[],
    topics: string[]
  ): SummaryOutput {
    const findingsParts: string[] = [];
    findingsParts.push(
      topics.length > 0 ? `topics: ${topics.slice(0, 5).join(",")}` : "general discussion"
    );
    if (decisions.length > 0) {
      findingsParts.push(`decisions: ${decisions.slice(0, 5).map((d) => `"${d}"`).join(";")}`);
    }
    if (entities.length > 0) {
      findingsParts.push(`entities: ${entities.slice(0, 8).join(",")}`);
    }
    const recordedFindings = findingsParts.join("; ");

    const removedText = messages
      .map((m) => extractText(m?.message))
      .join("\n");
    const removedLower = removedText.toLowerCase();
    const picked = pickBothSentences(removedText, removedLower);

    let sections: SummarySections = {
      recordedFindings,
      workspaceState: picked.state,
      nextAction: picked.action,
    };

    // Self-consistency state machine (design §4.2): at most one rejection,
    // then a degraded fallback that always passes.
    let consistency: ConsistencyVerdict = { status: "pass" };
    if (isCompletion(sections.nextAction) && isUnresolved(sections.workspaceState)) {
      // Rejection #1: re-pick Next Action prefixed with the unresolved线索
      const regenerated: SummarySections = {
        ...sections,
        nextAction: `Revisit: ${sections.workspaceState}`,
      };
      if (isCompletion(regenerated.nextAction) && isUnresolved(regenerated.workspaceState)) {
        sections = { ...regenerated, nextAction: DEGRADED_NEXT_ACTION };
        consistency = {
          status: "degraded",
          reason: "completion-marked next action with unresolved state persisted after one regeneration",
        };
      } else {
        sections = regenerated;
        consistency = {
          status: "rejected",
          reason: "completion-marked next action with unresolved state; regenerated once",
        };
      }
    }

    const text =
      `[Compacted History - ${count} msgs] ` +
      `Recorded Findings: ${sections.recordedFindings} | ` +
      `Workspace State: ${sections.workspaceState} | ` +
      `Next Action: ${sections.nextAction}`;

    return { text, sections, consistency };
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

    // v6.11.0 P2: schema branch — default legacy stays byte-equal
    if (this.config.summarySchema === "three-section") {
      const out = this.buildSummarySections(
        removedMsgs, removedIndices.length, decisions, entities, topics
      );
      return {
        keptIndices, removedIndices,
        summary: out.text, decisions, entities, topics,
        sections: out.sections,
        consistency: out.consistency,
      };
    }

    const summary = this.buildSummary(removedMsgs, removedIndices.length, decisions, entities, topics);

    return { keptIndices, removedIndices, summary, decisions, entities, topics };
  }
}
