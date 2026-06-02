/**
 * claw-ctx v3.0.0 — Cross-Domain Signal Injector
 *
 * Injects neoclaw cross-domain signals (from claw-mem) into context assembly.
 * Supports the multi-Pillar architecture where agents share contextual signals.
 */
export interface InjectedSignal {
  sourcePillar: string;
  sourceAgent: string;
  summary: string;
  correlation: number;
  suggestion: string;
  timestamp: Date;
  tokenCount: number;
}

export interface CrossDomainInjectRequest {
  sessionId: string;
  currentPillar: string;
  currentIntent: string;
  timeRange?: string;
  maxSignals?: number;
}

export interface CrossDomainInjectResponse {
  signals: InjectedSignal[];
  totalTokens: number;
}

/**
 * Provider interface for cross-domain signal detection.
 * In production, connects to claw-mem v5.4.0's detect_cross_domain_correlation().
 */
export interface CrossDomainProvider {
  detectCorrelation(params: {
    sessionId: string;
    currentPillar: string;
    currentIntent: string;
    timeRange?: string;
    maxSignals?: number;
  }): Promise<InjectedSignal[]>;
}

/** Noop provider — used when cross-domain is not available */
class NoopCrossDomainProvider implements CrossDomainProvider {
  async detectCorrelation(): Promise<InjectedSignal[]> {
    return [];
  }
}

/** Mock provider for testing */
export class MockCrossDomainProvider implements CrossDomainProvider {
  private signals: InjectedSignal[] = [];

  async detectCorrelation(params: {
    sessionId: string;
    currentPillar: string;
    currentIntent: string;
    timeRange?: string;
    maxSignals?: number;
  }): Promise<InjectedSignal[]> {
    let filtered = this.signals.filter(
      (s) => s.sourcePillar.toLowerCase() !== params.currentPillar.toLowerCase()
    );

    // Filter by time range
    if (params.timeRange) {
      const hours = parseTimeRange(params.timeRange);
      if (hours > 0) {
        const cutoff = new Date(Date.now() - hours * 3600 * 1000);
        filtered = filtered.filter((s) => s.timestamp >= cutoff);
      }
    }

    // Sort by correlation descending
    filtered.sort((a, b) => b.correlation - a.correlation);

    return filtered.slice(0, params.maxSignals ?? 3);
  }

  addSignal(signal: InjectedSignal): void {
    this.signals.push(signal);
  }

  clear(): void {
    this.signals = [];
  }
}

function parseTimeRange(range: string): number {
  const match = range.match(/^(\d+)\s*(h|m|d)$/);
  if (!match) return 6; // default 6 hours
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case "m": return value / 60;
    case "d": return value * 24;
    default: return value;
  }
}

function estimateTokens(text: string): number {
  let t = 0;
  for (const ch of text) {
    t += /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch) ? 1 : 1 / 3.5;
  }
  return Math.ceil(t);
}

export class CrossDomainInjector {
  private provider: CrossDomainProvider;

  constructor(provider?: CrossDomainProvider) {
    this.provider = provider ?? new NoopCrossDomainProvider();
  }

  /**
   * Inject cross-domain signals into context.
   */
  async inject(params: CrossDomainInjectRequest): Promise<CrossDomainInjectResponse> {
    const signals = await this.provider.detectCorrelation({
      sessionId: params.sessionId,
      currentPillar: params.currentPillar,
      currentIntent: params.currentIntent,
      timeRange: params.timeRange ?? "6h",
      maxSignals: params.maxSignals ?? 3,
    });

    // Calculate token counts
    for (const sig of signals) {
      sig.tokenCount = estimateTokens(sig.summary) + estimateTokens(sig.suggestion);
    }

    const totalTokens = signals.reduce((s, sig) => s + sig.tokenCount, 0);

    return { signals, totalTokens };
  }

  /**
   * Format cross-domain signals as context text.
   * Groups by source pillar for readability.
   */
  formatForContext(signals: InjectedSignal[]): string {
    if (signals.length === 0) return "";

    const lines: string[] = [];
    lines.push("[Cross-Domain Signals]");

    for (const sig of signals) {
      const confidence = (sig.correlation * 100).toFixed(0);
      const timeAgo = formatTimeAgo(sig.timestamp);
      lines.push(
        `  📡 [${sig.sourcePillar}] ${sig.sourceAgent} (${timeAgo}, ${confidence}% match)`
      );
      lines.push(`     摘要: ${sig.summary}`);
      lines.push(`     建议: ${sig.suggestion}`);
    }

    return lines.join("\n");
  }

  /** Replace the provider at runtime */
  setProvider(provider: CrossDomainProvider): void {
    this.provider = provider;
  }
}

/** Format a relative time string like "~3h前" */
function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `~${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `~${diffDay}d ago`;
}
