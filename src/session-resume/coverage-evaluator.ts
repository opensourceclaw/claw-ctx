/**
 * claw-ctx session-resume module — Coverage Evaluator
 *
 * Evaluates how well context covers query keywords.
 *
 * v5.6.0: Initial implementation
 */

import type { HistoryEntry } from "./types.js";

/** Common English stopwords to filter out */
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "need", "dare",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
  "into", "through", "during", "before", "after", "above", "below",
  "and", "but", "or", "nor", "so", "yet", "both", "either", "neither",
  "not", "only", "own", "same", "than", "too", "very", "just",
  "i", "me", "my", "myself", "we", "our", "ours", "ourselves",
  "you", "your", "yours", "yourself", "yourselves",
  "he", "him", "his", "himself", "she", "her", "hers", "herself",
  "it", "its", "itself", "they", "them", "their", "theirs", "themselves",
  "what", "which", "who", "whom", "this", "that", "these", "those",
  "how", "when", "where", "why", "all", "each", "every", "any",
]);

export interface CoverageResult {
  score: number;
  queryKeywordCount: number;
  coveredKeywordCount: number;
}

export class CoverageEvaluator {
  /**
   * Evaluate coverage: how well context covers query keywords.
   *
   * Algorithm:
   * 1. Extract keywords from query (tokenize, remove stopwords)
   * 2. For each keyword, check if it appears in context
   * 3. Bonus: entity match via entry.entities
   * 4. Score = covered_keywords / total_keywords
   */
  evaluate(
    entries: HistoryEntry[],
    formatted: string,
    query?: string
  ): CoverageResult {
    // Edge case: no query
    if (!query || query.trim().length === 0) {
      return { score: 1.0, queryKeywordCount: 0, coveredKeywordCount: 0 };
    }

    // Edge case: no context
    if (entries.length === 0 || formatted.length === 0) {
      return { score: 0.0, queryKeywordCount: 0, coveredKeywordCount: 0 };
    }

    // Extract keywords from query
    const keywords = this._extractKeywords(query);

    // Edge case: no meaningful keywords
    if (keywords.length === 0) {
      return { score: 1.0, queryKeywordCount: 0, coveredKeywordCount: 0 };
    }

    // Build context text for matching
    const contextLower = formatted.toLowerCase();

    // Also include entities from entries
    const allEntities = new Set<string>();
    for (const entry of entries) {
      for (const entity of entry.summary.entities) {
        allEntities.add(entity.toLowerCase());
      }
    }

    // Count covered keywords
    let covered = 0;
    for (const keyword of keywords) {
      // Check in formatted context
      if (contextLower.includes(keyword)) {
        covered++;
        continue;
      }
      // Check in entities
      if (allEntities.has(keyword)) {
        covered++;
        continue;
      }
    }

    const score = covered / keywords.length;

    return {
      score,
      queryKeywordCount: keywords.length,
      coveredKeywordCount: covered,
    };
  }

  /**
   * Extract meaningful keywords from text.
   * Tokenizes, lowercases, removes stopwords, filters short tokens.
   */
  private _extractKeywords(text: string): string[] {
    const tokens = text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")  // Remove punctuation
      .split(/\s+/)
      .filter(token => token.length >= 2)  // Filter short tokens
      .filter(token => !STOPWORDS.has(token));

    return [...new Set(tokens)];  // Dedupe
  }
}
