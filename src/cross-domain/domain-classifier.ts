/** v5.0.0-beta.2 — DomainClassifier: signal domain classification */
export type SignalDomain = "memory" | "governance" | "ci" | "cross-domain" | "session" | "unknown";

export interface RawSignal {
  id: string;
  content: string;
  source: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ClassifiedSignal extends RawSignal {
  domain: SignalDomain;
  confidence: number;
}

const RULES: Array<{ domain: SignalDomain; match: (s: RawSignal) => boolean }> = [
  { domain: "memory", match: (s) => /memory|mem_|claw-mem/i.test(s.source) },
  { domain: "governance", match: (s) => /governance|gov_|policy|rule/i.test(s.source) },
  { domain: "ci", match: (s) => /ci_|pipeline|deploy|workflow/i.test(s.source) },
  { domain: "cross-domain", match: (s) => /cross_domain|pillar|neoclaw/i.test(s.source) },
  { domain: "session", match: (s) => /session|conversation/i.test(s.source) },
];

export class DomainClassifier {
  classify(signal: RawSignal): ClassifiedSignal {
    for (const rule of RULES) {
      if (rule.match(signal)) return { ...signal, domain: rule.domain, confidence: 0.9 };
    }
    return { ...signal, domain: "unknown", confidence: 0.3 };
  }
}
