/**
 * claw-ctx v6.13.0 — P1 stage-progress trigger (design §1.1/§2)
 *
 * Compaction triggering moves from "pure token threshold" to
 * "token pressure + stage-boundary weighting": a task-stage transition
 * (host-supplied `stage` changing between two non-empty values) marks a
 * *safe* compaction point, so the effective threshold is lowered there and
 * compaction lands on the boundary instead of mid-task.
 *
 * All signals are local — no new LLM calls. Disabled (default) ⇒
 * `adjustThreshold` always returns the base threshold, so the afterTurn
 * threshold is byte-equal to v6.11.x.
 *
 * v6.14.0 W3 will re-calibrate `boundaryBonus` / `minTokens` from backfilled
 * data; those constants live here (single re-calibration surface) and are
 * labeled "conservative default" until then.
 */

export interface StageTriggerConfig {
  /** Off ⇒ adjustThreshold always returns base ⇒ afterTurn threshold byte-equals v6.11.x. */
  enabled: boolean;
  /** Fraction by which the effective threshold is lowered at a stage boundary (0-1). Conservative default, to be re-calibrated by v6.14.0 W3 backfill. */
  boundaryBonus: number;
  /** Stage-trigger floor: below this token count, no discount even at a boundary (prevents over-compaction). Conservative default, to be re-calibrated by v6.14.0 W3 backfill. */
  minTokens: number;
}

/** Conservative defaults, pending v6.14.0 W3 data backfill re-calibration. */
export const DEFAULT_STAGE_TRIGGER_CONFIG: StageTriggerConfig = {
  enabled: false,
  boundaryBonus: 0.10,
  minTokens: 50000,
};

interface SessionTriggerState {
  lastStage?: string;
  pendingTransition: boolean;
}

export class StageProgressTrigger {
  private config: StageTriggerConfig;
  private sessions = new Map<string, SessionTriggerState>();

  constructor(config?: Partial<StageTriggerConfig>) {
    this.config = { ...DEFAULT_STAGE_TRIGGER_CONFIG, ...(config ?? {}) };
  }

  /**
   * Host supplies the task stage (called from assemble). Semantics: ctx never
   * interprets stage meaning, only detects a change between two non-empty
   * values. First observation (no prior value) is NOT a boundary; empty values
   * do not participate (never guessed).
   */
  noteStage(sessionId: string, stage?: string): void {
    if (!this.config.enabled) return;
    if (!stage) return; // empty ⇒ not a signal (never guess)
    const s = this.sessions.get(sessionId) ?? { lastStage: undefined, pendingTransition: false };
    if (s.lastStage !== undefined && s.lastStage !== stage) {
      s.pendingTransition = true;
    }
    s.lastStage = stage;
    this.sessions.set(sessionId, s);
  }

  /**
   * Called at the trigger point (afterTurn). The boundary opportunity window is
   * the transition's own turn: this consumes `pendingTransition` on EVERY
   * evaluation (whether or not it discounts) — so a boundary that did not clear
   * the floor this turn does NOT discount next turn (that would compact
   * mid-stage, exactly what F1 says to avoid).
   *
   * Returns `floor(base * (1 - boundaryBonus))` iff a boundary was pending AND
   * `tokens >= minTokens`; otherwise returns `base` unchanged.
   */
  adjustThreshold(sessionId: string, baseThreshold: number, tokens: number): number {
    const s = this.sessions.get(sessionId);
    const hadPending = s?.pendingTransition ?? false;
    if (s) s.pendingTransition = false; // consume immediately (same-turn expiry)
    if (!this.config.enabled) return baseThreshold;
    if (!hadPending) return baseThreshold;
    if (tokens < this.config.minTokens) return baseThreshold;
    return Math.floor(baseThreshold * (1 - this.config.boundaryBonus));
  }

  resetSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
