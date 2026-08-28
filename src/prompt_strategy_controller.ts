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
 * claw-ctx v5.1.0 — Prompt Strategy Controller
 *
 * Dynamically selects reasoning strategies (CoT/ToT/GoT/Self-Consistency)
 * based on task type and complexity, then injects prompt templates into
 * the system prompt during context assembly.
 *
 * v4.24.0: Uses ReasoningStrategy instances from self-refinement module.
 */

import type { ReasoningStrategy as ReasoningStrategyInterface } from "./self-refinement/reasoning-strategies/base.js";
import { ChainOfThoughtStrategy } from "./self-refinement/reasoning-strategies/chain-of-thought.js";
import { TreeOfThoughtsStrategy } from "./self-refinement/reasoning-strategies/tree-of-thoughts.js";
import { GraphOfThoughtsStrategy } from "./self-refinement/reasoning-strategies/graph-of-thoughts.js";

export type ReasoningStrategy =
  | "direct"
  | "chain-of-thought"
  | "tree-of-thoughts"
  | "graph-of-thoughts"
  | "self-consistency";

export interface PromptStrategyConfig {
  defaultStrategy: ReasoningStrategy;
  taskStrategyMap: Record<string, ReasoningStrategy>;
  complexityThreshold: {
    "chain-of-thought": number;
    "tree-of-thoughts": number;
    "graph-of-thoughts": number;
  };
  selfConsistency: boolean;
  selfConsistencySamples: number;
}

export const DEFAULT_STRATEGY_CONFIG: PromptStrategyConfig = {
  defaultStrategy: "chain-of-thought",
  taskStrategyMap: {
    "code-generation": "chain-of-thought",
    "code-review": "tree-of-thoughts",
    "code-debugging": "tree-of-thoughts",
    "architecture-design": "graph-of-thoughts",
    "data-analysis": "chain-of-thought",
    "documentation": "direct",
    "testing": "tree-of-thoughts",
    "deployment": "direct",
    "security-audit": "graph-of-thoughts",
    "refactoring": "chain-of-thought",
    "quick-answer": "direct",
    "creative-writing": "tree-of-thoughts",
  },
  complexityThreshold: {
    "chain-of-thought": 0.3,
    "tree-of-thoughts": 0.5,
    "graph-of-thoughts": 0.7,
  },
  selfConsistency: true,
  selfConsistencySamples: 3,
};

// ── Strategy instances ────────────────────────────────────────────────

const STRATEGY_INSTANCES: Record<string, ReasoningStrategyInterface> = {
  "chain-of-thought": new ChainOfThoughtStrategy(),
  "tree-of-thoughts": new TreeOfThoughtsStrategy(),
  "graph-of-thoughts": new GraphOfThoughtsStrategy(),
};

// ── Task type detection ──────────────────────────────────────────────

interface Task {
  taskType: string;
  content: string;
  complexity?: number;
}

const TASK_TYPE_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /\bfix\b|\bbug\b|\berror\b|\bdebug\b|\btroubleshoot\b/i, type: "code-debugging" },
  { pattern: /\breview\b|\binspect\b|\baudit\b/i, type: "code-review" },
  { pattern: /\b(refactor|rewrite|restructure)\b/i, type: "refactoring" },
  { pattern: /\b(test|coverage|spec|assert)\b/i, type: "testing" },
  { pattern: /\b(deploy|release|publish|ship)\b/i, type: "deployment" },
  { pattern: /\b(security|vulnerability|threat|exploit)\b/i, type: "security-audit" },
  { pattern: /\b(architecture|design|structure|pattern)\b/i, type: "architecture-design" },
  { pattern: /\b(document|readme|changelog|comment)\b/i, type: "documentation" },
  { pattern: /\b(create|generate|implement|write|build|develop)\b/i, type: "code-generation" },
  { pattern: /\b(analyze|investigate|profile|benchmark)\b/i, type: "data-analysis" },
  { pattern: /\b(what|how|why|when|where|explain|summarize)\b/i, type: "quick-answer" },
];

