/**
 * claw-ctx v5.1.0 — Self-Refinement Engine
 *
 * Evaluates and refines model outputs during the afterTurn phase.
 * Inspired by Self-Refine / Reflexion / ISR-LLM approaches.
 *
 * Flow: Turn → Assemble → Generate → Self-Evaluate →
 *        [if not satisfied] → Refine → Re-Evaluate →
 *        [satisfied or max retries] → AfterTurn → (end)
 */

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

// ── Issue detection patterns ─────────────────────────────────────────

const LOW_CONFIDENCE_PATTERNS = [
  /\bI think\b/i, /\bI believe\b/i, /\bperhaps\b/i, /\bmaybe\b/i,
  /\bnot sure\b/i, /\bI'm not certain\b/i, /\bunclear\b/i,
  /\bpossibly\b/i, /\bprobably\b/i, /\bmight be\b/i,
];

const ERROR_PATTERNS = [
  /\berror\b/i, /\bfailed\b/i, /\bundefined\b/i, /\bnull\b/i,
  /\bcannot\b/i, /\bunable to\b/i, /\bdoes not exist\b/i,
  /\bnot found\b/i, /\bexception\b/i, /\bcrash\b/i,
];

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

  constructor(config?: Partial<SelfRefinerConfig>) {
    this.config = { ...DEFAULT_SELF_REFINER_CONFIG, ...config };
  }

  /** Evaluate output quality across multiple dimensions. */
  evaluate(output: string, _context?: Array<{ role: string; content: string }>): EvaluationResult {
    if (!output?.trim()) {
      return { score: 0, passed: false, issues: ["Empty output"], suggestions: ["Generate a complete response"] };
    }

    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 1.0;

    // 1. Consistency detection — check for self-contradiction markers
    const hasContradiction = /\bbut\b.*\bnot\b|\bhowever\b.*\bnot\b/i.test(output);
    if (hasContradiction) {
      issues.push("Possible self-contradiction detected");
      suggestions.push("Review consistency of statements");
      score -= 0.15;
    }

    // 2. Completeness detection
    for (const p of INCOMPLETE_PATTERNS) {
      if (p.test(output)) {
        issues.push("Output appears incomplete");
        suggestions.push("Complete the pending sections");
        score -= 0.2;
        break;
      }
    }

    // 3. Low-confidence detection
    let lowConfCount = 0;
    for (const p of LOW_CONFIDENCE_PATTERNS) {
      if (p.test(output)) lowConfCount++;
    }
    if (lowConfCount >= 3) {
      issues.push(`Contains ${lowConfCount} low-confidence expressions`);
      suggestions.push("Use more definitive language or acknowledge uncertainty explicitly");
      score -= Math.min(0.3, lowConfCount * 0.08);
    }

    // 4. Error pattern detection
    for (const p of ERROR_PATTERNS) {
      if (p.test(output)) {
        issues.push("Output contains error-related language");
        suggestions.push("Verify correctness and fix reported errors");
        score -= 0.15;
        break;
      }
    }

    // 5. Format quality — basic heuristics
    if (output.length < 20) {
      issues.push("Output is too short");
      suggestions.push("Provide more detailed response");
      score -= 0.3;
    }
    if (output.length > 50000) {
      issues.push("Output is excessively long");
      suggestions.push("Consider summarizing or splitting");
      score -= 0.1;
    }

    score = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
    const passed = score >= this.config.qualityThreshold;

    return { score, passed, issues, suggestions };
  }

  /** Generate a refined version of the output based on evaluation feedback. */
  refine(output: string, feedback: string, _context?: Array<{ role: string; content: string }>): string {
    if (!output || !feedback) return output;

    // Build refinement prompt
    const lines: string[] = [];
    lines.push("[Self-Refinement]");
    lines.push(`Feedback: ${feedback}`);
    lines.push("");

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
