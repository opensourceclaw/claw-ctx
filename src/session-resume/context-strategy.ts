/**
 * claw-ctx session-resume module — Context Strategy
 *
 * Defines assembly strategies for context loading.
 * Strategies are pure data — configuration objects, not code.
 *
 * v5.5.0: Initial implementation
 */

/**
 * 5 strategy types — orthogonal to TaskType.
 * First 4 are task-specific, "balanced" is the default fallback.
 */
export type AssemblyStrategyType =
  | "factual_recall"       // "what is", "who", facts → entity index + relevance
  | "temporal_reasoning"   // "timeline", "sequence" → hierarchical + chronological
  | "procedural_execution" // "how to", "steps" → raw traces + operation order
  | "compositional_reasoning" // "design", "trade-off" → cross-session evidence
  | "balanced";            // default — current behavior

/**
 * Parameters controlling how context is loaded and assembled.
 * Strategy definitions are pure data — these config objects.
 */
export interface AssemblyParams {
  // === HistoryLoader params ===

  /** History loading mode */
  historyMode: "flat" | "hierarchical";

  /** Maximum sessions to load */
  maxHistorySessions: number;

  /** Maximum age in hours */
  maxAgeHours: number;

  // === Post-load processing ===

  /** Sort order for results (applied post-load by Assembler) */
  sortBy: "recency" | "relevance" | "chronological";

  /** Whether to include entity index in output */
  includeEntities: boolean;

  /** Whether to preserve timestamps in formatted output */
  preserveTimestamps: boolean;

  // === Completeness ===

  /** Completeness threshold (0-1). Higher = stricter. */
  completenessThreshold: number;

  // === Strategy-specific ===

  /** For procedural: include error/fix patterns */
  includeErrorPatterns?: boolean;

  /** For compositional: cross-session link depth */
  crossSessionDepth?: number;
}

/**
 * Complete strategy definition.
 * Each strategy is self-contained with all params needed for assembly.
 */
export interface ContextStrategy {
  /** Strategy identifier */
  type: AssemblyStrategyType;

  /** Assembly parameters */
  params: AssemblyParams;

  /** Human-readable description for debugging */
  description: string;

  /** Format template ID (maps to template function) */
  formatTemplate: "facts" | "timeline" | "procedural" | "evidence" | "default";
}

/**
 * Strategy definitions — immutable configuration.
 */
export const STRATEGY_DEFINITIONS: Record<AssemblyStrategyType, ContextStrategy> = {
  factual_recall: {
    type: "factual_recall",
    params: {
      historyMode: "flat",
      maxHistorySessions: 5,
      maxAgeHours: 72,
      sortBy: "relevance",
      includeEntities: true,
      preserveTimestamps: false,
      completenessThreshold: 0.6,
    },
    description: "Optimized for fact retrieval — entity index + relevance sorting",
    formatTemplate: "facts",
  },

  temporal_reasoning: {
    type: "temporal_reasoning",
    params: {
      historyMode: "hierarchical",
      maxHistorySessions: 10,
      maxAgeHours: 168, // 7 days
      sortBy: "chronological",
      includeEntities: false,
      preserveTimestamps: true,
      completenessThreshold: 0.4,
    },
    description: "Optimized for timeline/sequence — hierarchical + timestamps",
    formatTemplate: "timeline",
  },

  procedural_execution: {
    type: "procedural_execution",
    params: {
      historyMode: "flat",
      maxHistorySessions: 5,
      maxAgeHours: 48,
      sortBy: "recency",
      includeEntities: false,
      preserveTimestamps: true,
      completenessThreshold: 0.5,
      includeErrorPatterns: true,
    },
    description: "Optimized for step execution — raw traces + operation order",
    formatTemplate: "procedural",
  },

  compositional_reasoning: {
    type: "compositional_reasoning",
    params: {
      historyMode: "flat",
      maxHistorySessions: 8,
      maxAgeHours: 168, // 7 days
      sortBy: "relevance",
      includeEntities: true,
      preserveTimestamps: false,
      completenessThreshold: 0.7,
      crossSessionDepth: 2,
    },
    description: "Optimized for cross-session reasoning — evidence + completeness",
    formatTemplate: "evidence",
  },

  balanced: {
    type: "balanced",
    params: {
      historyMode: "flat",
      maxHistorySessions: 3,
      maxAgeHours: 48,
      sortBy: "recency",
      includeEntities: false,
      preserveTimestamps: false,
      completenessThreshold: 0.4,
    },
    description: "Default balanced behavior — current implementation",
    formatTemplate: "default",
  },
};

/**
 * Get a strategy by type, with fallback to balanced.
 */
export function getStrategy(type: AssemblyStrategyType): ContextStrategy {
  return STRATEGY_DEFINITIONS[type] ?? STRATEGY_DEFINITIONS.balanced;
}
