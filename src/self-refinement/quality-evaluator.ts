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
 * claw-ctx v4.24.0 — QualityEvaluator
 *
 * 4-dimensional output quality evaluation: completeness, accuracy,
 * consistency, readability. Weighted average scoring.
 */

import type { QualityDimensionResult, QualityEvaluationResult, QualityEvaluatorConfig } from "./types.js";
import { DEFAULT_QUALITY_EVALUATOR_CONFIG } from "./types.js";

// ── Detection patterns ─────────────────────────────────────────────────

const INCOMPLETE_PATTERNS = [
  /\bTODO\b/, /\bFIXME\b/, /\bWIP\b/, /\bwork in progress\b/i,
  /\.\.\.$/, /\bto be continued\b/i,
];

const TRUNCATION_PATTERNS = [
  /[^.!?\n]$/,        // sentence doesn't end with period
  /`[^`]*$/,          // unclosed backtick
  /\|$/,              // trailing pipe (table cell)
];

const CJK_UNCLOSED_BRACKETS = [
  /【[^】]{0,500}$/, /「[^」]{0,500}$/, /（[^）]{0,500}$/,
];

const ERROR_PATTERNS = [
  /\berror\b/i, /\bfailed\b/i, /\bexception\b/i, /\bcrash\b/i,
];

const UNDEFINED_PATTERNS = [
  /\bundefined\b/i, /\bnull\b(?!\s*able)/i,
];

const NOT_FOUND_PATTERNS = [
  /\bnot found\b/i, /\bdoes not exist\b/i,
];

const LOW_CONFIDENCE_PATTERNS = [
  /\bI think\b/i, /\bI believe\b/i, /\bperhaps\b/i, /\bmaybe\b/i,
  /\bnot sure\b/i, /\bI'm not certain\b/i, /\bunclear\b/i,
  /\bpossibly\b/i, /\bprobably\b/i, /\bmight be\b/i,
];

const CONTRADICTION_PATTERNS = [
  /\bbut\b.*\bnot\b|\bhowever\b.*\bnot\b/i,
];

const STANCE_REVERSAL_PATTERNS = [
  /\bon the one hand\b.*\bon the other hand\b/i,
];

const PRONOUN_MIX = [
  /\bwe\b.*\bI\b|\bI\b.*\bwe\b/,
];

// ── QualityEvaluator ───────────────────────────────────────────────────

export class QualityEvaluator {
  config: QualityEvaluatorConfig;

  constructor(config?: Partial<QualityEvaluatorConfig>) {
    this.config = { ...DEFAULT_QUALITY_EVALUATOR_CONFIG, ...config };
  }

  evaluate(
    output: string,
    _context?: Array<{ role: string; content: string }>,
  ): QualityEvaluationResult {
    if (!output?.trim()) {
      const dim: QualityDimensionResult = {
        name: "completeness",
        score: 0,
        weight: this.config.completenessWeight,
        issues: ["Empty output"],
        suggestions: ["Generate a complete response"],
      };
      return {
        dimensions: [dim],
        overallScore: 0,
        passed: false,
        issues: ["Empty output"],
        suggestions: ["Generate a complete response"],
      };
    }

    // Security: Prevent ReDoS attacks by limiting input length
    const MAX_OUTPUT_LENGTH = 50000; // 50KB limit
    if (output.length > MAX_OUTPUT_LENGTH) {
      output = output.substring(0, MAX_OUTPUT_LENGTH);
    }

    const dimensions: QualityDimensionResult[] = [
      this._evalCompleteness(output),
      this._evalAccuracy(output),
      this._evalConsistency(output),
      this._evalReadability(output),
    ];

    let overallScore = 0;
    let weightSum = 0;
    const allIssues: string[] = [];
    const allSuggestions: string[] = [];

    for (const d of dimensions) {
      overallScore += d.score * d.weight;
      weightSum += d.weight;
      allIssues.push(...d.issues);
      allSuggestions.push(...d.suggestions);
    }

    overallScore = weightSum > 0 ? overallScore / weightSum : 0;
    overallScore = Math.max(0, Math.min(1, Math.round(overallScore * 100) / 100));

    return {
      dimensions,
      overallScore,
      passed: overallScore >= this.config.qualityThreshold,
      issues: allIssues,
      suggestions: allSuggestions,
    };
  }

  private _evalCompleteness(output: string): QualityDimensionResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 1.0;

