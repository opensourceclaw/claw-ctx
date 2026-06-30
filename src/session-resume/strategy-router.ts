/**
 * claw-ctx session-resume module — Strategy Router
 *
 * Maps TaskType to AssemblyStrategyType.
 * Provides fallback to "balanced" for unknown types.
 *
 * v5.5.0: Initial implementation
 */

import type { TaskType } from "../adaptive/task-type-detector.js";
import {
  type AssemblyStrategyType,
  type ContextStrategy,
  STRATEGY_DEFINITIONS,
  getStrategy,
} from "./context-strategy.js";

/**
 * TaskType → AssemblyStrategyType mapping.
 * Determines which assembly strategy to use for each task type.
 */
const TASK_TO_ASSEMBLY: Record<TaskType, AssemblyStrategyType> = {
  coding:       "procedural_execution",    // "implement", "build" → need steps
  review:       "compositional_reasoning", // "review", "audit" → need cross-ref
  debugging:    "factual_recall",          // "debug", "error" → need facts
  planning:     "compositional_reasoning", // "plan", "design" → need evidence
  question:     "factual_recall",          // "how to", "what is" → need facts
  conversation: "balanced",                // casual → current behavior
  unknown:      "balanced",                // fallback → current behavior
};

/**
 * StrategyRouter — maps TaskType to AssemblyStrategy.
 */
export class StrategyRouter {
  /**
   * Map TaskType to AssemblyStrategyType.
   * Always returns a valid strategy (fallback to "balanced").
   */
  route(taskType: TaskType): AssemblyStrategyType {
    // Handle null/undefined gracefully
    if (!taskType) {
      return "balanced";
    }
    return TASK_TO_ASSEMBLY[taskType] ?? "balanced";
  }

  /**
   * Get full strategy definition for a task type.
   */
  getStrategy(taskType: TaskType): ContextStrategy {
    const strategyType = this.route(taskType);
    return getStrategy(strategyType);
  }

  /**
   * Get strategy by explicit type (for manual overrides).
   */
  getStrategyByType(strategyType: AssemblyStrategyType): ContextStrategy {
    return getStrategy(strategyType);
  }

  /**
   * Get all available strategy types.
   */
  getAvailableStrategies(): AssemblyStrategyType[] {
    return Object.keys(STRATEGY_DEFINITIONS) as AssemblyStrategyType[];
  }
}