/**
 * claw-ctx v4.24.0 — Graph-of-Thoughts Strategy
 *
 * Network-based reasoning with concept mapping and synthesis.
 */

import type { ReasoningStrategy } from "./base.js";

const PROMPT_TEMPLATE = "Build a network of ideas. Map relationships between concepts, identify dependencies, trace logical connections, and synthesize the most coherent solution.";

export class GraphOfThoughtsStrategy implements ReasoningStrategy {
  readonly name = "graph-of-thoughts";

  apply(prompt: string, options?: { enableNShot?: number; includeExamples?: boolean }): string {
    const parts: string[] = [prompt];
    parts.push(`\n[Reasoning Strategy: graph-of-thoughts]`);
    parts.push(PROMPT_TEMPLATE);

    if (options?.enableNShot && options.enableNShot > 0) {
      parts.push(`\nUse ${options.enableNShot} example${options.enableNShot > 1 ? "s" : ""} as reference patterns.`);
    }

    return parts.join("\n");
  }

  getSystemPromptAddition(): string {
    return `[Strategy: graph-of-thoughts] ${PROMPT_TEMPLATE}`;
  }
}
