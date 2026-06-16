/**
 * claw-ctx v4.24.0 — ReasoningStrategy Interface
 */

export interface ReasoningStrategy {
  readonly name: string;
  apply(
    prompt: string,
    options?: { enableNShot?: number; includeExamples?: boolean },
  ): string;
  getSystemPromptAddition(): string;
}
