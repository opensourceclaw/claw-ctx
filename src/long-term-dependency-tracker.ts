/**
 * claw-ctx v4.9.0 — Long-Term Dependency Tracker
 *
 * Tracks entity co-occurrence, decision chains, and causal relationships
 * across sessions. Integrates with SessionStateExtractor for automatic
 * entity extraction and DriftAwareRetriever for cross-session injection.
 */

// ── Types ──────────────────────────────────────────────────────────

export interface EntityMention {
  entity: string;
  sessionId: string;
  timestamp: number;
  context: string;
}

export interface DependencyChain {
  chain: string[];
  strength: number;
}

export interface GraphNode {
  id: string;
  label: string;
  type: "entity" | "decision" | "event";
  sessionCount: number;
  lastSeen: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: "co_occurrence" | "causal" | "dependency";
  sessions: string[];
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface CoOccurrenceRecord {
  entity1: string;
  entity2: string;
  count: number;
  sessions: Set<string>;
  lastSeen: number;
}

interface CausalLink {
  cause: string;
  effect: string;
  sessionId: string;
  timestamp: number;
  confidence: number;
  context: string;
}

// ── LongTermDependencyTracker ──────────────────────────────────────

export class LongTermDependencyTracker {
  private entityMentions: Map<string, EntityMention[]> = new Map();
  private coOccurrences: Map<string, CoOccurrenceRecord> = new Map();
  private causalLinks: CausalLink[] = [];
  private decisionChains: Map<string, DependencyChain> = new Map();
  private maxMentions = 1000;
  private maxCausalLinks = 500;

  // ── Public API ─────────────────────────────────────────────────

  /** Track a co-occurrence between two entities in a session */
  track(entity1: string, entity2: string, sessionId: string, context?: string): void {
    const now = Date.now();

    this._addMention(entity1, sessionId, context ?? "");
    this._addMention(entity2, sessionId, context ?? "");

    const key = this._coOccurrenceKey(entity1, entity2);
    let record = this.coOccurrences.get(key);
    if (!record) {
      record = { entity1, entity2, count: 0, sessions: new Set(), lastSeen: now };
      this.coOccurrences.set(key, record);
    }
    record.count++;
    record.sessions.add(sessionId);
    record.lastSeen = now;

    // Prune if over limit
    if (this.entityMentions.size > this.maxMentions) {
      this._pruneMentions();
    }
  }

  /** Get all mentions related to an entity */
  getRelated(entity: string): EntityMention[] {
    const direct = this.entityMentions.get(entity) ?? [];
    const related: EntityMention[] = [...direct];

    for (const [key, record] of this.coOccurrences) {
      if (record.entity1 === entity || record.entity2 === entity) {
        const other = record.entity1 === entity ? record.entity2 : record.entity1;
        const otherMentions = this.entityMentions.get(other) ?? [];
        for (const m of otherMentions) {
          if (!related.some((r) => r.entity === m.entity && r.sessionId === m.sessionId)) {
            related.push(m);
          }
        }
      }
    }

    return related.sort((a, b) => b.timestamp - a.timestamp);
  }

  /** Get the dependency chain for a session */
  getDependencyChain(sessionId: string): DependencyChain {
    const cached = this.decisionChains.get(sessionId);
    if (cached) return cached;

    const entities = this._entitiesInSession(sessionId);
    if (entities.length < 2) {
      return { chain: entities, strength: 0 };
    }

    // Build chain from co-occurrence graph
    const chain: string[] = [];
    const visited = new Set<string>();
    const queue = [entities[0]];
    let coOccurrenceCount = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      chain.push(current);

      // Find connected entities via co-occurrence in this session
      for (const [key, record] of this.coOccurrences) {
        if (!record.sessions.has(sessionId)) continue;
        if (record.entity1 === current && !visited.has(record.entity2)) {
          queue.push(record.entity2);
          coOccurrenceCount++;
        } else if (record.entity2 === current && !visited.has(record.entity1)) {
          queue.push(record.entity1);
          coOccurrenceCount++;
        }
      }
    }

    // Remaining entities not in the graph traversal
    for (const e of entities) {
      if (!visited.has(e)) chain.push(e);
    }

    const strength = Math.min(1, coOccurrenceCount / Math.max(1, chain.length));

    const result: DependencyChain = { chain, strength };
    this.decisionChains.set(sessionId, result);
    return result;
  }

