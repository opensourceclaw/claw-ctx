// claw-ctx v4.20.0 — AutoCompactController
//
// Monitors drift score and signals when auto-compaction should trigger.
// Prevents excessive compaction via cooldown and per-session limits.

export interface AutoCompactConfig {
  driftThreshold: number;
  cooldownMs: number;
  maxCompactsPerSession: number;
}

export const DEFAULT_AUTO_COMPACT_CONFIG: AutoCompactConfig = {
  driftThreshold: 0.7,
  cooldownMs: 300000, // 5 minutes
  maxCompactsPerSession: 3,
};

export class AutoCompactController {
  private _config: AutoCompactConfig;
  private _lastCompactAt: number | null = null;
  private _compactCount = 0;

  constructor(config?: Partial<AutoCompactConfig>) {
    this._config = { ...DEFAULT_AUTO_COMPACT_CONFIG, ...config };
  }

  get config(): Readonly<AutoCompactConfig> { return this._config; }

  shouldCompact(driftScore: number): boolean {
    if (driftScore < this._config.driftThreshold) return false;
    if (this._compactCount >= this._config.maxCompactsPerSession) return false;
    if (this._lastCompactAt != null) {
      const elapsed = Date.now() - this._lastCompactAt;
      if (elapsed < this._config.cooldownMs) return false;
    }
    return true;
  }

  /** Call after a compaction completes to record the event. */
  recordCompact(): void {
    this._lastCompactAt = Date.now();
    this._compactCount++;
  }

  reset(): void {
    this._lastCompactAt = null;
    this._compactCount = 0;
  }

  getStats(): { compactCount: number; lastCompactAt: number | null; cooldownActive: boolean } {
    const cooldownActive = this._lastCompactAt != null
      && (Date.now() - this._lastCompactAt) < this._config.cooldownMs;
    return { compactCount: this._compactCount, lastCompactAt: this._lastCompactAt, cooldownActive };
  }
}
