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

/**
 * claw-ctx v4.17.0 — Position Optimizer
 *
 * Mitigates the "lost-in-the-middle" phenomenon in long-context LLMs
 * by optimizing information placement: important content at head/tail,
 * key info repetition, and sliding window compression.
 */

export interface PositionOptimizerConfig {
  positionPreference: "head" | "tail" | "balanced" | "adaptive";
  keyInfoRepetitions: number;
  chunkSize: number;
  windowStep: number;
}

export interface KeyInfo {
  content: string;
  importance: number;
  position: number;
}

export const DEFAULT_POSITION_CONFIG: PositionOptimizerConfig = {
  positionPreference: "balanced",
  keyInfoRepetitions: 1,
  chunkSize: 20,
  windowStep: 10,
};

interface Message {
  role: string;
  content: string;
}

// ── Importance scoring ────────────────────────────────────────────────

const IMPORTANCE_KEYWORDS = [
  { pattern: /\b(important|critical|essential|key|vital|crucial)\b/gi, weight: 0.3 },
  { pattern: /\b(must|should|required|necessary|mandatory)\b/gi, weight: 0.25 },
  { pattern: /\b(error|bug|fix|broken|issue|problem)\b/gi, weight: 0.2 },
  { pattern: /\b(architecture|design|pattern|structure)\b/gi, weight: 0.15 },
  { pattern: /\b(task|TODO|action|next|step|plan)\b/gi, weight: 0.15 },
  { pattern: /\b(decision|choose|select|prefer|preference)\b/gi, weight: 0.2 },
  { pattern: /\b(code|function|class|module|API|endpoint)\b/gi, weight: 0.1 },
];

// ── PositionOptimizer ────────────────────────────────────────────────

export class PositionOptimizer {
  config: PositionOptimizerConfig;

  constructor(config?: Partial<PositionOptimizerConfig>) {
    this.config = { ...DEFAULT_POSITION_CONFIG, ...config };
  }

  /** Calculate importance score for a text fragment. */
  scoreImportance(text: string): number {
    if (!text) return 0;
    let score = 0;
    for (const { pattern, weight } of IMPORTANCE_KEYWORDS) {
      const matches = text.match(pattern);
      if (matches) score += Math.min(weight * 3, matches.length * weight);
    }
    // Length bonus: moderate-length content tends to be substantive
    if (text.length > 100 && text.length < 2000) score += 0.1;
    return Math.min(1, Math.round(score * 100) / 100);
  }

  /** Extract key information from messages, ranked by importance. */
  extractKeyInfo(messages: Message[]): KeyInfo[] {
    return messages
      .map((m, i) => ({
        content: m.content.slice(0, 500),
        importance: this.scoreImportance(m.content),
        position: i,
      }))
      .filter(k => k.importance > 0.1)
      .sort((a, b) => b.importance - a.importance);
  }

  /** Add explicit position markers to messages. */
  addPositionMarkers(messages: Message[]): Message[] {
    const total = messages.length;
    if (total <= 2) return messages;

    return messages.map((m, i) => {
      if (i === 0 || i === total - 1) return m;
      const marker = `[Position ${i + 1}/${total}]`;
      return { ...m, content: `${marker} ${m.content}` };
    });
  }

  /** Reorder messages so important content appears at head and tail. */
  reorderBalanced(messages: Message[]): Message[] {
    if (messages.length <= 3) return [...messages];

    const keyInfo = this.extractKeyInfo(messages);
    if (keyInfo.length === 0) return [...messages];

    const keyIndices = new Set(keyInfo.slice(0, 3).map(k => k.position));
    const head: Message[] = [];
    const body: Message[] = [];
    const tail: Message[] = [];

    for (let i = 0; i < messages.length; i++) {
      if (keyIndices.has(i)) {
        if (head.length < 2) head.push(messages[i]);
        else tail.push(messages[i]);
      } else {
        body.push(messages[i]);
      }
    }

    return [...head, ...body, ...tail];
  }

  /** Repeat key information at head and tail of the sequence. */
  repeatKeyInfo(messages: Message[]): Message[] {
    if (this.config.keyInfoRepetitions <= 0) return messages;

    const keyInfo = this.extractKeyInfo(messages);
    if (keyInfo.length === 0) return messages;

    const topInfo = keyInfo.slice(0, 2);
    const summary = topInfo.map(k => k.content.slice(0, 200)).join(" | ");

    const headNote: Message = {
      role: "system",
      content: `[Key Context Summary]\n${summary}`,
    };
    const tailNote: Message = {
      role: "system",
      content: `[Key Context Reminder]\n${summary}`,
    };

    return [headNote, ...messages, tailNote];
  }

  /** Sliding window compression for long sequences. */
  slidingWindowCompress(messages: Message[], budget: number): Message[] {
    if (messages.length <= budget) return messages;

    const result: Message[] = [];
    const recent = Math.floor(budget * 0.6); // keep 60% of budget for recent msgs

    // Always keep first message
    result.push(messages[0]);

    // Sliding window over middle
    const middle = messages.slice(1, -recent);
    const step = Math.max(1, Math.ceil(middle.length / (budget - recent - 2)));

    for (let i = 0; i < middle.length; i += step) {
      result.push(middle[i]);
    }

    // Always keep recent messages
    for (let i = Math.max(1, messages.length - recent); i < messages.length; i++) {
      result.push(messages[i]);
    }

    return result;
  }

  /** Main optimization: combines all strategies based on config. */
  optimize(messages: Message[]): Message[] {
    if (messages.length <= 2) return messages;

    let result = [...messages];

    // 1. Extract and optimize position
    if (this.config.positionPreference === "adaptive") {
      // Adaptive: use reorderBalanced for large sets, markers for smaller
      if (result.length > 10) {
        result = this.reorderBalanced(result);
      }
    } else if (this.config.positionPreference === "balanced") {
      result = this.reorderBalanced(result);
    } else if (this.config.positionPreference === "head") {
      const keyInfo = this.extractKeyInfo(result);
      if (keyInfo.length > 0) {
        const topContent = keyInfo[0].content.slice(0, 200);
        result = [
          { role: "system", content: `[Key Point]\n${topContent}` },
          ...result,
        ];
      }
    }

    // 2. Repeat key information
    result = this.repeatKeyInfo(result);

    // 3. Add position markers
    result = this.addPositionMarkers(result);

    return result;
  }
}
