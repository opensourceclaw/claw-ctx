/**
 * claw-ctx v5.0.0-rc.1 — PromptStyleEngine
 *
 * Formats context items for system prompt injection using one of 5 prompt styles.
 * Default: "descriptive" — backward-compatible with v5.0.0-beta.3 output.
 */

import type { PromptStyle } from "./types.js";
import { DEFAULT_STYLE_TEMPLATES, type StyleConfig } from "./config.js";

export interface StyleApplication {
  block: string;
  style: PromptStyle;
  itemCount: number;
}

export class PromptStyleEngine {
  private currentStyle: PromptStyle = "descriptive";
  private templates: Record<PromptStyle, StyleConfig>;

  constructor(templates?: Partial<Record<PromptStyle, Partial<StyleConfig>>>) {
    // ponytail: shallow merge custom templates over defaults
    this.templates = { ...DEFAULT_STYLE_TEMPLATES };
    if (templates) {
      for (const [style, partial] of Object.entries(templates)) {
        if (this.templates[style as PromptStyle]) {
          Object.assign(this.templates[style as PromptStyle], partial);
        }
      }
    }
  }

  applyStyle(
    items: Array<{ content: string; score?: number }>,
    style?: PromptStyle,
  ): StyleApplication {
    const s = style ?? this.currentStyle;
    const cfg = this.templates[s];

    const lines = items.map((m) => `- ${m.content}`);

    const block = cfg.template
      .replace("{items}", lines.join("\n"))
      .replace("{reasons}", this.buildReasons(items))
      .replace("{conditions}", this.buildConditions(items));

    return { block, style: s, itemCount: items.length };
  }

  setStyle(style: PromptStyle): void {
    this.currentStyle = style;
  }

  getStyle(): PromptStyle {
    return this.currentStyle;
  }

  getConfig(style?: PromptStyle): StyleConfig {
    return this.templates[style ?? this.currentStyle];
  }

  // ── private ──────────────────────────────────────────────────────

  private buildReasons(items: Array<{ content: string; score?: number }>): string {
    // ponytail: top-3 high-score items as reasons; O(n log n), fine for <100 items
    const top = [...items]
      .filter((m) => (m.score ?? 0) > 0)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 3);
    if (top.length === 0) return "general relevance";
    return top
      .map((m) => `"${m.content.slice(0, 60)}" (score: ${(m.score ?? 0).toFixed(2)})`)
      .join("; ");
  }

  private buildConditions(items: Array<{ content: string; score?: number }>): string {
    const keywords = new Set<string>();
    // ponytail: simple keyword extraction; upgrade to NLP if precision matters
    for (const m of items) {
      const lower = m.content.toLowerCase();
      for (const kw of [
        "error", "bug", "deploy", "test", "refactor", "performance", "api", "security",
      ]) {
        if (lower.includes(kw)) keywords.add(kw);
      }
    }
    return keywords.size > 0 ? [...keywords].join(", ") : "any of the above topics";
  }
}
