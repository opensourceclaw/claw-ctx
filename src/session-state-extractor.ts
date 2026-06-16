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
 * claw-ctx v4.7.0 — Session State Extractor
 *
 * Extracts structured state from conversation messages including:
 * entities, decisions, topics, and actions.
 * Integrated with engine.ts ingest() for automatic state tracking.
 *
 * v4.7.0: Initial implementation
 */

// ── Types ──────────────────────────────────────────────────────────

export interface Entity {
  /** Entity name / identifier */
  name: string;
  /** Entity type: person, tool, concept, file, project */
  type: "person" | "tool" | "concept" | "file" | "project" | "other";
  /** How many times this entity was mentioned */
  mentions: number;
  /** Context snippet where entity was first seen */
  firstSeen: string;
}

export interface Decision {
  /** What was decided */
  description: string;
  /** Who or what made the decision */
  actor: string;
  /** Confidence in extraction (0.0–1.0) */
  confidence: number;
  /** Supporting context */
  context: string;
}

export interface TopicTag {
  /** Topic label */
  label: string;
  /** Relevance weight (0.0–1.0) */
  weight: number;
  /** When the topic was first discussed */
  firstMentioned: number;
}

export interface Action {
  /** What action was performed */
  description: string;
  /** Action type */
  type: "code" | "config" | "deploy" | "review" | "test" | "discuss" | "other";
  /** When the action occurred */
  timestamp: number;
}

export interface SessionState {
  /** Session identifier */
  sessionId: string;
  /** Extracted entities */
  entities: Entity[];
  /** Key decisions made */
  decisions: Decision[];
  /** Active topic tags */
  topics: TopicTag[];
  /** Actions performed */
  actions: Action[];
  /** Last update timestamp */
  lastUpdated: number;
  /** Message count processed */
  messageCount: number;
}

// ── Pattern dictionaries ───────────────────────────────────────────

const DECISION_PATTERNS = [
  /\b(?:decided|decide|decision|agreed|settled on|went with|chose|chosen|selected|opted for|will use|going to use)\b[^.!?]*/gi,
  /\b(?:let's|lets|we'll|we will|should)\s+(?:go with|use|do|try|implement|adopt|switch to)\b[^.!?]*/gi,
];

const ACTION_PATTERNS: Record<Action["type"], RegExp[]> = {
  code: [/\b(?:wrote|written|coded|implemented|refactored|fixed|patched|built|compiled)\b/gi],
  config: [/\b(?:configured|setup|set up|installed|updated|upgraded|changed.*config)\b/gi],
  deploy: [/\b(?:deployed|released|shipped|pushed|launched|published)\b/gi],
  review: [/\b(?:reviewed|checked|inspected|audited|examined)\b/gi],
  test: [/\b(?:tested|ran tests|verified|validated|checked.*pass)\b/gi],
  discuss: [/\b(?:discussed|talked about|chatted|met about|conferred)\b/gi],
  other: [],
};

const ENTITY_PATTERNS = {
  file: /\b([\w\/.-]+\.(?:ts|js|py|rs|go|java|json|yaml|yml|md|toml|sql|css|html))\b/g,
  tool: /\b(?:docker|kubernetes|k8s|git|npm|yarn|pnpm|pip|cargo|eslint|prettier|webpack|vite|jest|vitest|mocha|terraform|ansible|helm)\b/gi,
};

// Person names pattern: "Peter", "Friday", "Jarvis", "EDITH"
const PERSON_NAMES = /\b(?:Peter|Friday|Jarvis|EDITH|Alice|Bob)\b/g;

// ── SessionStateExtractor ──────────────────────────────────────────

export class SessionStateExtractor {
  private static idCounter = 0;

  /**
   * Extract session state from an array of messages.
   */
  static extract(
    messages: Array<{ role?: string; content: string }>,
    sessionId?: string,
  ): SessionState {
    const text = messages.map((m) => m.content).join("\n");
    const now = Date.now();
    const sid = sessionId || `session-${++SessionStateExtractor.idCounter}`;

    return {
      sessionId: sid,
      entities: SessionStateExtractor.extractEntities(messages),
      decisions: SessionStateExtractor.extractDecisions(text),
      topics: SessionStateExtractor.extractTopics(text, now),
      actions: SessionStateExtractor.extractActions(text, now),
      lastUpdated: now,
      messageCount: messages.length,
    };
  }

  /** Extract key entities */
  private static extractEntities(
    messages: Array<{ role?: string; content: string }>,
  ): Entity[] {
    const entityMap = new Map<string, Entity>();
    const text = messages.map((m) => m.content).join("\n");

    const addEntity = (
      name: string,
      type: Entity["type"],
      context: string,
    ) => {
      const existing = entityMap.get(name.toLowerCase());
      if (existing) {
        existing.mentions++;
      } else {
        entityMap.set(name.toLowerCase(), {
          name,
          type,
          mentions: 1,
          firstSeen: context.slice(0, 100),
        });
      }
    };

    // Files
    for (const msg of messages) {
      const matches = msg.content.matchAll(ENTITY_PATTERNS.file);
      for (const m of matches) {
        addEntity(m[1], "file", msg.content);
      }
    }

    // Tools
    const toolMatches = text.matchAll(ENTITY_PATTERNS.tool);
    for (const m of toolMatches) {
      addEntity(m[0], "tool", m[0]);
    }

    // Person names
    const personMatches = text.matchAll(PERSON_NAMES);
    for (const m of personMatches) {
      addEntity(m[0], "person", m[0]);
    }

    // Concept extraction: capitalized multi-word phrases
    const conceptMatches = text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g);
    for (const m of conceptMatches) {
      addEntity(m[1], "concept", m[1]);
    }

