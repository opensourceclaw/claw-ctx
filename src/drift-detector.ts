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
 * claw-ctx v4.4.0 — Drift Detector
 *
 * Topic drift detection for context management.
 * Monitors conversation turns and detects when the topic has drifted
 * significantly, triggering alerts for context compaction / refresh.
 *
 * v4.4.0: Initial implementation with TopicModel + DriftDetector
 */

// ── Types ──────────────────────────────────────────────────────────

export interface Topic {
  /** Topic keyword / label */
  keyword: string;
  /** Weight / relevance score for this topic */
  weight: number;
}

export interface DriftAlert {
  /** Alert severity level */
  level: "low" | "medium" | "high";
  /** Drift score at time of alert */
  driftScore: number;
  /** Number of consecutive turns with drift */
  consecutiveDrifts: number;
  /** Turn index where drift was detected */
  atTurn: number;
  /** Suggested actions to address */
  suggestedActions: Action[];
  /** Timestamp */
  timestamp: number;
}

export interface Action {
  type: "compact" | "suggest_new_session" | "summarize" | "notify" | "refresh_memory";
  priority: number; // 1 = highest
  description: string;
}

export interface DriftConfig {
  /** Cosine similarity threshold for topic matching (0.0–1.0). Below this, turns are considered drifted apart. */
  similarityThreshold: number;
  /** Number of consecutive turns to evaluate for drift */
  driftWindow: number;
  /** Alert level thresholds (drift score ranges) */
  alertLevels: {
    low: number;
    medium: number;
    high: number;
  };
  /** Minimum number of messages before drift detection activates */
  minMessages: number;
}

export interface DriftReport {
  /** Whether drift was detected */
  drifted: boolean;
  /** Current drift score (0.0–1.0, higher = more drift) */
  driftScore: number;
  /** Maximum drift score observed in the window */
  maxDriftScore: number;
  /** Number of consecutive turns with drift */
  consecutiveDrifts: number;
  /** Active alerts */
  alerts: DriftAlert[];
  /** Current topics extracted from latest turn */
  currentTopics: Topic[];
  /** Topics from previous turn for comparison */
  previousTopics: Topic[];
}

// ── Defaults ───────────────────────────────────────────────────────

export const DEFAULT_DRIFT_CONFIG: DriftConfig = {
  similarityThreshold: 0.6,
  driftWindow: 3,
  alertLevels: {
    low: 0.3,
    medium: 0.5,
    high: 0.7,
  },
  minMessages: 5,
};

// ── Topic Model ────────────────────────────────────────────────────

/**
 * Extracts and models topics from conversation messages.
 * Uses keyword extraction with TF-like weighting.
 */