// ── PromptStrategyController ──────────────────────────────────────────

export class PromptStrategyController {
  config: PromptStrategyConfig;

  constructor(config?: Partial<PromptStrategyConfig>) {
    this.config = { ...DEFAULT_STRATEGY_CONFIG, ...config };
  }

  /** Detect task type from content using pattern matching. */
  detectTaskType(content: string): string {
    if (!content?.trim()) return "quick-answer";

    let bestType = "quick-answer";
    let bestScore = 0;
    const lower = content.toLowerCase();

    for (const { pattern, type } of TASK_TYPE_PATTERNS) {
      const matches = lower.match(pattern);
      if (matches) {
        const score = matches.length;
        if (score > bestScore) {
          bestScore = score;
          bestType = type;
        }
      }
    }

    return bestType;
  }

  /** Estimate task complexity (0-1) from text characteristics. */
  detectComplexity(text: string): number {
    if (!text?.trim()) return 0;

    let score = 0;

    // Length: longer inputs tend to be more complex
    if (text.length > 500) score += 0.3;
    else if (text.length > 200) score += 0.15;

    // Multiple sentences suggest complexity
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length > 5) score += 0.2;
    else if (sentences.length > 2) score += 0.1;

    // Complex keywords
    const complexKeywords = /\b(complex|multiple|several|various|dependencies|trade-off|optimize|scale|architecture)\b/i;
    if (complexKeywords.test(text)) score += 0.2;

    // Code-related indicators
    const codeKeywords = /\b(function|class|module|API|endpoint|database|query|async|concurrent)\b/i;
    if (codeKeywords.test(text)) score += 0.15;

    // Multi-step indicators
    if (/\b(first|then|next|finally|after that|step)\b/i.test(text)) score += 0.15;

    return Math.min(1, Math.round(score * 100) / 100);
  }

  /** Select the optimal reasoning strategy based on task type and complexity. */
  selectStrategy(task: Task, _context?: Array<{ role: string; content: string }>): ReasoningStrategy {
    const taskType = task.taskType || this.detectTaskType(task.content);
    const complexity = task.complexity ?? this.detectComplexity(task.content);

    // Check task-specific override
    const mapped = this.config.taskStrategyMap[taskType];
    if (mapped) return mapped;

    // Complexity-based selection
    if (complexity >= this.config.complexityThreshold["graph-of-thoughts"]) {
      return "graph-of-thoughts";
    }
    if (complexity >= this.config.complexityThreshold["tree-of-thoughts"]) {
      return "tree-of-thoughts";
    }
    if (complexity >= this.config.complexityThreshold["chain-of-thought"]) {
      return "chain-of-thought";
    }

    return this.config.defaultStrategy;
  }

  /** Apply a reasoning strategy to a prompt, returning the augmented system message. */
  applyStrategy(
    prompt: string,
    strategy: ReasoningStrategy,
    options?: { enableNShot?: number; includeExamples?: boolean },
  ): string {
    // Delegate to strategy instance if available
    const instance = STRATEGY_INSTANCES[strategy];
    if (instance) {
      return instance.apply(prompt, options);
    }

    // "direct" strategy — no modification
    if (strategy === "direct") return prompt;

    // "self-consistency" — inline handling
    const parts: string[] = [prompt];
    if (this.config.selfConsistency) {
      parts.push(`\nGenerate ${this.config.selfConsistencySamples} independent solutions and select the most consistent result.`);
    }
    return parts.join("\n");
  }

  /** Get the strategy prompt template for use in system prompt. */
  getSystemPromptAddition(strategy: ReasoningStrategy): string {
    const instance = STRATEGY_INSTANCES[strategy];
    if (instance) return instance.getSystemPromptAddition();
    return "";
  }
}
