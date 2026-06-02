/**
 * claw-ctx v2.0.0 — RL Experience Injector
 *
 * Injects claw-rl learning results into the context assembly pipeline.
 */
export interface RLExperience {
  id: string;
  taskType: string;
  outcome: "success" | "failure";
  pattern: string;
  confidence: number;
  learnedAt: Date;
}

export interface RLInjectRequest {
  sessionId: string;
  taskType?: string;
  topK?: number;
}

export interface RLInjectResponse {
  experiences: RLExperience[];
  injectedTokens: number;
}

/**
 * Simulation of a claw-rl bridge for development/testing.
 * In production, this would connect to the claw-rl plugin via OpenClaw bridge.
 */
export interface RLProvider {
  /** Fetch relevant experiences for a given session/task */
  getExperiences(params: { sessionId: string; taskType?: string; topK?: number }): Promise<RLExperience[]>;
}

/** Default provider that returns empty — used when claw-rl is not available */
class NoopRLProvider implements RLProvider {
  async getExperiences(): Promise<RLExperience[]> {
    return [];
  }
}

/** Simple local provider for testing */
export class MockRLProvider implements RLProvider {
  private experiences: RLExperience[] = [];

  async getExperiences(params: { sessionId: string; taskType?: string; topK?: number }): Promise<RLExperience[]> {
    let filtered = this.experiences;
    if (params.taskType) {
      filtered = filtered.filter((e) => e.taskType === params.taskType);
    }
    return filtered.slice(0, params.topK ?? 5);
  }

  addExperience(exp: RLExperience): void {
    this.experiences.push(exp);
  }

  clear(): void {
    this.experiences = [];
  }
}

function estimateTokens(text: string): number {
  let t = 0;
  for (const ch of text) {
    t += /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch) ? 1 : 1 / 3.5;
  }
  return Math.ceil(t);
}

export class RLInjector {
  private provider: RLProvider;

  constructor(provider?: RLProvider) {
    this.provider = provider ?? new NoopRLProvider();
  }

  /**
   * Inject RL experiences into context.
   */
  async inject(params: RLInjectRequest): Promise<RLInjectResponse> {
    const experiences = await this.provider.getExperiences({
      sessionId: params.sessionId,
      taskType: params.taskType,
      topK: params.topK ?? 5,
    });

    let injectedTokens = 0;
    for (const exp of experiences) {
      injectedTokens += estimateTokens(exp.pattern);
    }

    return { experiences, injectedTokens };
  }

  /**
   * Format RL experiences as context lines for injection into system prompt.
   */
  formatForContext(experiences: RLExperience[]): string {
    if (experiences.length === 0) return "";

    const lines = experiences.map((exp) => {
      const icon = exp.outcome === "success" ? "✅" : "❌";
      const label = exp.outcome === "success" ? "Learned (success)" : "Caution (failure)";
      return `- ${icon} [${label}] ${exp.taskType}: ${exp.pattern} (confidence: ${(exp.confidence * 100).toFixed(0)}%)`;
    });

    return `[RL Experience]\n${lines.join("\n")}`;
  }

  /** Replace the provider at runtime */
  setProvider(provider: RLProvider): void {
    this.provider = provider;
  }
}
