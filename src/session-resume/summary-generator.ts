/**
 * claw-ctx session-resume module — Summary Generator
 *
 * Pure rule-based (NO LLM) summary generation from messages or SessionState.
 * v1.0.0: Initial implementation
 */

import type { SessionSummary } from "./types.js";

// Reuse existing SessionState types
import type { SessionState } from "../session-state-extractor.js";

// ── Stop words ──────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "that", "this", "it", "be",
  "has", "have", "do", "does", "did", "will", "would", "can", "could",
  "should", "may", "might", "shall", "not", "no", "yes", "but", "or",
  "and", "if", "so", "about", "just", "like", "get", "got", "use", "used",
  "using", "make", "made", "want", "need", "know", "think", "see", "say",
  "let", "way", "also", "well", "even", "still", "already", "yet",
]);

// ── CJK support ─────────────────────────────────────────────────────

/** Check if text contains CJK characters. */
function hasCJK(text: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(text);
}

/** Extract CJK bigrams from text for keyword analysis. */
function extractCJKBigrams(text: string): string[] {
  // Keep only CJK characters
  const chars = text.replace(/[^\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, "");
  if (chars.length < 2) return chars.length === 1 ? [chars] : [];
  const bigrams: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) {
    bigrams.push(chars.slice(i, i + 2));
  }
  return bigrams;
}

/** CJK stop words (common Chinese characters that add little meaning). */
const CJK_STOP = new Set([
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人",
  "都", "一", "个", "上", "也", "很", "到", "说", "要", "去",
  "你", "会", "着", "没", "看", "好", "自己", "这", "他", "她",
  "它", "们", "那", "些", "来", "出", "过", "对", "把", "被",
  "让", "给", "向", "从", "以", "为", "能", "做", "等", "可以",
  "如果", "因为", "所以", "但是", "而且", "虽然", "然后", "或者",
  "还是", "已经", "没有", "什么", "怎么", "怎样", "这个", "那个",
]);

/** Check if a CJK bigram is meaningful (not a stop pair). */
function isMeaningfulBigram(bigram: string): boolean {
  if (bigram.length !== 2) return false;
  // Skip if either character is a stop character
  for (const ch of bigram) {
    if (CJK_STOP.has(ch)) return false;
  }
  return true;
}

// ── Regex patterns ──────────────────────────────────────────────────

const PENDING_TASK_PATTERNS = [
  /\b(todo|to.?do|TODO)\b[^.!?\n]*/gi,
  /\b(next|next.?step|next.?action)\b[^.!?\n]*/gi,
  /\b(bug|bugs|fix|fixes|fixed)\b[^.!?\n]*/gi,
  /\b(need to|needs? to|must|should|have to)\b[^.!?\n]*/gi,
  /\b(remaining|left to do|outstanding|pending)\b[^.!?\n]*/gi,
  /\b(issue|issues|problem|problems|blocker|blockers)\b[^.!?\n]*/gi,
];

/** CJK-specific pending task patterns (no \b word boundary). */
const CJK_TASK_PATTERNS = [
  /(需要|要|必须|得|还得|还要|应该|记得).{0,30}[，。；\n]/gi,
  /(修复|解决|处理|完成|实现|添加|更新|删除|重构|优化).{0,30}[，。；\n]/gi,
  /(TODO|FIXME|HACK|XXX|BUG).{0,60}/gi,
  /(问题|缺陷|bug|漏洞|阻塞|阻碍|障碍).{0,30}[，。；\n]/gi,
  /(下一步|接下来|后续).{0,30}[，。；\n]/gi,
];

const KEY_POINT_PATTERNS = [
  /\b(decided|decision|concluded|agreed|confirmed|finalized|chosen|settled)\b[^.!?\n]*/gi,
  /\b(important|critical|key|crucial|significant|notable)\b[^.!?\n]*/gi,
  /\b(note|notes|noted|noteworthy)\b[^.!?\n]*/gi,
  /\b(learned|learnt|lesson|takeaway|insight)\b[^.!?\n]*/gi,
  /\b(summary|overview|recap|key.?point|highlight)\b[^.!?\n]*/gi,
];

/** CJK-specific key point patterns. */
const CJK_POINT_PATTERNS = [
  /(决定|确认|同意|选择|采纳|定稿|确定).{0,30}[，。；\n]/gi,
  /(重要|关键|核心|重点|必须注意|值得注意).{0,30}[，。；\n]/gi,
  /(总结|概述|要点|笔记|提示|注意).{0,30}[，。；\n]/gi,
  /(学到|收获|心得|教训|启示).{0,30}[，。；\n]/gi,
  /(变更|变化|修改|调整).{0,30}[，。；\n]/gi,
];

