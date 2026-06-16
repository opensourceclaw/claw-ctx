/**
 * claw-ctx v4.24.0 — Chain-of-Thought Strategy
 *
 * Step-by-step sequential reasoning.
 */

import type { ReasoningStrategy } from "./base.js";

const PROMPT_TEMPLATE = "Let's think step by step. Break down the problem and reason through each step carefully before arriving at a conclusion.";

export class ChainOfThoughtStrategy implements ReasoningStrategy {
  readonly name = "chain-of-thought";

  apply(prompt: string, options?: { enableNShot?: number; includeExamples?: boolean }): string {
    const parts: string[] = [prompt];
    parts.push(`\n[Reasoning Strategy: chain-of-thought]`);
    parts.push(PROMPT_TEMPLATE);

    if (options?.enableNShot && options.enableNShot > 0) {
      parts.push(`\nUse ${options.enableNShot} example${options.enableNShot > 1 ? "s" : ""} as reference patterns.`);
    }

    return parts.join("\n");
  }

  getSystemPromptAddition(): string {
    return `[Strategy: chain-of-thought] ${PROMPT_TEMPLATE}`;
  }
}