    // Sort by mentions descending
    return [...entityMap.values()].sort((a, b) => b.mentions - a.mentions);
  }

  /** Extract key decisions */
  private static extractDecisions(text: string): Decision[] {
    const decisions: Decision[] = [];
    const seen = new Set<string>();

    for (const pattern of DECISION_PATTERNS) {
      const matches = text.matchAll(pattern);
      for (const m of matches) {
        const desc = m[0].trim();
        if (desc.length < 10 || seen.has(desc.toLowerCase())) continue;
        seen.add(desc.toLowerCase());

        decisions.push({
          description: desc,
          actor: SessionStateExtractor.inferActor(desc),
          confidence: SessionStateExtractor.confidenceScore(desc),
          context: desc,
        });
      }
    }

    return decisions;
  }

  /** Extract topic tags */
  private static extractTopics(text: string, now: number): TopicTag[] {
    const tagMap = new Map<string, number>();

    // Technical keywords as topic indicators
    const TOPIC_KEYWORDS = [
      "authentication", "auth", "deployment", "deploy", "database",
      "api", "frontend", "backend", "testing", "test", "bug", "fix",
      "performance", "security", "configuration", "config", "migration",
      "refactoring", "refactor", "documentation", "docs", "monitoring",
      "logging", "error handling", "ci/cd", "pipeline", "docker",
      "kubernetes", "compression", "drift", "context", "memory",
      "token", "budget", "plugin", "gateway", "session", "state",
    ];

    const lower = text.toLowerCase();
    for (const kw of TOPIC_KEYWORDS) {
      const count = (lower.match(new RegExp(`\\b${kw}\\b`, "gi")) || []).length;
      if (count > 0) {
        tagMap.set(kw, (tagMap.get(kw) || 0) + count);
      }
    }

    // Normalize weights
    const maxCount = Math.max(1, ...tagMap.values());
    const topics: TopicTag[] = [];

    for (const [label, count] of tagMap) {
      topics.push({
        label,
        weight: count / maxCount,
        firstMentioned: now,
      });
    }

    return topics.sort((a, b) => b.weight - a.weight).slice(0, 10);
  }

  /** Extract actions */
  private static extractActions(text: string, now: number): Action[] {
    const actions: Action[] = [];

    for (const [type, patterns] of Object.entries(ACTION_PATTERNS)) {
      for (const pattern of patterns) {
        const matches = text.matchAll(pattern);
        for (const m of matches) {
          actions.push({
            description: m[0].trim(),
            type: type as Action["type"],
            timestamp: now,
          });
        }
      }
    }

    return actions;
  }

  /**
   * Merge previous session state with current extracted state.
   * Entities accumulate, decisions are deduplicated, topics recalculated.
   */
  static merge(previous: SessionState, current: SessionState): SessionState {
    // Merge entities: accumulate mentions
    const entityMap = new Map<string, Entity>();
    for (const e of previous.entities) {
      entityMap.set(e.name.toLowerCase(), { ...e });
    }
    for (const e of current.entities) {
      const existing = entityMap.get(e.name.toLowerCase());
      if (existing) {
        existing.mentions += e.mentions;
      } else {
        entityMap.set(e.name.toLowerCase(), { ...e });
      }
    }

    // Merge decisions: deduplicate
    const decisionSet = new Set(
      previous.decisions.map((d) => d.description.toLowerCase()),
    );
    const mergedDecisions = [...previous.decisions];
    for (const d of current.decisions) {
      if (!decisionSet.has(d.description.toLowerCase())) {
        mergedDecisions.push(d);
        decisionSet.add(d.description.toLowerCase());
      }
    }

    // Merge topics: recalculate weights
    const topicMap = new Map<string, number>();
    for (const t of [...previous.topics, ...current.topics]) {
      topicMap.set(t.label, Math.max(topicMap.get(t.label) || 0, t.weight));
    }

    return {
      sessionId: previous.sessionId,
      entities: [...entityMap.values()].sort((a, b) => b.mentions - a.mentions),
      decisions: mergedDecisions,
      topics: [...topicMap.entries()]
        .map(([label, weight]) => ({ label, weight, firstMentioned: current.lastUpdated }))
        .sort((a, b) => b.weight - a.weight),
      actions: [...previous.actions, ...current.actions],
      lastUpdated: current.lastUpdated,
      messageCount: previous.messageCount + current.messageCount,
    };
  }

  /**
   * Get key entities from session state, grouped by type.
   */
  static getKeyEntities(state: SessionState): Record<Entity["type"], Entity[]> {
    const grouped: Record<Entity["type"], Entity[]> = {
      person: [],
      tool: [],
      concept: [],
      file: [],
      project: [],
      other: [],
    };

    for (const entity of state.entities) {
      grouped[entity.type].push(entity);
    }

    return grouped;
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private static inferActor(desc: string): string {
    if (/\b(I|me|my)\b/i.test(desc)) return "user";
    if (/\b(we|our|us|let's|lets)\b/i.test(desc)) return "team";
    if (/\b(AI|assistant|agent|EDITH|Jarvis|Friday)\b/i.test(desc)) return "agent";
    return "unknown";
  }

  private static confidenceScore(desc: string): number {
    let score = 0.5;
    if (desc.length > 20) score += 0.1;
    if (desc.length > 50) score += 0.1;
    if (/\b(decided|agreed|chose|selected|will use)\b/i.test(desc)) score += 0.2;
    if (/\b(because|since|due to|for the reason)\b/i.test(desc)) score += 0.1;
    return Math.min(1.0, Math.round(score * 10) / 10);
  }
}
