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
 * claw-ctx session-resume module — Type Definitions
 *
 * v1.0.0: Initial implementation
 */

export interface SessionSummary {
  /** Dominant topic / keyword summary */
  theme: string;
  /** Extracted TODO / next / fix / remaining items */
  pendingTasks: string[];
  /** Extracted decisions, important notes, learned items */
  keyPoints: string[];
  /** Date.now() when generated */
  timestamp: number;
  /** Originating session ID */
  sessionId: string;
  /** How many messages were analyzed */
  messageCount: number;
  /** Top entities from SessionStateExtractor */
  entities: string[];
}

export interface SessionResumeConfig {
  /** How many past sessions to load (default: 3) */
  maxHistorySessions: number;
  /** Discard sessions older than this (default: 48) */
  maxAgeHours: number;
  /** Minimum relevance score threshold (default: 0.3) */
  minRelevance: number;
  /** How to inject history */
  injectMode: "full" | "compact" | "recap" | "disabled";
  /** Store summary every afterTurn (default: true) */
  storeOnEveryTurn: boolean;
  // v5.3.0: Completeness configuration
  /** Minimum completeness score threshold (default: 0.4) */
  completenessThreshold?: number;
  /** Enable adaptive expansion when completeness is low (default: true) */
  adaptiveExpansion?: boolean;
  // v5.4.0: History loading mode
  /** History loading mode (default: "flat") */
  historyMode?: "flat" | "hierarchical";
  // v5.4.0: Hierarchical loader settings
  hierarchicalLoader?: {
    /** Number of most recent sessions for level 1 (default: 3) */
    recentSessionCount?: number;
    /** Days threshold for level 2 (default: 7) */
    weekBoundaryDays?: number;
    /** Maximum age in days for level 3 (default: 30) */
    level3MaxAgeDays?: number;
    /** Semantic similarity threshold for dedup (default: 0.7) */
    dedupThreshold?: number;
  };
}

export const DEFAULT_SESSION_RESUME_CONFIG: SessionResumeConfig = {
  maxHistorySessions: 3,
  maxAgeHours: 48,
  minRelevance: 0.3,
  injectMode: "full",
  storeOnEveryTurn: true,
};

export interface HistoryEntry {
  summary: SessionSummary;
  /** claw-mem memory ID for dedup */
  memoryId: string;
  /** Timestamp of storage */
  storedAt: number;
  /** v5.6.0: Relevance score from search (0-1), if available */
  relevanceScore?: number;
}

/** v5.1.0: Session Snapshot for checkpoint/recovery. Mirrors claw-mem SessionSnapshot. */
export interface SessionSnapshot {
  sessionId: string;
  startedAt: number;
  lastActiveAt: number;
  turnCount: number;
  currentTopic: string;
  activeTask?: { description: string; progress: string };
  recentDecisions: string[];
  pendingItems: string[];
  keyEntities: string[];
  isClosed: boolean;
}

/** v5.1.0: CheckpointManager configuration. */
export interface CheckpointConfig {
  mode: "every_turn" | "every_n_turns" | "disabled";
  interval: number;
  maxRecoveryAgeHours: number;
}

export interface HistoryLoadResult {
  entries: HistoryEntry[];
  /** Pre-formatted context string for injection */
  formatted: string;
  totalSessions: number;
  filteredByAge: number;
  // v5.3.0: Completeness metadata
  completeness?: CompletenessReport;
}

// v5.3.0: Completeness reporting

export interface CompletenessReport {
  /** Overall completeness score (0-1), undefined if unavailable */
  score?: number;
  /** Assessment recommendation */
  assessment: "use" | "expand" | "max_expand" | "unavailable";
  /** Number of expansion rounds performed (0-2) */
  expansionRounds: number;
  /** Optional breakdown from hybrid_search */
  breakdown?: {
    coverage: number;
    diversity: number;
    confidence: number;
  };
}

// v5.4.0: Hierarchical history types

export type BucketLevel = "recent" | "this_week" | "older";

export interface HierarchicalHistory {
  level1: SessionSummary[];
  level2: SessionSummary[];
  level3: SessionSummary[];
  allPendingTasks: string[];
  entities: Map<string, number>;
}

// v5.5.0: Adaptive Context Assembler types

export type AssemblyStrategyType =
  | "factual_recall"
  | "temporal_reasoning"
  | "procedural_execution"
  | "compositional_reasoning"
  | "balanced";

export interface AssemblyParams {
  historyMode: "flat" | "hierarchical";
  maxHistorySessions: number;
  maxAgeHours: number;
  sortBy: "recency" | "relevance" | "chronological";
  includeEntities: boolean;
  preserveTimestamps: boolean;
  completenessThreshold: number;
  includeErrorPatterns?: boolean;
  crossSessionDepth?: number;
}

export interface AssemblyResult {
  strategy: AssemblyStrategyType;
  historyResult: HistoryLoadResult;
  formatted: string;
  metadata: {
    taskType: string;
    strategy: AssemblyStrategyType;
    loadTimeMs: number;
    entryCount: number;
    completenessScore?: number;
  };
}

// v5.7.0: Recap types for session recap injection

export interface Recap {
  /** What we were doing in the session */
  whatWereWeDoing: string;
  /** What is the next step */
  whatIsNext: string;
  /** When the recap was generated */
  timestamp: number;
  /** Session identifier */
  sessionId: string;
}

export interface RecapLoadResult {
  recap: Recap | null;
  formatted: string | null;
  sessionId: string;
}