    for (const p of INCOMPLETE_PATTERNS) {
      if (p.test(output)) {
        issues.push("Output contains incomplete markers");
        suggestions.push("Complete the pending sections");
        score -= 0.2;
        break;
      }
    }

    if (output.length < 20) {
      issues.push("Output is too short");
      suggestions.push("Provide more detailed response");
      score -= 0.3;
    }

    for (const p of TRUNCATION_PATTERNS) {
      if (p.test(output)) {
        issues.push("Output appears truncated");
        suggestions.push("Ensure the response is complete");
        score -= 0.15;
        break;
      }
    }

    for (const p of CJK_UNCLOSED_BRACKETS) {
      if (p.test(output)) {
        issues.push("Output has unclosed CJK brackets");
        suggestions.push("Close all brackets properly");
        score -= 0.15;
        break;
      }
    }

    score = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
    return {
      name: "completeness",
      score,
      weight: this.config.completenessWeight,
      issues,
      suggestions,
    };
  }

  private _evalAccuracy(output: string): QualityDimensionResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 1.0;

    for (const p of ERROR_PATTERNS) {
      if (p.test(output)) {
        issues.push("Output contains error-related language");
        suggestions.push("Verify correctness and fix reported errors");
        score -= 0.15;
        break;
      }
    }

    for (const p of UNDEFINED_PATTERNS) {
      if (p.test(output)) {
        issues.push("Output contains undefined/null references");
        suggestions.push("Replace undefined references with actual values");
        score -= 0.1;
        break;
      }
    }

    for (const p of NOT_FOUND_PATTERNS) {
      if (p.test(output)) {
        issues.push("Output mentions missing resources");
        suggestions.push("Verify resource availability");
        score -= 0.1;
        break;
      }
    }

    let lowConfCount = 0;
    for (const p of LOW_CONFIDENCE_PATTERNS) {
      if (p.test(output)) lowConfCount++;
    }
    if (lowConfCount >= 3) {
      issues.push(`Contains ${lowConfCount} low-confidence expressions`);
      suggestions.push("Use more definitive language or acknowledge uncertainty explicitly");
      score -= Math.min(0.3, lowConfCount * 0.08);
    }

    score = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
    return {
      name: "accuracy",
      score,
      weight: this.config.accuracyWeight,
      issues,
      suggestions,
    };
  }

  private _evalConsistency(output: string): QualityDimensionResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 1.0;

    for (const p of CONTRADICTION_PATTERNS) {
      if (p.test(output)) {
        issues.push("Possible self-contradiction detected");
        suggestions.push("Review consistency of statements");
        score -= 0.15;
        break;
      }
    }

    for (const p of STANCE_REVERSAL_PATTERNS) {
      if (p.test(output)) {
        issues.push("Stance reversal detected");
        suggestions.push("Maintain consistent position throughout");
        score -= 0.1;
        break;
      }
    }

    for (const p of PRONOUN_MIX) {
      if (p.test(output)) {
        issues.push("Inconsistent pronoun usage");
        suggestions.push("Use consistent point of view");
        score -= 0.05;
        break;
      }
    }

    score = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
    return {
      name: "consistency",
      score,
      weight: this.config.consistencyWeight,
      issues,
      suggestions,
    };
  }

  private _evalReadability(output: string): QualityDimensionResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 1.0;

    if (output.length > 50000) {
      issues.push("Output is excessively long");
      suggestions.push("Consider summarizing or splitting");
      score -= 0.1;
    }

    // Repetition: same word appears many times
    const words = output.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const freq: Record<string, number> = {};
    let maxFreq = 0;
    for (const w of words) {
      freq[w] = (freq[w] || 0) + 1;
      if (freq[w] > maxFreq) maxFreq = freq[w];
    }
    if (words.length > 0 && maxFreq / words.length > 0.15) {
      issues.push("Output has excessive word repetition");
      suggestions.push("Vary word choice to improve readability");
      score -= 0.1;
    }

    // No paragraph structure in long text
    if (output.length > 1000 && !output.includes("\n\n")) {
      issues.push("Output lacks paragraph structure");
      suggestions.push("Break content into logical paragraphs");
      score -= 0.1;
    }

    // Unclosed code fences
    const fenceMatches = output.match(/```/g);
    if (fenceMatches && fenceMatches.length % 2 !== 0) {
      issues.push("Output has unclosed code fence");
      suggestions.push("Close all code blocks properly");
      score -= 0.08;
    }

    score = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
    return {
      name: "readability",
      score,
      weight: this.config.readabilityWeight,
      issues,
      suggestions,
    };
  }
}
