/** v5.0.0-beta.2 — SignalAggregator: multi-source signal weighted fusion */
import type { ClassifiedSignal, SignalDomain } from "./domain-classifier.js";

export type FusionStrategy = "weighted" | "priority" | "adaptive";

export interface AggregatedSignals {
  signals: ClassifiedSignal[];
  weights: Record<string, number>;
  byDomain: Record<string, ClassifiedSignal[]>;
}

const DOMAIN_DEFAULTS: Record<string, number> = {
  memory: 0.3, governance: 0.25, ci: 0.15, "cross-domain": 0.15, session: 0.1, unknown: 0.05,
};

const PRIORITY: Record<string, number> = {
  governance: 5, memory: 4, ci: 3, "cross-domain": 2, session: 1, unknown: 0,
};

export class SignalAggregator {
  private strategy: FusionStrategy;

  constructor(strategy: FusionStrategy = "weighted") {
    this.strategy = strategy;
  }

  aggregate(signals: ClassifiedSignal[]): AggregatedSignals {
    const byDomain: Record<string, ClassifiedSignal[]> = {};
    for (const s of signals) {
      (byDomain[s.domain] ??= []).push(s);
    }

    const weights = this.calculateWeights(signals);

    if (this.strategy === "priority") {
      signals.sort((a, b) => (PRIORITY[b.domain] ?? 0) - (PRIORITY[a.domain] ?? 0));
    }

    return { signals, weights, byDomain };
  }

  calculateWeights(signals: ClassifiedSignal[]): Record<string, number> {
    if (this.strategy === "adaptive") {
      const result: Record<string, number> = {};
      const byDom = new Map<string, ClassifiedSignal[]>();
      for (const s of signals) byDom.set(s.domain, [...(byDom.get(s.domain) ?? []), s]);
      for (const [dom, sigs] of byDom) {
        const avgConf = sigs.reduce((sum, si) => sum + si.confidence, 0) / sigs.length;
        result[dom] = avgConf * (DOMAIN_DEFAULTS[dom] ?? 0.1);
      }
      return result;
    }
    return { ...DOMAIN_DEFAULTS };
  }
}
