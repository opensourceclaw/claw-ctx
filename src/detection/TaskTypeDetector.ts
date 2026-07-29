/**
 * claw-ctx v5.17.0 — Task Type Detector
 * Keyword-based detection for categorizing user queries.
 */

import { ContextTaskType } from "../context/ContextBudgetManager.js";

const KEYWORD_MAP: Record<ContextTaskType, string[]> = {
  [ContextTaskType.SIMPLE_LOOKUP]:     ["find", "search", "get", "retrieve", "lookup", "show", "what is", "where is"],
  [ContextTaskType.MULTI_LOOKUP]:      ["list all", "find all", "count all", "sum all", "all of", "every"],
  [ContextTaskType.SUMMARIZATION]:     ["summarize", "overview", "summary", "brief", "tldr", "synopsis"],
  [ContextTaskType.COMPLEX_REASONING]: ["analyze", "compare", "sort", "rank", "prioritize", "evaluate", "why", "how", "explain", "reason"],
};

interface Message {
  role: string;
  content: string;
}

export class ContextTaskDetector {
  detectTaskType(query: string): ContextTaskType {
    const lower = query.toLowerCase();
    const scores = new Map<ContextTaskType, number>();

    for (const [type, keywords] of Object.entries(KEYWORD_MAP)) {
      let score = 0;
      for (const keyword of keywords) {
        if (lower.includes(keyword)) score++;
      }
      scores.set(type as ContextTaskType, score);
    }

    let best = ContextTaskType.SIMPLE_LOOKUP;
    let bestScore = 0;
    for (const [type, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        best = type as ContextTaskType;
      }
    }
    return best;
  }

  detectFromHistory(messages: Message[]): ContextTaskType {
    const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
    if (!lastUserMsg) return ContextTaskType.SIMPLE_LOOKUP;
    return this.detectTaskType(lastUserMsg.content);
  }

  static getKeywordMap(): Record<ContextTaskType, string[]> {
    return { ...KEYWORD_MAP };
  }
}
