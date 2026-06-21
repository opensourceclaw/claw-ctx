import type { TaskType } from "../adaptive/task-type-detector.js";

export interface PredictedItem {
  key: string;
  confidence: number;
  source: "frequency" | "co-occurrence" | "sequence";
}

export interface PredictionResult {
  items: PredictedItem[];
  taskType: TaskType;
  timestamp: number;
}

export interface ContextHistory {
  taskType: TaskType;
  contextUsed: string[];
  timestamp: number;
}
