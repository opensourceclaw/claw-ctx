/**
 * claw-ctx v2.0.0 — Governance Signal Injector
 *
 * Passes neoclaw L1-L6 governance signals into the context assembly pipeline.
 */

export type GovernanceLayer = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";

export interface GovernanceSignal {
  layer: GovernanceLayer;
  type: string;
  result: "approved" | "rejected" | "warning";
  reason?: string;
  timestamp: Date;
}

export interface GovernanceInjectRequest {
  sessionId: string;
  governanceLayers?: GovernanceLayer[];
}

export interface GovernanceInjectResponse {
  signals: GovernanceSignal[];
  injectedTokens: number;
}

/** Layer descriptions for context formatting */
const LAYER_LABELS: Record<GovernanceLayer, string> = {
  L1: "Intent Alignment",
  L2: "Value Constraints",
  L3: "Safety Boundaries",
  L4: "Learning Governance",
  L5: "Self Reflection",
  L6: "Ethics Compliance",
};

/**
 * Governance signal provider interface.
 * In production, connects to neoclaw via OpenClaw bridge.
 */
export interface GovernanceProvider {
  getSignals(params: {
    sessionId: string;
    layers?: GovernanceLayer[];
  }): Promise<GovernanceSignal[]>;
}

/** Default noop provider */
class NoopGovernanceProvider implements GovernanceProvider {
  async getSignals(): Promise<GovernanceSignal[]> {
    return [];
  }
}

/** Mock provider for testing */
export class MockGovernanceProvider implements GovernanceProvider {
  private signals: GovernanceSignal[] = [];

  async getSignals(params: {
    sessionId: string;
    layers?: GovernanceLayer[];
  }): Promise<GovernanceSignal[]> {
    let filtered = this.signals;
    if (params.layers && params.layers.length > 0) {
      filtered = filtered.filter((s) => params.layers!.includes(s.layer));
    }
    return filtered;
  }

  addSignal(signal: GovernanceSignal): void {
    this.signals.push(signal);
  }

  clear(): void {
    this.signals = [];
  }
}

function estimateTokens(text: string): number {
  let t = 0;
  for (const ch of text) {
    t += /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch) ? 1 : 1 / 3.5;
  }
  return Math.ceil(t);
}

export class GovernanceInjector {
  private provider: GovernanceProvider;

  constructor(provider?: GovernanceProvider) {
    this.provider = provider ?? new NoopGovernanceProvider();
  }

  /**
   * Inject governance signals from neoclaw into context.
   */
  async inject(params: GovernanceInjectRequest): Promise<GovernanceInjectResponse> {
    const signals = await this.provider.getSignals({
      sessionId: params.sessionId,
      layers: params.governanceLayers,
    });

    let injectedTokens = 0;
    for (const sig of signals) {
      injectedTokens += estimateTokens(sig.type + (sig.reason ?? ""));
    }

    return { signals, injectedTokens };
  }

  /**
   * Format governance signals as context lines, grouped by layer.
   */
  formatForContext(signals: GovernanceSignal[]): string {
    if (signals.length === 0) return "";

    // Group by layer
    const grouped = new Map<GovernanceLayer, GovernanceSignal[]>();
    for (const sig of signals) {
      const list = grouped.get(sig.layer) ?? [];
      list.push(sig);
      grouped.set(sig.layer, list);
    }

    const blocks: string[] = [];
    for (const [layer, layerSignals] of grouped) {
      const label = LAYER_LABELS[layer] || layer;
      const lines = layerSignals.map((sig) => {
        const icon = sig.result === "approved" ? "🟢" : sig.result === "rejected" ? "🔴" : "🟡";
        const reason = sig.reason ? ` — ${sig.reason}` : "";
        return `  ${icon} ${sig.type}: ${sig.result}${reason}`;
      });
      blocks.push(`[${layer}] ${label}:\n${lines.join("\n")}`);
    }

    return `[Governance Signals]\n${blocks.join("\n\n")}`;
  }

  /** Replace the provider at runtime */
  setProvider(provider: GovernanceProvider): void {
    this.provider = provider;
  }
}