export class TopicModel {
  /** Common stop words to filter out (lowercase) */
  private static readonly STOP_WORDS = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "can", "shall",
    "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above",
    "below", "between", "under", "again", "further", "then", "once",
    "here", "there", "when", "where", "why", "how", "all", "both",
    "each", "few", "more", "most", "other", "some", "such", "no",
    "nor", "not", "only", "own", "same", "so", "than", "too",
    "very", "just", "about", "and", "but", "or", "if", "because",
    "until", "while", "this", "that", "these", "those", "it", "its",
    "i", "me", "my", "we", "our", "you", "your", "he", "she",
    "they", "them", "please", "would", "also", "use", "using",
    "let", "get", "got", "one", "two", "make", "made", "need",
    "like", "now", "new", "see", "know", "think", "well", "back",
    "still", "way", "even", "much", "many", "really", "good", "ok",
    "okay", "yes", "yeah", "sure", "right", "going", "want", "put",
  ]);

  /** Technical/domain keywords that should be weighted higher */
  private static readonly TECH_KEYWORDS = new Set([
    "code", "bug", "fix", "deploy", "test", "refactor", "config",
    "error", "performance", "api", "database", "task", "version",
    "release", "review", "build", "docker", "kubernetes", "git",
    "ci", "cd", "pipeline", "server", "client", "frontend", "backend",
    "typescript", "javascript", "python", "rust", "java", "go",
    "function", "class", "module", "import", "export", "interface",
    "type", "component", "service", "endpoint", "request", "response",
    "token", "context", "memory", "session", "plugin", "gateway",
    "compaction", "budget", "encoding", "tiktoken", "drift",
    "node", "npm", "package", "dependency", "install", "update",
  ]);

  /**
   * Extract topics from one or more messages.
   * Returns a list of Topic items with keyword and weight.
   */
  static extractTopics(messages: Array<{ role?: string; content: string }>): Topic[] {
    const wordCounts = new Map<string, number>();
    const totalMessages = messages.length;

    for (const msg of messages) {
      const text = typeof msg.content === "string" ? msg.content.toLowerCase() : "";
      // Extract words (2+ chars, alphanumeric + hyphens)
      const words = text.match(/\b[a-z][a-z0-9\-_]{1,30}\b/g) || [];

      // Count per word, deduplicate per message
      const seenInMsg = new Set<string>();
      for (const word of words) {
        if (TopicModel.STOP_WORDS.has(word)) continue;
        if (word.length < 3 && !TopicModel.TECH_KEYWORDS.has(word)) continue;
        if (!seenInMsg.has(word)) {
          seenInMsg.add(word);
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        }
      }
    }

    // Convert to topics with TF-like weighting
    const topics: Topic[] = [];
    for (const [word, count] of wordCounts) {
      // Base weight: term frequency
      let weight = count / totalMessages;

      // Boost tech keywords
      if (TopicModel.TECH_KEYWORDS.has(word)) {
        weight *= 1.5;
      }

      // Cap weight at 1.0
      weight = Math.min(1.0, weight);

      topics.push({ keyword: word, weight });
    }

    // Sort by weight descending, return top 20
    return topics.sort((a, b) => b.weight - a.weight).slice(0, 20);
  }

  /**
   * Compute cosine similarity between two single topics.
   * For two topics with the same keyword, returns weight similarity.
   * For different keywords, returns 0.0.
   */
  static computeSimilarity(topic1: Topic, topic2: Topic): number;
  /**
   * Compute cosine similarity between two topic sets.
   */
  static computeSimilarity(topics1: Topic[], topics2: Topic[]): number;
  static computeSimilarity(
    a: Topic | Topic[],
    b: Topic | Topic[]
  ): number {
    // Handle single-topic comparison
    if (!Array.isArray(a) && !Array.isArray(b)) {
      if (a.keyword === b.keyword) {
        const diff = Math.abs(a.weight - b.weight);
        return Math.max(0, 1.0 - diff);
      }
      return 0.0;
    }

    const topics1 = Array.isArray(a) ? a : [a];
    const topics2 = Array.isArray(b) ? b : [b];

    if (topics1.length === 0 && topics2.length === 0) return 1.0;
    if (topics1.length === 0 || topics2.length === 0) return 0.0;

    const map1 = new Map(topics1.map((t) => [t.keyword, t.weight]));
    const map2 = new Map(topics2.map((t) => [t.keyword, t.weight]));

    const allKeywords = new Set([...map1.keys(), ...map2.keys()]);
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (const kw of allKeywords) {
      const w1 = map1.get(kw) || 0;
      const w2 = map2.get(kw) || 0;
      dotProduct += w1 * w2;
      mag1 += w1 * w1;
      mag2 += w2 * w2;
    }

    const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
    if (magnitude === 0) return 0.0;

    return dotProduct / magnitude;
  }

  /**
   * Get a numeric embedding vector for topics.
   * Uses keyword weights as a simple feature vector.
   */
  static getEmbedding(topics: Topic[]): number[] {
    if (topics.length === 0) return [];
    const vocab = topics.map((t) => t.keyword).sort();
    return vocab.map((kw) => topics.find((t) => t.keyword === kw)?.weight ?? 0);
  }
}

// ── Drift Detector ─────────────────────────────────────────────────

