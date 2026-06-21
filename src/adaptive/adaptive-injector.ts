/** v5.0.0-beta.3 — AdaptiveInjector */
import { TaskTypeDetector, type TaskType } from "./task-type-detector.js";
import { selectStrategy, adjustParameters, type StrategyConfig } from "./injection-strategy.js";

export interface InjectionConfig {
  strategy: StrategyConfig;
  adjustedMaxTokens: number;
  taskType: TaskType;
  confidence: number;
}

export class AdaptiveInjector {
  private detector = new TaskTypeDetector();

  getStrategy(taskType: TaskType): StrategyConfig {
    return selectStrategy(taskType);
  }

  adjust(strategy: StrategyConfig, context: { budget?: number; urgency?: string }): StrategyConfig {
    return adjustParameters(strategy, context);
  }

  async inject(input: string, context?: { budget?: number; urgency?: string; fileContext?: string[] }): Promise<InjectionConfig> {
    const sig = this.detector.detect(input, context?.fileContext);
    const strategy = selectStrategy(sig.type);
    const adjusted = adjustParameters(strategy, context ?? {});

    return {
      strategy: adjusted,
      adjustedMaxTokens: adjusted.maxTokens,
      taskType: sig.type,
      confidence: sig.confidence,
    };
  }
}
