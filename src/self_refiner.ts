/**
 * claw-ctx v5.1.0 — Self-Refinement Engine
 *
 * Evaluates and refines model outputs during the afterTurn phase.
 * Inspired by Self-Refine / Reflexion / ISR-LLM approaches.
 *
 * Flow: Turn → Assemble → Generate → Self-Evaluate →
 *        [if not satisfied] → Refine → Re-Evaluate →
 *        [satisfied or max retries] → AfterTurn → (end)
 *
 * v4.24.0: evaluate() delegates to QualityEvaluator for 4-dimensional scoring.
 */

import { QualityEvaluator } from "./self-refinement/quality-evaluator.js";

export interface SelfRefinerConfig {
  maxRetries: number;
  qualityThreshold: number;
  triggerOn: ("low-confidence" | "error-detected" | "always")[];
}

export interface EvaluationResult {
  score: number;
  passed: boolean;
  issues: string[];
  suggestions: string[];
}

export interface SelfRefinementResult {
  originalOutput: string;
  refinedOutput: string;
  evaluationScore: number;
  loops: number;
  accepted: boolean;
}

export const DEFAULT_SELF_REFINER_CONFIG: SelfRefinerConfig = {
  maxRetries: 3,
  qualityThreshold: 0.7,
  triggerOn: ["low-confidence", "error-detected"],
};

// ── Incomplete patterns (used by refine()) ─────────────────────────────

const INCOMPLETE_PATTERNS = [
  /\bTODO\b/, /\bFIXME\b/, /\bWIP\b/, /\bwork in progress\b/i,
  /\.\.\.$/, /\bto be continued\b/i,
];

// ── Similarity ────────────────────────────────────────────────────────

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const aWords = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const bWords = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (aWords.size === 0 || bWords.size === 0) return 0;
  let intersection = 0;
  for (const w of aWords) { if (bWords.has(w)) intersection++; }
  const union = new Set([...aWords, ...bWords]);
  return intersection / union.size;
}

// ── SelfRefiner ───────────────────────────────────────────────────────

export class SelfRefiner {
  config: SelfRefinerConfig;
  private _qualityEvaluator: QualityEvaluator;

  constructor(config?: Partial<SelfRefinerConfig>) {
    this.config = { ...DEFAULT_SELF_REFINER_CONFIG, ...config };
    this._qualityEvaluator = new QualityEvaluator({
      qualityThreshold: this.config.qualityThreshold,
    });
  }

  /** Evaluate output quality via QualityEvaluator (4 dimensions). */
  evaluate(output: string, _context?: Array<{ role: string; content: string }>): EvaluationResult {
    const qResult = this._qualityEvaluator.evaluate(output, _context);

    return {
      score: qResult.overallScore,
      passed: qResult.passed,
      issues: qResult.issues,
      suggestions: qResult.suggestions,
    };
  }

  /** Generate a refined version of the output based on evaluation feedback. */
  refine(output: string, feedback: string, _context?: Array<{ role: string; content: string }>): string {
    if (!output || !feedback) return output;

    // Apply rule-based improvements
    let refined = output;

    // Remove incomplete markers
    for (const p of INCOMPLETE_PATTERNS) {
      refined = refined.replace(p, "");
    }

    // Fix common issues
    refined = refined.replace(/\bundefined\b/gi, "specified");
    refined = refined.replace(/\bnull\b(?!\s*able)/gi, "none");

    // Append clarification if feedback indicates issues
    if (refined === output) {
      refined = output + "\n\n[Refined based on: " + feedback + "]";
    }

    return refined;
  }

  /** Full self-refinement loop: evaluate → refine → re-evaluate. */
  run(input: string, context?: Array<{ role: string; content: string }>): SelfRefinementResult {
    const originalOutput = input;
    let currentOutput = originalOutput;
    let evaluation = this.evaluate(currentOutput, context);
    let loops = 0;

    // Determine if we should trigger refinement
    const shouldTrigger = this.config.triggerOn.includes("always") ||
      (this.config.triggerOn.includes("low-confidence") && evaluation.issues.some(i => i.includes("low-confidence"))) ||
      (this.config.triggerOn.includes("error-detected") && evaluation.issues.some(i => i.includes("error") || i.includes("contradiction")));

    if (!shouldTrigger || evaluation.passed) {
      return {
        originalOutput,
        refinedOutput: currentOutput,
        evaluationScore: evaluation.score,
        loops: 0,
        accepted: evaluation.passed,
      };
    }

    // Refinement loop
    while (loops < this.config.maxRetries && !evaluation.passed) {
      const feedback = evaluation.issues.join("; ") + ". " + evaluation.suggestions.join(". ");
      const refined = this.refine(currentOutput, feedback, context);

      // Convergence check: stop if refined output is too similar to current
      if (similarity(refined, currentOutput) > 0.95) {
        currentOutput = refined;
        break;
      }

      currentOutput = refined;
      evaluation = this.evaluate(currentOutput, context);
      loops++;
    }

    return {
      originalOutput,
      refinedOutput: currentOutput,
      evaluationScore: evaluation.score,
      loops,
      accepted: evaluation.passed,
    };
  }
}
