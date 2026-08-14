/** claw-ctx v6.6.0 — Context Efficiency Metrics Types */

/** Utilization checkpoint (recorded at each shouldCompact decision point). */
export interface EfficiencyMetric {
  sessionId: string;
  modelId: string;
  /** currentTokens / effectiveBudget, 0-1. */
  utilization: number;
  effectiveBudget: number;
  currentTokens: number;
  timestamp: number;
}

/** Waste metric (recorded at each compaction event). */
export interface WasteMetric {
  sessionId: string;
  /** |tokensAfter - targetTokens| / targetTokens. */
  compactionDeltaRate: number;
  /** tokensBefore - threshold. Positive = triggered late, negative = early. */
  triggerGap: number;
  timestamp: number;
}

/** Per-session or aggregate efficiency snapshot. */
export interface EfficiencyReport {
  sessionId?: string;
  avgUtilization: number;
  peakUtilization: number;
  utilizationSamples: number;
  avgCompactionDeltaRate: number;
  avgTriggerGap: number;
  /** Latest recorded cache hit rate (0-1); 0 when nothing recorded. */
  cacheHitRate: number;
  compactionCount: number;
  timeRange: { start: number; end: number };
}
