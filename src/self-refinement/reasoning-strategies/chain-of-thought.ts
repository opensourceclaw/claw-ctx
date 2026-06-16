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
