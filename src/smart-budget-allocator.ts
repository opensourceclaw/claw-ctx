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
 * claw-ctx v4.5.0 — Smart Budget Allocator
 *
 * Dynamic budget allocation based on task type detection and context quality.
 * Distributes token budget across baseContext, crossDomain, CI, and buffer
 * based on the current task and context drift level.
 *
 * v4.5.0: Initial implementation
 */

import type { DriftDetector } from "./drift-detector.js";

// ── Types ──────────────────────────────────────────────────────────

export type TaskType = "coding" | "reasoning" | "writing" | "conversation" | "unknown";

export interface BudgetConfig {
  /** Total token budget available */
  totalBudget: number;
  /** Minimum tokens reserved for base context */
  minBaseContext: number;
  /** Minimum tokens reserved for buffer */
  minBuffer: number;
  /** Quality threshold for budget adjustment (0.0–1.0) */
  qualityThreshold: number;
  /** Learning rate for adaptive adjustments (0.0–1.0) */
  learningRate: number;
}

export interface BudgetAllocation {
  sessionId: string;
  totalBudget: number;
  baseContext: number;
  crossDomain: number;
  ci: number;
  buffer: number;
  taskType: TaskType;
  taskConfidence: number;
  quality: number;
  driftScore: number;
  timestamp: number;
}

export interface AllocationHistory {
  allocation: BudgetAllocation;
  reason: string;
}

/** Task-type-specific budget profiles (base/cross/ci/buffer percentages) */
export interface TaskBudgetProfile {
  basePct: number;
  crossDomainPct: number;
  ciPct: number;
  bufferPct: number;
}

// ── Defaults ───────────────────────────────────────────────────────

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  totalBudget: 8000,
  minBaseContext: 1000,
  minBuffer: 400,
  qualityThreshold: 0.5,
  learningRate: 0.3,
};

/** Default budget profiles per task type (must sum to 100) */
export const TASK_BUDGET_PROFILES: Record<TaskType, TaskBudgetProfile> = {
  coding:       { basePct: 60, crossDomainPct: 5,  ciPct: 10, bufferPct: 25 },
  reasoning:    { basePct: 50, crossDomainPct: 15, ciPct: 15, bufferPct: 20 },
  writing:      { basePct: 55, crossDomainPct: 10, ciPct: 10, bufferPct: 25 },
  conversation: { basePct: 70, crossDomainPct: 5,  ciPct: 5,  bufferPct: 20 },
  unknown:      { basePct: 55, crossDomainPct: 10, ciPct: 10, bufferPct: 25 },
};

// ── TaskTypeDetector ───────────────────────────────────────────────

/**
 * Detects the current task type from conversation messages.
 * Uses keyword matching with priority-based classification.
 */
export class TaskTypeDetector {
  private static readonly TASK_PATTERNS: Record<TaskType, RegExp[]> = {
    coding: [
      /\b(code|coding|program|implement|bug|fix|deploy|build|compile|test|refactor|function|class|module|import|export|interface|type|api|endpoint|database|sql|schema|migration|docker|kubernetes|ci|cd|pipeline|git|commit|branch|merge|pull request)\b/i,
      /\.(ts|js|py|rs|go|java|cpp|json|yaml|yml|toml|sql)\b/,
      /\b(npm|yarn|pnpm|cargo|pip|maven|gradle)\b/,
    ],
    reasoning: [
      /\b(why|analyze|analysis|reason|logic|problem|solution|hypothes|evaluate|assess|compare|contrast|diagnose|root cause|trade.off|decision)\b/i,
      /\b(think about|consider|pros.*cons|what if|how would)\b/i,
    ],
    writing: [
      /\b(write|document|article|blog|content|draft|edit|revise|proofread|summary|summarize|README|changelog|release note)\b/i,
      /\.(md|txt|rst|adoc)\b/,
    ],
    conversation: [
      /\b(hi|hello|hey|how are you|thanks|thank you|bye|goodbye|what's up|sup)\b/i,
      /\b(chat|talk|discuss)\b/i,
    ],
    unknown: [],
  };

  /** Detect task type from recent messages */
  detect(messages: Array<{ role?: string; content: string }>): TaskType {
    if (messages.length === 0) return "unknown";

    const text = messages
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join(" ");

    // Score each task type
    const scores: Record<TaskType, number> = {
      coding: 0,
      reasoning: 0,
      writing: 0,
      conversation: 0,
      unknown: 0,
    };

    for (const [type, patterns] of Object.entries(TaskTypeDetector.TASK_PATTERNS)) {
      if (type === "unknown") continue;
      for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches) {
          scores[type as TaskType] += matches.length;
        }
      }
    }

