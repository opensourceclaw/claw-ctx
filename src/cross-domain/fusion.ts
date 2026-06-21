/** v5.0.0-beta.2 — CrossDomainFusion: multi-domain signal fusion engine */
import { DomainClassifier, type RawSignal, type ClassifiedSignal } from "./domain-classifier.js";
import { SignalAggregator, type AggregatedSignals } from "./signal-aggregator.js";

export interface FusionResult {
  signals: ClassifiedSignal[];
  aggregated: AggregatedSignals;
  recommendations: string[];
  tokenCount: number;
}

export class CrossDomainFusion {
  private classifier = new DomainClassifier();
  private aggregator = new SignalAggregator("weighted");

  fuse(rawSignals: RawSignal[]): FusionResult {
    const classified = rawSignals.map((s) => this.classifier.classify(s));
    const aggregated = this.aggregator.aggregate(classified);
    const recommendations = this.generateRecommendations(aggregated.byDomain);

    return {
      signals: classified,
      aggregated,
      recommendations,
      tokenCount: classified.reduce((s, si) => s + Math.ceil(si.content.length / 4), 0),
    };
  }

  private generateRecommendations(byDomain: Record<string, ClassifiedSignal[]>): string[] {
    const recs: string[] = [];
    if (byDomain.governance?.length && byDomain.ci?.length) {
      recs.push("Governance + CI: consider automated compliance check in pipeline");
    }
    if (byDomain.memory?.length && byDomain.session?.length) {
      recs.push("Memory + Session: inject relevant history into current context");
    }
    if (byDomain["cross-domain"]?.length && byDomain.memory?.length) {
      recs.push("Cross-domain + Memory: correlate domain signals for pattern detection");
    }
    return recs;
  }
}
