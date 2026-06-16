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
  injectMode: "full" | "compact" | "disabled";
  /** Store summary every afterTurn (default: true) */
  storeOnEveryTurn: boolean;
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
}

export interface HistoryLoadResult {
  entries: HistoryEntry[];
  /** Pre-formatted context string for injection */
  formatted: string;
  totalSessions: number;
  filteredByAge: number;
}