    // Find the highest-scoring type
    let bestType: TaskType = "unknown";
    let bestScore = 0;
    for (const [type, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type as TaskType;
      }
    }

    // If no clear winner or score too low, return unknown
    if (bestScore < 2) return "unknown";
    return bestType;
  }

  /** Get confidence level of the detection (0.0–1.0) */
  getConfidence(messages: Array<{ role?: string; content: string }>): number {
    if (messages.length === 0) return 0;

    const text = messages
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join(" ");

    // Count total keyword matches across all types
    let totalMatches = 0;
    let bestMatches = 0;

    for (const [type, patterns] of Object.entries(TaskTypeDetector.TASK_PATTERNS)) {
      if (type === "unknown") continue;
      let matches = 0;
      for (const pattern of patterns) {
        matches += (text.match(pattern) || []).length;
      }
      if (matches > bestMatches) bestMatches = matches;
      totalMatches += matches;
    }

    if (totalMatches === 0) return 0;

    // Confidence = ratio of dominant type matches to all matches
    return Math.min(1.0, bestMatches / Math.max(1, totalMatches));
  }
}

// ── QualityBasedAdjuster ───────────────────────────────────────────

/**
 * Adjusts budget allocation based on context quality score.
 * Higher quality → optimized for core context (more base)
 * Lower quality → safety buffer increased (more buffer for compaction)
 */
export class QualityBasedAdjuster {
  private config: BudgetConfig;

  constructor(config: BudgetConfig) {
    this.config = config;
  }

  /**
   * Calculate budget adjustment percentage based on quality score.
   * Returns positive value = shift towards buffer (lower quality).
   * Returns negative value = shift towards base (higher quality).
   */
  calculateAdjustment(quality: number): number {
    // quality: 0.0 (bad) to 1.0 (good)
    // threshold below which we shift to buffer
    const belowThreshold = this.config.qualityThreshold - quality;

    if (belowThreshold <= 0) {
      // Quality is good — give bonus to base context
      const bonus = Math.abs(belowThreshold) * 10; // up to 5% bonus
      return -Math.min(bonus, 10) || 0; // ensure exactly 0 at threshold
    }

    // Quality is low — shift to buffer
    const shift = belowThreshold * 20; // up to 10% shift
    return Math.min(shift, 15);
  }

  /**
   * Apply budget shift to a task profile.
   * Returns adjusted profile with percentages summing to ~100.
   */
  applyBudgetShift(profile: TaskBudgetProfile, shift: number): TaskBudgetProfile {
    let basePct = profile.basePct - shift;
    let bufferPct = profile.bufferPct + shift;

    // Clamp
    basePct = Math.max(10, Math.min(80, basePct));
    bufferPct = Math.max(5, Math.min(40, bufferPct));

    // Normalize: adjust buffer to compensate
    const total = basePct + profile.crossDomainPct + profile.ciPct + bufferPct;
    if (Math.abs(total - 100) > 0.5) {
      const diff = 100 - total;
      bufferPct += diff;
    }

    return {
      basePct: Math.round(basePct),
      crossDomainPct: profile.crossDomainPct,
      ciPct: profile.ciPct,
      bufferPct: Math.round(Math.max(5, bufferPct)),
    };
  }
}

// ── SmartBudgetAllocator ───────────────────────────────────────────

/**
 * Main budget allocator combining task type detection and quality-based
 * adjustment for intelligent budget distribution.
 */
export class SmartBudgetAllocator {
  private config: BudgetConfig;
  private taskDetector: TaskTypeDetector;
  private qualityAdjuster: QualityBasedAdjuster;
  private history: AllocationHistory[] = [];
  private driftDetector: DriftDetector | null = null;

  constructor(config: Partial<BudgetConfig> = {}) {
    this.config = { ...DEFAULT_BUDGET_CONFIG, ...config };
    this.taskDetector = new TaskTypeDetector();
    this.qualityAdjuster = new QualityBasedAdjuster(this.config);
  }

  /** Attach a drift detector for quality scoring */
  setDriftDetector(detector: DriftDetector): void {
    this.driftDetector = detector;
  }