  /** Export the full graph for visualization or external analysis */
  exportGraph(): Graph {
    const entitySet = new Map<string, { lastSeen: number; sessions: Set<string> }>();

    for (const [entity, mentions] of this.entityMentions) {
      const sessions = new Set(mentions.map((m) => m.sessionId));
      entitySet.set(entity, {
        lastSeen: mentions.reduce((max, m) => Math.max(max, m.timestamp), 0),
        sessions,
      });
    }

    const nodes: GraphNode[] = [];
    for (const [id, info] of entitySet) {
      nodes.push({
        id,
        label: id,
        type: "entity",
        sessionCount: info.sessions.size,
        lastSeen: info.lastSeen,
      });
    }

    const edges: GraphEdge[] = [];
    for (const [key, record] of this.coOccurrences) {
      edges.push({
        source: record.entity1,
        target: record.entity2,
        weight: record.count,
        type: "co_occurrence",
        sessions: [...record.sessions],
      });
    }

    for (const link of this.causalLinks) {
      edges.push({
        source: link.cause,
        target: link.effect,
        weight: link.confidence,
        type: "causal",
        sessions: [link.sessionId],
      });
    }

    return { nodes, edges };
  }

  /** Track a causal relationship between two events */
  trackCausal(cause: string, effect: string, sessionId: string, context?: string): void {
    this.causalLinks.push({
      cause,
      effect,
      sessionId,
      timestamp: Date.now(),
      confidence: 0.8,
      context: context ?? "",
    });

    // Also track as co-occurrence
    this.track(cause, effect, sessionId, context);

    if (this.causalLinks.length > this.maxCausalLinks) {
      this.causalLinks = this.causalLinks.slice(-this.maxCausalLinks);
    }
  }

  /** Track a decision in a session for dependency chain building */
  trackDecision(description: string, sessionId: string, entities: string[]): void {
    // Create causal links between entities involved in the decision
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        this.track(entities[i], entities[j], sessionId, description);
      }
    }

    // Build dependency chain for the session
    const chain = this._entitiesInSession(sessionId);
    this.decisionChains.set(sessionId, {
      chain,
      strength: entities.length > 1 ? 0.9 : 0.3,
    });
  }

  /** Query causal relationships involving an event */
  queryCausality(event: string): Array<{ cause: string; effect: string; confidence: number }> {
    return this.causalLinks
      .filter((link) => link.cause === event || link.effect === event)
      .map((link) => ({ cause: link.cause, effect: link.effect, confidence: link.confidence }))
      .sort((a, b) => b.confidence - a.confidence);
  }

  /** Query entities related across multiple sessions */
  getCrossSessionRelations(entity: string): EntityMention[] {
    const mentions = this.getRelated(entity);
    const sessionSet = new Set(mentions.map((m) => m.sessionId));
    // Only return if entity appears in multiple sessions
    if (sessionSet.size < 2) return [];
    return mentions;
  }

  /** Reset all tracked data */
  reset(): void {
    this.entityMentions.clear();
    this.coOccurrences.clear();
    this.causalLinks = [];
    this.decisionChains.clear();
  }

  /** Get stats for monitoring */
  getStats(): { entitiesTracked: number; coOccurrencePairs: number; causalLinks: number; sessions: number } {
    const sessions = new Set<string>();
    for (const mentions of this.entityMentions.values()) {
      for (const m of mentions) sessions.add(m.sessionId);
    }
    return {
      entitiesTracked: this.entityMentions.size,
      coOccurrencePairs: this.coOccurrences.size,
      causalLinks: this.causalLinks.length,
      sessions: sessions.size,
    };
  }

  // ── Integration helpers ─────────────────────────────────────────

  /** Feed SessionState entities into the tracker */
  ingestFromSessionState(state: { sessionId: string; entities: Array<{ name: string; type?: string; firstSeen?: string }> }): void {
    const entities = state.entities;
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        this.track(
          entities[i].name,
          entities[j].name,
          state.sessionId,
          entities[i].firstSeen ?? entities[j].firstSeen ?? "",
        );
      }
    }
  }

  // ── Private helpers ─────────────────────────────────────────────

  private _addMention(entity: string, sessionId: string, context: string): void {
    let mentions = this.entityMentions.get(entity);
    if (!mentions) {
      mentions = [];
      this.entityMentions.set(entity, mentions);
    }
    mentions.push({
      entity,
      sessionId,
      timestamp: Date.now(),
      context: context.slice(0, 500),
    });

    // Keep only the most recent mentions per entity
    if (mentions.length > 100) {
      mentions.splice(0, mentions.length - 100);
    }
  }

  private _coOccurrenceKey(e1: string, e2: string): string {
    return [e1, e2].sort().join("|||");
  }

  private _entitiesInSession(sessionId: string): string[] {
    const entities: string[] = [];
    for (const [entity, mentions] of this.entityMentions) {
      if (mentions.some((m) => m.sessionId === sessionId)) {
        entities.push(entity);
      }
    }
    return entities;
  }

  private _pruneMentions(): void {
    const sorted = [...this.entityMentions.entries()]
      .sort((a, b) => {
        const aLast = a[1].reduce((max, m) => Math.max(max, m.timestamp), 0);
        const bLast = b[1].reduce((max, m) => Math.max(max, m.timestamp), 0);
        return aLast - bLast;
      });

    // Remove the least recently mentioned entities
    const toRemove = sorted.slice(0, sorted.length - this.maxMentions / 2);
    for (const [entity] of toRemove) {
      this.entityMentions.delete(entity);
    }
  }
}
