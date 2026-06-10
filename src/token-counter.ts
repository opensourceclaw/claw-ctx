/**
 * claw-ctx v4.3.0 — Token Counter
 *
 * Precise token counting using tiktoken with fallback estimation.
 * Supports cl100k_base, p50k_base, r50k_base encodings and model names.
 *
 * v4.3.0: Initial implementation with TiktokenCounter + FallbackCounter
 * v4.4.0: Added estimateTokenBudget() and getStats() for drift integration
 * v5.0.0 plan (from phase1-summary-design) has changed; new features distributed across v4.3.0–v4.5.0
 */

import {
  getEncoding,
  encodingForModel,
  getEncodingNameForModel,
  type TiktokenEncoding,
  type TiktokenModel,
  type Tiktoken,
} from "js-tiktoken";

// ── Types ──────────────────────────────────────────────────────────

export type TiktokenEncodingName = "cl100k_base" | "p50k_base" | "r50k_base";

export interface TokenCounterResult {
  tokens: number;
  method: "tiktoken" | "fallback";
  encoding?: string;
}

export interface BatchTokenResult {
  tokens: number[];
  method: "tiktoken" | "fallback";
}

export interface TokenStats {
  totalTokens: number;
  totalMessages: number;
  averageTokensPerMessage: number;
  method: "tiktoken" | "fallback";
  accuracy: number; // 0.0–1.0
}

export interface TokenBudget {
  /** Total available tokens in the model's context window */
  totalBudget: number;
  /** Tokens consumed by the current context */
  consumedTokens: number;
  /** Remaining budget */
  remainingBudget: number;
  /** Reserve budget (safety margin) */
  reserveBudget: number;
  /** Budget utilization ratio (0.0–1.0) */
  utilization: number;
}

// ── Helpers ────────────────────────────────────────────────────────

const KNOWN_ENCODINGS: TiktokenEncodingName[] = ["cl100k_base", "p50k_base", "r50k_base"];

function isEncodingName(s: string): s is TiktokenEncodingName {
  return (KNOWN_ENCODINGS as string[]).includes(s);
}

/**
 * Try to resolve an encoding name or model name to a Tiktoken instance.
 * Supports both encoding names (cl100k_base) and model names (gpt-4).
 */
function resolveEncoder(modelOrEncoding: string): Tiktoken | null {
  // 1. Try as encoding name directly
  if (isEncodingName(modelOrEncoding)) {
    try {
      return getEncoding(modelOrEncoding as TiktokenEncoding);
    } catch {
      // fall through
    }
  }

  // 2. Try as encoding name (for o200k_base etc.)
  try {
    return getEncoding(modelOrEncoding as TiktokenEncoding);
  } catch {
    // fall through
  }

  // 3. Look up model → encoding
  try {
    const encoding = getEncodingNameForModel(modelOrEncoding as TiktokenModel);
    return getEncoding(encoding);
  } catch {
    // fall through
  }

  // 4. Try encodingForModel directly
  try {
    return encodingForModel(modelOrEncoding as TiktokenModel);
  } catch {
    return null;
  }
}

// ── Tiktoken Counter ───────────────────────────────────────────────

export class TiktokenCounter {
  private encoder: Tiktoken | null = null;
  private model: string;
  private _initialized = false;

  constructor(model: string = "cl100k_base") {
    this.model = model;
    this.init();
  }

  private init(): void {
    this.encoder = resolveEncoder(this.model);
    this._initialized = this.encoder !== null;
  }

  get isAvailable(): boolean {
    return this._initialized && this.encoder !== null;
  }

  /**
   * Encode text and return token count.
   */
  encode(text: string): number {
    if (!this.encoder) {
      throw new Error("TiktokenCounter not initialized — encoder unavailable");
    }
    return this.encoder.encode(text).length;
  }

  /**
   * Encode multiple texts and return token counts.
   */
  encodeBatch(texts: string[]): number[] {
    return texts.map((t) => this.encode(t));
  }

  /**
   * Decode tokens back to text.
   */
  decode(tokens: number[]): string {
    if (!this.encoder) {
      throw new Error("TiktokenCounter not initialized — encoder unavailable");
    }
    return this.encoder.decode(tokens);
  }

  /**
   * Get token count for text (alias for encode).
   */
  getTokenCount(text: string): number {
    return this.encode(text);
  }

