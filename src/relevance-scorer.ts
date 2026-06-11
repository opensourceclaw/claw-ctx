// claw-ctx v4.20.0 — RelevanceScorer
//
// Scores cross-session memories by relevance to the current context.
// Dimensions: entity overlap (40%), topic similarity (35%), recency (15%), confidence (10%).

export interface ScoredMemory {
  id: string;
  content: string;
  score: number;
  breakdown: {
    entityOverlap: number;
    topicSimilarity: number;
    recency: number;
    confidence: number;
  };
  timestamp: number;
}

export interface RelevanceContext {
  entities: string[];
  topics: string[];
  recentTerms: Set<string>;
}

const WEIGHTS = { entityOverlap: 0.4, topicSimilarity: 0.35, recency: 0.15, confidence: 0.1 };

export class RelevanceScorer {
  private _halfLifeMs: number;

  constructor(halfLifeMs: number = 86400000) {
    this._halfLifeMs = halfLifeMs; // default: 24h half-life
  }

  /**
   * Score a memory record against the current context.
   *
   * @param memory - A memory record with content, tags, timestamp, confidence
   * @param context - Current session context (entities, topics, recent terms)
   * @returns ScoredMemory with breakdown
   */
  score(
    memory: { id: string; content: string; tags?: string[]; timestamp?: number; confidence?: number },
    context: RelevanceContext,
  ): ScoredMemory {
    const contentLower = memory.content.toLowerCase();
    const tagsLower = (memory.tags ?? []).map((t) => t.toLowerCase());

    // Entity overlap (40%): shared entities between memory and current context
    const entityOverlap = this._computeEntityOverlap(contentLower, tagsLower, context.entities);

    // Topic similarity (35%): cosine-like overlap of topic keywords
    const topicSimilarity = this._computeTopicSimilarity(contentLower, tagsLower, context.topics);

    // Recency (15%): exponential decay based on timestamp
    const recency = this._computeRecency(memory.timestamp ?? Date.now() / 1000);

    // Confidence (10%): memory confidence score
    const confidence = Math.min((memory.confidence ?? 1.0), 1.0);

    const score =
      WEIGHTS.entityOverlap * entityOverlap +
      WEIGHTS.topicSimilarity * topicSimilarity +
      WEIGHTS.recency * recency +
      WEIGHTS.confidence * confidence;

    return {
      id: memory.id,
      content: memory.content,
      score: Math.round(score * 1000) / 1000,
      breakdown: {
        entityOverlap: Math.round(entityOverlap * 1000) / 1000,
        topicSimilarity: Math.round(topicSimilarity * 1000) / 1000,
        recency: Math.round(recency * 1000) / 1000,
        confidence: Math.round(confidence * 1000) / 1000,
      },
      timestamp: memory.timestamp ?? Date.now() / 1000,
    };
  }

  /**
   * Score and rank multiple memories, returning only those above minRelevance.
   */
  rank(
    memories: Array<{ id: string; content: string; tags?: string[]; timestamp?: number; confidence?: number }>,
    context: RelevanceContext,
    minRelevance: number = 0.3,
  ): ScoredMemory[] {
    return memories
      .map((m) => this.score(m, context))
      .filter((m) => m.score >= minRelevance)
      .sort((a, b) => b.score - a.score);
  }

  // ── private ──────────────────────────────────────────────────────────

  private _computeEntityOverlap(content: string, tags: string[], entities: string[]): number {
    if (!entities.length) return 0;
    let matches = 0;
    for (const entity of entities) {
      const el = entity.toLowerCase();
      if (content.includes(el) || tags.some((t) => t.includes(el) || el.includes(t))) {
        matches++;
      }
    }
    return matches / entities.length;
  }

  private _computeTopicSimilarity(content: string, tags: string[], topics: string[]): number {
    if (!topics.length) return 0;
    const contentTerms = new Set(content.split(/\s+/).map((w) => w.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "")).filter(Boolean));
    const allTerms = new Set([...contentTerms, ...tags]);
    let overlap = 0;
    for (const topic of topics) {
      const tl = topic.toLowerCase();
      for (const term of allTerms) {
        if (term.includes(tl) || tl.includes(term)) { overlap++; break; }
      }
    }
    return overlap / topics.length;
  }

  private _computeRecency(timestampSec: number): number {
    const nowSec = Date.now() / 1000;
    const ageSec = nowSec - timestampSec;
    const halfLifeSec = this._halfLifeMs / 1000;
    return Math.pow(2, -ageSec / halfLifeSec);
  }

  /**
   * Build a RelevanceContext from session state and recent messages.
   */
  static buildContext(
    entities: string[],
    topics: string[],
    recentMessages: string[],
  ): RelevanceContext {
    const recentTerms = new Set<string>();
    for (const msg of recentMessages.slice(-3)) {
      for (const word of msg.split(/\s+/)) {
        const clean = word.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
        if (clean.length > 1) recentTerms.add(clean);
      }
    }
    return { entities, topics, recentTerms };
  }
}
