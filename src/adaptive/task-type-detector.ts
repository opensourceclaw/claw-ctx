/** v5.0.0-beta.3 — TaskTypeDetector */
export type TaskType = "coding" | "review" | "debugging" | "planning" | "question" | "conversation" | "unknown";

export interface TaskSignature {
  type: TaskType;
  confidence: number;
  keywords: string[];
}

const RULES: Array<{ type: TaskType; keywords: string[]; weight: number }> = [
  { type: "coding", keywords: ["implement", "create", "write code", "build", "add function"], weight: 1 },
  { type: "review", keywords: ["review", "check", "audit", "inspect", "examine"], weight: 1 },
  { type: "debugging", keywords: ["debug", "fix bug", "error", "crash", "broken", "issue"], weight: 1 },
  { type: "planning", keywords: ["plan", "design", "architect", "roadmap", "strategy"], weight: 1 },
  { type: "question", keywords: ["how to", "what is", "explain", "why", "when should"], weight: 0.8 },
  { type: "conversation", keywords: ["discuss", "talk about", "opinion", "thoughts"], weight: 0.7 },
];

export class TaskTypeDetector {
  private history = new Map<string, number>();

  detect(input: string, fileContext?: string[]): TaskSignature {
    const lower = input.toLowerCase();
    let best: TaskSignature = { type: "unknown", confidence: 0, keywords: [] };

    for (const rule of RULES) {
      const hits = rule.keywords.filter((kw) => lower.includes(kw));
      if (hits.length > 0) {
        const confidence = Math.min(0.95, hits.length * 0.25 * rule.weight);
        if (confidence > best.confidence) best = { type: rule.type, confidence, keywords: hits };
      }
    }

    if (fileContext?.length && best.type === "unknown") {
      if (fileContext.some((f) => /test|spec/.test(f))) best = { type: "coding", confidence: 0.6, keywords: ["file_context"] };
    }

    this.history.set(best.type, (this.history.get(best.type) ?? 0) + 1);
    return best;
  }
}