  /**
   * Estimate token budget for a given context.
   * v5.0.0: Integrated with smart budget allocation.
   */
  estimateTokenBudget(totalBudget: number, messages: Array<{ content: string }>): TokenBudget {
    let consumed = 0;
    for (const msg of messages) {
      consumed += this.getTokenCount(msg.content);
    }
    const reserveBudget = Math.floor(totalBudget * 0.08); // 8% reserve
    const remainingBudget = Math.max(0, totalBudget - consumed - reserveBudget);
    return {
      totalBudget,
      consumedTokens: consumed,
      remainingBudget,
      reserveBudget,
      utilization: totalBudget > 0 ? consumed / totalBudget : 1,
    };
  }

  /**
   * Get comprehensive token statistics for a set of messages.
   * v5.0.0: Added for drift detection integration.
   */
  getStats(messages: Array<{ content: string }>): TokenStats {
    let total = 0;
    for (const msg of messages) {
      total += this.getTokenCount(msg.content);
    }
    return {
      totalTokens: total,
      totalMessages: messages.length,
      averageTokensPerMessage: messages.length > 0 ? Math.round(total / messages.length) : 0,
      method: "tiktoken",
      accuracy: 1.0,
    };
  }

  /** Reset and re-initialize with a different model */
  setModel(model: string): void {
    this.model = model;
    this.init();
  }

  /** Get current model name */
  getModel(): string {
    return this.model;
  }
}

// ── Fallback Counter ───────────────────────────────────────────────

export class FallbackCounter {
  private static readonly CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;
  /** CJK characters: roughly 1–2 tokens each */
  private static readonly CJK_TOKEN_RATIO = 1.5;
  /** Non-CJK characters: roughly 0.25 tokens each (~4 chars/token) */
  private static readonly NON_CJK_TOKEN_RATIO = 0.25;
  /** Overhead factor for special tokens and formatting */
  private static readonly OVERHEAD_FACTOR = 1.1;

  /**
   * Estimate token count using character-based heuristics.
   * CJK characters count as ~1.5 tokens, others as ~0.25 tokens.
   */
  static estimate(text: string): number {
    if (!text || text.length === 0) return 0;

    const cjkMatches = text.match(FallbackCounter.CJK_REGEX);
    const cjkChars = cjkMatches ? cjkMatches.length : 0;
    const nonCjkChars = text.length - cjkChars;

    const rawTokens =
      cjkChars * FallbackCounter.CJK_TOKEN_RATIO +
      nonCjkChars * FallbackCounter.NON_CJK_TOKEN_RATIO;

    return Math.max(1, Math.ceil(rawTokens * FallbackCounter.OVERHEAD_FACTOR));
  }

  /**
   * Always returns false — fallback is inherently approximate.
   */
  static isAccurate(): boolean {
    return false;
  }

  /**
   * Estimated accuracy of the fallback counter.
   * CJK-heavy text tends to have higher accuracy.
   */
  static accuracy(text?: string): number {
    if (!text) return 0.85;
    const cjkMatches = text.match(FallbackCounter.CJK_REGEX);
    const cjkRatio = cjkMatches ? cjkMatches.length / text.length : 0;
    // More CJK → more predictable tokenization → higher accuracy
    return 0.8 + cjkRatio * 0.15;
  }
}

// ── Unified Token Counter ──────────────────────────────────────────

/**
 * Smart token counter that tries tiktoken first, falls back to estimation.
 */
export function createTokenCounter(model: string = "cl100k_base"): {
  count(text: string): TokenCounterResult;
  countBatch(texts: string[]): BatchTokenResult;
  decode(tokens: number[]): string;
  isPrecise(): boolean;
} {
  const tiktoken = new TiktokenCounter(model);

  return {
    count(text: string): TokenCounterResult {
      if (tiktoken.isAvailable) {
        try {
          return {
            tokens: tiktoken.encode(text),
            method: "tiktoken",
            encoding: model,
          };
        } catch {
          // Fall through to fallback
        }
      }
      return {
        tokens: FallbackCounter.estimate(text),
        method: "fallback",
      };
    },

    countBatch(texts: string[]): BatchTokenResult {
      if (tiktoken.isAvailable) {
        try {
          return {
            tokens: tiktoken.encodeBatch(texts),
            method: "tiktoken",
          };
        } catch {
          // Fall through to fallback
        }
      }
      return {
        tokens: texts.map((t) => FallbackCounter.estimate(t)),
        method: "fallback",
      };
    },

    decode(tokens: number[]): string {
      if (tiktoken.isAvailable) {
        return tiktoken.decode(tokens);
      }
      throw new Error("Decode not available with fallback counter");
    },

    isPrecise(): boolean {
      return tiktoken.isAvailable;
    },
  };
}
