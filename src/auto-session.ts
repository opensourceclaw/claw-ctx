// claw-ctx v4.20.0 — AutoSessionController
//
// Monitors drift score and suggests new session creation when
// conversation has drifted too far from the original topic.

export interface AutoSessionConfig {
  driftThreshold: number;
  suggestionCooldownMs: number;
}

export const DEFAULT_AUTO_SESSION_CONFIG: AutoSessionConfig = {
  driftThreshold: 0.9,
  suggestionCooldownMs: 600000, // 10 minutes
};

export class AutoSessionController {
  private _config: AutoSessionConfig;
  private _lastSuggestionAt: number | null = null;

  constructor(config?: Partial<AutoSessionConfig>) {
    this._config = { ...DEFAULT_AUTO_SESSION_CONFIG, ...config };
  }

  get config(): Readonly<AutoSessionConfig> { return this._config; }

  shouldSuggestNewSession(driftScore: number): boolean {
    if (driftScore < this._config.driftThreshold) return false;
    if (this._lastSuggestionAt != null) {
      const elapsed = Date.now() - this._lastSuggestionAt;
      if (elapsed < this._config.suggestionCooldownMs) return false;
    }
    return true;
  }

  generateSuggestion(): string {
    this._lastSuggestionAt = Date.now();
    return "Topic drift detected. Consider starting a new session for better focus and context relevance.";
  }

  reset(): void {
    this._lastSuggestionAt = null;
  }

  getStats(): { lastSuggestionAt: number | null; cooldownActive: boolean } {
    const cooldownActive = this._lastSuggestionAt != null
      && (Date.now() - this._lastSuggestionAt) < this._config.suggestionCooldownMs;
    return { lastSuggestionAt: this._lastSuggestionAt, cooldownActive };
  }
}
