/**
 * claw-ctx — Context Engine for OpenClaw
 *
 * Copyright 2026 OpenSourceClaw Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