export class DriftDetector {
  private config: DriftConfig;
  /** Rolling window of topic sets, one per turn */
  private topicHistory: Topic[][] = [];
  /** Drift scores per turn */
  private driftScores: number[] = [];
  /** Number of consecutive turns with significant drift */
  private consecutiveDrifts = 0;
  /** Generated alerts */
  private alerts: DriftAlert[] = [];
  /** Turn counter */
  private turnCount = 0;
  /** Total messages processed */
  private totalMessages = 0;

  constructor(config: Partial<DriftConfig> = {}) {
    this.config = { ...DEFAULT_DRIFT_CONFIG, ...config };
  }

  /**
   * Feed a new turn's messages into the detector.
   * Returns any new drift alerts.
   */
  feedTurn(messages: Array<{ content: string; role?: string }>): DriftAlert[] {
    this.turnCount++;
    this.totalMessages += messages.length;

    // Check minMessages before activating detection
    if (this.totalMessages < this.config.minMessages) {
      return [];
    }

    const newTopics = TopicModel.extractTopics(messages);
    const newAlerts: DriftAlert[] = [];

    this.topicHistory.push(newTopics);

    // Trim history to drift window + 1 (need previous for comparison)
    const maxHistory = this.config.driftWindow + 1;
    while (this.topicHistory.length > maxHistory) {
      this.topicHistory.shift();
    }

    // Need at least 2 turns to compare
    if (this.topicHistory.length < 2) {
      return [];
    }

    // Compare latest vs previous
    const current = this.topicHistory[this.topicHistory.length - 1];
    const previous = this.topicHistory[this.topicHistory.length - 2];
    const similarity = TopicModel.computeSimilarity(current, previous);
    const driftScore = 1.0 - similarity;

    this.driftScores.push(driftScore);
    // Trim drift scores too
    while (this.driftScores.length > maxHistory) {
      this.driftScores.shift();
    }

    // Check if this turn exceeds similarity threshold
    if (driftScore > this.config.similarityThreshold) {
      this.consecutiveDrifts++;
    } else {
      this.consecutiveDrifts = 0;
    }

    // Check if we should generate alert
    if (
      this.consecutiveDrifts >= this.config.driftWindow &&
      this.driftScores.length >= this.config.driftWindow
    ) {
      // Calculate max drift in window
      const windowDrift = this.driftScores.slice(-this.config.driftWindow);
      const maxDrift = Math.max(...windowDrift);

      // Determine level
      let level: DriftAlert["level"] = "low";
      if (maxDrift >= this.config.alertLevels.high) {
        level = "high";
      } else if (maxDrift >= this.config.alertLevels.medium) {
        level = "medium";
      }

      const alert: DriftAlert = {
        level,
        driftScore: maxDrift,
        consecutiveDrifts: this.consecutiveDrifts,
        atTurn: this.turnCount,
        suggestedActions: this.suggestActions(),
        timestamp: Date.now(),
      };

      this.alerts.push(alert);
      newAlerts.push(alert);

      // Reset after alert to avoid spam
      this.consecutiveDrifts = 0;
    }

    return newAlerts;
  }

  /**
   * Get the current drift score (averaged over the window).
   * 0.0 = no drift, 1.0 = complete topic change.
   */
  getDriftScore(): number {
    const recent = this.driftScores.slice(-this.config.driftWindow);
    if (recent.length === 0) return 0.0;
    return recent.reduce((sum, s) => sum + s, 0) / recent.length;
  }

  /**
   * Get historical drift scores for graphing/monitoring.
   */
  getDriftScores(): number[] {
    return [...this.driftScores];
  }

  /**
   * Get all generated alerts.
   */
  getAlerts(): DriftAlert[] {
    return [...this.alerts];
  }