// ── Helpers ─────────────────────────────────────────────────────────

const SENTENCE_END = /[.!?\n\u3002\uff01\uff1f]/;

/** Extract the containing sentence for a match. Supports CJK sentence endings. */
function extractSentence(text: string, matchIndex: number): string {
  // Find last sentence boundary before match
  const dotBefore = text.lastIndexOf(".", matchIndex);
  const cjkBefore = text.lastIndexOf("\u3002", matchIndex);
  const newlineBefore = text.lastIndexOf("\n", matchIndex);
  const start = Math.max(dotBefore, cjkBefore, newlineBefore);
  // Find next sentence boundary after match
  const afterMatch = text.slice(matchIndex).search(SENTENCE_END);
  const end = afterMatch === -1 ? text.length : matchIndex + afterMatch + 1;
  return text.slice(start === -1 ? 0 : start + 1, end).trim();
}

/** Tokenize text into words, filtering stop words and short words. Supports CJK via bigrams. */
function tokenize(text: string): string[] {
  const words: string[] = [];

  // Latin/ASCII words
  const latinWords = text.toLowerCase().split(/[^a-zA-Z0-9]+/).filter(Boolean);
  for (const w of latinWords) {
    if (w.length >= 3 && !STOP_WORDS.has(w)) words.push(w);
  }

  // CJK bigrams
  const bigrams = extractCJKBigrams(text);
  for (const bg of bigrams) {
    if (isMeaningfulBigram(bg)) words.push(bg);
  }

  return words;
}

/** Extract top N keywords by frequency. CJK bigrams use threshold 1 (more specific). */
function extractKeywords(text: string, maxKeywords: number): string[] {
  const words = tokenize(text);
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  // CJK bigrams need only 1 mention; Latin words need at least 2
  const hasCjk = hasCJK(text);
  const minFreq = hasCjk ? 1 : 2;
  return [...freq.entries()]
    .filter(([, count]) => count >= minFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

/** Extract matches from patterns, deduplicate, limit. Supports CJK with relaxed min length. */
function extractByPatterns(
  text: string,
  patterns: RegExp[],
  maxResults: number,
): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  const cjk = hasCJK(text);
  const minLen = cjk ? 8 : 15;

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const sentence = extractSentence(text, match.index);
      const key = sentence.toLowerCase().trim();
      if (key.length >= minLen && !seen.has(key)) {
        seen.add(key);
        results.push(sentence.length > 120 ? sentence.slice(0, 117) + "..." : sentence);
        if (results.length >= maxResults) return results;
      }
    }
  }
  return results;
}

/** Extract top entity names from SessionState. */
function extractEntityNames(state: SessionState, max: number): string[] {
  return state.entities
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, max)
    .map((e) => e.name);
}

// ── SummaryGenerator ────────────────────────────────────────────────

export class SummaryGenerator {
  private _maxKeywords: number;
  private _maxTasks: number;
  private _maxPoints: number;

  constructor(config?: { maxKeywords?: number; maxTasks?: number; maxPoints?: number }) {
    this._maxKeywords = config?.maxKeywords ?? 5;
    this._maxTasks = config?.maxTasks ?? 5;
    this._maxPoints = config?.maxPoints ?? 5;
  }

  /**
   * Generate a SessionSummary from raw messages.
   * Optionally augment with an existing SessionState.
   */
  generate(
    messages: Array<{ role?: string; content: string }>,
    sessionId: string,
    sessionState?: SessionState | null,
  ): SessionSummary {
    const text = messages.map((m) => m.content).join("\n");
    const now = Date.now();

    // Theme extraction: keyword frequency
    const keywords = extractKeywords(text, this._maxKeywords);

    // Augment with SessionState topics if available
    let theme: string;
    if (keywords.length > 0) {
      const topicWords = sessionState?.topics
        ?.sort((a, b) => b.weight - a.weight)
        .slice(0, 2)
        .map((t) => t.label) ?? [];
      const allWords = [...keywords, ...topicWords];
      // Deduplicate while preserving order
      const uniqueWords = [...new Set(allWords)];
      theme = uniqueWords.join(", ");
    } else if (sessionState?.topics && sessionState.topics.length > 0) {
      theme = sessionState.topics
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3)
        .map((t) => t.label)
        .join(", ");
    } else {
      theme = "General discussion";
    }

