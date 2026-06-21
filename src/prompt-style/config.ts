/**
 * claw-ctx v5.0.0-rc.1 — StyleConfig + default templates
 */

import type { PromptStyle } from "./types.js";
import type { TaskType } from "../adaptive/task-type-detector.js";

export interface StyleConfig {
  type: PromptStyle;
  template: string;
  variables: string[];
}

export const DEFAULT_STYLE_TEMPLATES: Record<PromptStyle, StyleConfig> = {
  descriptive: {
    type: "descriptive",
    template: "[Context] Relevant information:\n{items}",
    variables: ["items"],
  },
  prescriptive: {
    type: "prescriptive",
    template: "[Context] Use the following to answer:\n{items}",
    variables: ["items"],
  },
  prohibitive: {
    type: "prohibitive",
    template: "[Context] Available (DO NOT use items tagged [exclude]):\n{items}",
    variables: ["items"],
  },
  explanatory: {
    type: "explanatory",
    template: "[Context] Selected because: {reasons}\n\nRelevant items:\n{items}",
    variables: ["reasons", "items"],
  },
  conditional: {
    type: "conditional",
    template: "[Context] If the request involves: {conditions}\nConsider:\n{items}",
    variables: ["conditions", "items"],
  },
};

// ponytail: TaskType → PromptStyle mapping, simple lookup
export const TASK_STYLE_MAP: Partial<Record<TaskType, PromptStyle>> = {
  coding: "prescriptive",
  review: "explanatory",
  debugging: "conditional",
  planning: "descriptive",
  question: "descriptive",
  conversation: "descriptive",
};

export function resolveStyle(taskType: TaskType, explicit?: PromptStyle): PromptStyle {
  if (explicit) return explicit;
  return TASK_STYLE_MAP[taskType] ?? "descriptive";
}