  /**
   * Detect drift in a flat array of messages (auto-grouped by turnSize).
   * Returns DriftAlert[] for batch analysis.
   */
  detectDrift(history: Array<{ role?: string; content: string }>, turnSize?: number): DriftAlert[];
  /**
   * Detect drift with pre-grouped turns (each element = one turn's messages).
   * Returns comprehensive DriftReport.
   */
  detectDrift(history: Array<Array<{ role?: string; content: string }>>): DriftReport;
  detectDrift(
    history: Array<{ role?: string; content: string }> | Array<Array<{ role?: string; content: string }>>,
    turnSize: number = 2
  ): DriftAlert[] | DriftReport {
    // Detect whether input is flat messages or grouped turns
    const isFlat = history.length > 0 && !Array.isArray(history[0]);

    if (isFlat) {
      const flatHistory = history as Array<{ role?: string; content: string }>;
      const tempDetector = new DriftDetector(this.config);
      const allAlerts: DriftAlert[] = [];

      // Group into turns
      for (let i = 0; i < flatHistory.length; i += turnSize) {
        const turn = flatHistory.slice(i, i + turnSize);
        const alerts = tempDetector.feedTurn(turn);
        allAlerts.push(...alerts);
      }

      return allAlerts;
    }

    // Pre-grouped turns path
    const groupedHistory = history as Array<Array<{ role?: string; content: string }>>;
    if (groupedHistory.length < 2) {
      return {
        drifted: false,
        driftScore: 0,
        maxDriftScore: 0,
        consecutiveDrifts: 0,
        alerts: [],
        currentTopics: groupedHistory.length > 0 ? TopicModel.extractTopics(groupedHistory[groupedHistory.length - 1]) : [],
        previousTopics: [],
      };
    }

    const tempDetector = new DriftDetector(this.config);
    for (const turn of groupedHistory) {
      tempDetector.feedTurn(turn);
    }

    const currentTopics = groupedHistory.length > 0
      ? TopicModel.extractTopics(groupedHistory[groupedHistory.length - 1])
      : [];
    const previousTopics = groupedHistory.length > 1
      ? TopicModel.extractTopics(groupedHistory[groupedHistory.length - 2])
      : [];

    const scores = tempDetector.getDriftScores();

    return {
      drifted: tempDetector.getAlerts().length > 0,
      driftScore: tempDetector.getDriftScore(),
      maxDriftScore: scores.length > 0 ? Math.max(...scores) : 0,
      consecutiveDrifts: tempDetector.getDriftScores().filter((s) => s > this.config.similarityThreshold).length,
      alerts: tempDetector.getAlerts(),
      currentTopics,
      previousTopics,
    };
  }

  /**
   * Suggest actions based on current drift severity.
   */
  suggestActions(): Action[] {
    const score = this.getDriftScore();
    const actions: Action[] = [];

    if (score >= this.config.alertLevels.high) {
      actions.push({
        type: "suggest_new_session",
        priority: 1,
        description: "Topic has drifted significantly — consider starting a new session",
      });
      actions.push({
        type: "compact",
        priority: 2,
        description: "Compact context to reduce noise from old topics",
      });
    } else if (score >= this.config.alertLevels.medium) {
      actions.push({
        type: "compact",
        priority: 1,
        description: "Moderate topic drift detected — compact context to refocus",
      });
      actions.push({
        type: "summarize",
        priority: 2,
        description: "Summarize key points before continuing",
      });
    } else if (score >= this.config.alertLevels.low) {
      actions.push({
        type: "refresh_memory",
        priority: 1,
        description: "Mild topic shift — refresh relevant memories",
      });
    }

    // Always include a default action
    if (actions.length === 0) {
      actions.push({
        type: "notify",
        priority: 3,
        description: "Context is stable — no action needed",
      });
    }

    return actions;
  }

  /**
   * Reset the detector state.
   */
  reset(): void {
    this.topicHistory = [];
    this.driftScores = [];
    this.consecutiveDrifts = 0;
    this.alerts = [];
    this.turnCount = 0;
    this.totalMessages = 0;
  }

  /**
   * Update configuration at runtime.
   */
  updateConfig(config: Partial<DriftConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   */
  getConfig(): DriftConfig {
    return { ...this.config };
  }
}
