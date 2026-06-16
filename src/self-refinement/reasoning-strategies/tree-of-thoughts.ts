/**
 * claw-ctx v4.24.0 — Tree-of-Thoughts Strategy
 *
 * Explore multiple solution paths and evaluate trade-offs.
 */

import type { ReasoningStrategy } from "./base.js";

const PROMPT_TEMPLATE = "Explore multiple solution paths. Consider at least 2-3 alternative approaches, evaluate their trade-offs, then select and execute the best one.";

export class TreeOfThoughtsStrategy implements ReasoningStrategy {
  readonly name = "tree-of-thoughts";

  apply(prompt: string, options?: { enableNShot?: number; includeExamples?: boolean }): string {
    const parts: string[] = [prompt];
    parts.push(`\n[Reasoning Strategy: tree-of-thoughts]`);
    parts.push(PROMPT_TEMPLATE);

    if (options?.enableNShot && options.enableNShot > 0) {
      parts.push(`\nUse ${options.enableNShot} example${options.enableNShot > 1 ? "s" : ""} as reference patterns.`);
    }

    return parts.join("\n");
  }

  getSystemPromptAddition(): string {
    return `[Strategy: tree-of-thoughts] ${PROMPT_TEMPLATE}`;
  }
}
