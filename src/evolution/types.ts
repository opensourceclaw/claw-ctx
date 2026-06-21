export interface ContextItem {
  content: string;
  score: number;
  source?: string;
}

export type ContextStrategy =
  | "aggressive_recall"
  | "selective_recall"
  | "minimal_context"
  | "drift_adaptive";

export interface ContextSnapshot {
  id: string;
  sessionId: string;
  timestamp: number;
  strategy: ContextStrategy;
  taskType: string;
  input: {
    query: string;
    budget: number;
    topK: number;
  };
  output: {
    selectedItems: ContextItem[];
    tokenCount: number;
    itemKeys: string[];
  };
  outcome?: {
    effective: boolean;
    score?: number;
  };
}

export interface ModifiedItem {
  key: string;
  previousScore: number;
  currentScore: number;
  delta: number;
}

export interface ChangeReport {
  additions: ContextItem[];
  deletions: string[];
  modifications: ModifiedItem[];
  stability: number;
  timestamp: number;
}
