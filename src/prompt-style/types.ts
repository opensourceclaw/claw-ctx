/**
 * claw-ctx v5.0.0-rc.1 — PromptStyle types
 *
 * Multi-style prompt formatting engine. Defines the 5 writing styles
 * discovered in MSR 2026 RQ2 for context presentation.
 */

export type PromptStyle =
  | "descriptive"   // Describe current context state
  | "prescriptive"  // Prescribe selection/usage rules
  | "prohibitive"   // Exclude rules
  | "explanatory"   // Explain selection reasons
  | "conditional";  // Conditional inclusion