  /**
   * Allocate budget for a session based on task type and context quality.
   */
  allocate(
    sessionId: string,
    totalBudget: number,
    messages?: Array<{ role?: string; content: string }>,
  ): BudgetAllocation {
    // Detect task type
    const taskType = messages
      ? this.taskDetector.detect(messages)
      : "unknown";
    const taskConfidence = messages
      ? this.taskDetector.getConfidence(messages)
      : 0;

    // Get base profile for task type
    const profile = TASK_BUDGET_PROFILES[taskType];

    // Calculate quality from drift detector
    let quality = 0.5; // Default moderate quality
    let driftScore = 0;

    if (this.driftDetector) {
      driftScore = this.driftDetector.getDriftScore();
      quality = 1.0 - driftScore; // Lower drift = higher quality
    }

    // Apply quality-based adjustment
    const adjustment = this.qualityAdjuster.calculateAdjustment(quality);
    const adjustedProfile = this.qualityAdjuster.applyBudgetShift(profile, adjustment);

    // Apply learning rate for smooth transitions
    let finalBasePct = adjustedProfile.basePct;
    let finalBufferPct = adjustedProfile.bufferPct;

    if (this.history.length > 0) {
      const prev = this.history[this.history.length - 1].allocation;
      const prevBasePct = (prev.baseContext / prev.totalBudget) * 100;
      const prevBufferPct = (prev.buffer / prev.totalBudget) * 100;

      finalBasePct = prevBasePct + this.config.learningRate * (adjustedProfile.basePct - prevBasePct);
      finalBufferPct = prevBufferPct + this.config.learningRate * (adjustedProfile.bufferPct - prevBufferPct);
    }

    // Calculate absolute values
    const baseContext = Math.max(
      this.config.minBaseContext,
      Math.round((totalBudget * finalBasePct) / 100)
    );
    const crossDomain = Math.round((totalBudget * adjustedProfile.crossDomainPct) / 100);
    const ci = Math.round((totalBudget * adjustedProfile.ciPct) / 100);
    const buffer = Math.max(
      this.config.minBuffer,
      totalBudget - baseContext - crossDomain - ci
    );

    const allocation: BudgetAllocation = {
      sessionId,
      totalBudget,
      baseContext,
      crossDomain,
      ci,
      buffer,
      taskType,
      taskConfidence,
      quality,
      driftScore,
      timestamp: Date.now(),
    };

    const reason =
      `taskType=${taskType} (confidence=${taskConfidence.toFixed(2)}), ` +
      `quality=${quality.toFixed(2)}, drift=${driftScore.toFixed(2)}, ` +
      `adjustment=${adjustment > 0 ? "+" : ""}${adjustment.toFixed(1)}%, ` +
      `profile=${adjustedProfile.basePct}/${adjustedProfile.crossDomainPct}/${adjustedProfile.ciPct}/${adjustedProfile.bufferPct}`;

    this.history.push({ allocation, reason });

    return allocation;
  }

  /**
   * Adjust budget by task type and quality score.
   * For incremental adjustments within an active session.
   */
  adjust(taskType: TaskType, quality: number): Partial<BudgetAllocation> {
    const profile = TASK_BUDGET_PROFILES[taskType];
    const adjustment = this.qualityAdjuster.calculateAdjustment(quality);
    const adjusted = this.qualityAdjuster.applyBudgetShift(profile, adjustment);

    return {
      taskType,
      quality,
      baseContext: adjusted.basePct,
      crossDomain: adjusted.crossDomainPct,
      ci: adjusted.ciPct,
      buffer: adjusted.bufferPct,
    };
  }

  /** Get allocation history */
  getHistory(): AllocationHistory[] {
    return [...this.history];
  }

  /** Get the task type detector for external use */
  getTaskDetector(): TaskTypeDetector {
    return this.taskDetector;
  }

  /** Get the last allocation (for DriftBudgetLinker integration) */
  getAllocation(): BudgetAllocation | null {
    if (this.history.length === 0) return null;
    return this.history[this.history.length - 1].allocation;
  }

  /** Get current config */
  getConfig(): BudgetConfig {
    return { ...this.config };
  }

  /** Update config at runtime */
  updateConfig(config: Partial<BudgetConfig>): void {
    this.config = { ...this.config, ...config };
    this.qualityAdjuster = new QualityBasedAdjuster(this.config);
  }

  /** Reset history */
  resetHistory(): void {
    this.history = [];
  }
}