    // Pending tasks extraction
    const hasCjk = hasCJK(text);
    const taskPatterns = hasCjk
      ? [...PENDING_TASK_PATTERNS, ...CJK_TASK_PATTERNS]
      : PENDING_TASK_PATTERNS;
    const pendingTasks = extractByPatterns(text, taskPatterns, this._maxTasks);

    // Also extract from SessionState decisions with user/team actor
    if (sessionState) {
      for (const d of sessionState.decisions) {
        if (
          (d.actor === "user" || d.actor === "team") &&
          d.confidence >= 0.6 &&
          pendingTasks.length < this._maxTasks
        ) {
          const task = d.description.length > 120
            ? d.description.slice(0, 117) + "..."
            : d.description;
          if (!pendingTasks.some((t) => t.toLowerCase() === task.toLowerCase())) {
            pendingTasks.push(task);
          }
        }
      }
    }

    // Key points extraction
    const pointPatterns = hasCjk
      ? [...KEY_POINT_PATTERNS, ...CJK_POINT_PATTERNS]
      : KEY_POINT_PATTERNS;
    const keyPoints = extractByPatterns(text, pointPatterns, this._maxPoints);

    // Also extract from SessionState decisions with high confidence
    if (sessionState) {
      for (const d of sessionState.decisions) {
        if (d.confidence >= 0.7 && keyPoints.length < this._maxPoints) {
          const point = d.description.length > 120
            ? d.description.slice(0, 117) + "..."
            : d.description;
          if (!keyPoints.some((p) => p.toLowerCase() === point.toLowerCase())) {
            keyPoints.push(point);
          }
        }
      }
    }

    // Entities
    const entities = sessionState
      ? extractEntityNames(sessionState, 5)
      : [];

    return {
      theme,
      pendingTasks,
      keyPoints,
      timestamp: now,
      sessionId,
      messageCount: messages.length,
      entities,
    };
  }

  /**
   * Generate a SessionSummary from an already-extracted SessionState.
   */
  generateFromState(
    state: SessionState,
    messages: Array<{ role?: string; content: string }>,
  ): SessionSummary {
    const text = messages.map((m) => m.content).join("\n");

    // Theme from topics
    const theme = state.topics.length > 0
      ? state.topics.sort((a, b) => b.weight - a.weight).slice(0, 3).map((t) => t.label).join(", ")
      : "General discussion";

    // Pending tasks from decisions (user/team)
    const pendingTasks = state.decisions
      .filter((d) => (d.actor === "user" || d.actor === "team") && d.confidence >= 0.6)
      .slice(0, this._maxTasks)
      .map((d) => d.description.length > 120 ? d.description.slice(0, 117) + "..." : d.description);

    // Key points from decisions (high confidence)
    const keyPoints = state.decisions
      .filter((d) => d.confidence >= 0.7)
      .slice(0, this._maxPoints)
      .map((d) => d.description.length > 120 ? d.description.slice(0, 117) + "..." : d.description);

    // Supplement with pattern-based extraction from raw text
    const hasCjk = hasCJK(text);
    const taskPats = hasCjk ? [...PENDING_TASK_PATTERNS, ...CJK_TASK_PATTERNS] : PENDING_TASK_PATTERNS;
    const taskPatterns = extractByPatterns(text, taskPats, this._maxTasks);
    for (const t of taskPatterns) {
      if (!pendingTasks.some((p) => p.toLowerCase() === t.toLowerCase())) {
        pendingTasks.push(t);
      }
    }
    const pointPats = hasCjk ? [...KEY_POINT_PATTERNS, ...CJK_POINT_PATTERNS] : KEY_POINT_PATTERNS;
    const pointPatterns = extractByPatterns(text, pointPats, this._maxPoints);
    for (const p of pointPatterns) {
      if (!keyPoints.some((k) => k.toLowerCase() === p.toLowerCase())) {
        keyPoints.push(p);
      }
    }

    return {
      theme,
      pendingTasks: pendingTasks.slice(0, this._maxTasks),
      keyPoints: keyPoints.slice(0, this._maxPoints),
      timestamp: Date.now(),
      sessionId: state.sessionId,
      messageCount: state.messageCount,
      entities: extractEntityNames(state, 5),
    };
  }
}
