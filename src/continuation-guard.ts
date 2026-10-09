/**
 * claw-ctx v6.13.0 — P3 continuation guard (design §1.2/§2/§3.2)
 *
 * After a successful compaction, for `windowTurns` turns the guard inspects the
 * running messages for three "redundant recovery" signals — redoing work,
 * re-fetching summarized content, restating the plan — and emits a warning
 * (+ an optional re-fetch role hint). It is a sidecar: it never blocks, never
 * changes compaction/assembly semantics or exit codes.
 *
 * All signals are local (message-structure parsing + keyword screening), no new
 * LLM calls. Disabled (default) ⇒ every method is a no-op. Parse failures are
 * skipped silently (never guessed) — same discipline as the trajectory red line.
 *
 * `detectors[]` is the v6.14.0 W4 extension point: add a paper-derived detector
 * without touching this class. W4 itself is NOT implemented here.
 */

import { NEXT_ACTION_KEYWORDS, stripSummaryScaffold } from "./metrics/optimizer-metrics.js";

export type ContinuationSignalKind =
  | "redo-loop"          // same tool + same args signature re-invoked
  | "refetch-summarized" // retrieving content that was folded into the summary
  | "plan-restatement";  // restating the plan (NEXT_ACTION hit + overlap with summary Next Action)

export interface ContinuationSignal {
  kind: ContinuationSignalKind;
  detail: string;
  turn: number;
}

export interface ContinuationGuardConfig {
  enabled: boolean;
  /** Turns the guard stays armed after a compaction. Conservative default, to be re-calibrated by v6.14.0 W3 backfill. */
  windowTurns: number;
  /** When a signal fires, also inject a re-fetch role hint (false ⇒ warn only). */
  refetchHint: boolean;
}

/** Conservative defaults, pending v6.14.0 W3 data backfill re-calibration. */
export const DEFAULT_CONTINUATION_GUARD_CONFIG: ContinuationGuardConfig = {
  enabled: false,
  windowTurns: 3,
  refetchHint: true,
};

export interface ContinuationContext {
  messages: any[];
  summaryText: string;
  windowTurn: number;
}

export type ContinuationDetector = (ctx: ContinuationContext) => ContinuationSignal | undefined;

// ── message parsing helpers (local, fail-safe) ──────────────────────────────

function messageText(m: any): string {
  const c = m?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    let out = "";
    for (const b of c) {
      if (typeof b === "string") out += b + " ";
      else if (b && typeof b.text === "string") out += b.text + " ";
    }
    return out;
  }
  return "";
}

interface ToolCall { name: string; argsKey: string; }

function normalizeArgs(input: unknown): string {
  try {
    return JSON.stringify(input, (_k, v) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.keys(v).sort().reduce((o: any, k) => ((o[k] = v[k]), o), {})
        : v,
    ).toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Per-inspect memo: the three base detectors need two O(messages) views — the
 * tool calls and the assistant text. Compute both in a single pass, keyed on the
 * ctx object (fresh per inspect, so direct detector calls still recompute).
 * Injected (W4) detectors get the same ctx and remain independent.
 */
interface ParsedView { calls: ToolCall[]; assistantText: string; }
const parseCache = new WeakMap<ContinuationContext, ParsedView>();
function parseFor(ctx: ContinuationContext): ParsedView {
  let view = parseCache.get(ctx);
  if (view) return view;
  const calls: ToolCall[] = [];
  const assistantParts: string[] = [];
  const messages = ctx.messages;
  if (Array.isArray(messages)) {
    for (const m of messages) {
      const content = m?.content;
      if (m?.role === "assistant") assistantParts.push(messageText(m));
      if (!Array.isArray(content)) continue;
      for (const b of content) {
        if (b && b.type === "tool_use" && typeof b.name === "string") {
          calls.push({ name: b.name, argsKey: normalizeArgs(b.input) });
        }
      }
    }
  }
  view = { calls, assistantText: assistantParts.join(" ") };
  parseCache.set(ctx, view);
  return view;
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "your", "have",
  "will", "should", "next", "action", "step", "todo", "continue", "state",
  "content", "message", "input", "output", "query", "path", "file", "type",
  "name", "value", "args", "key", "data", "result",
]);

function tokenSet(text: string, minLen = 6): Set<string> {
  const out = new Set<string>();
  for (const t of text.toLowerCase().split(/[^a-z0-9_]+/)) {
    if (t.length >= minLen && !STOPWORDS.has(t)) out.add(t);
  }
  return out;
}

/** Content after the last "Next Action:" marker, scaffold-stripped. "" when absent (legacy). */
function nextActionSegment(summaryText: string): string {
  const idx = summaryText.lastIndexOf("Next Action:");
  if (idx < 0) return "";
  return stripSummaryScaffold(summaryText.slice(idx + "Next Action:".length)).trim();
}

function containsAnyKeyword(text: string, keywords: readonly string[]): boolean {
  const lower = stripSummaryScaffold(text).toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

// ── base detectors (pure, injectable) ───────────────────────────────────────

export const redoLoopDetector: ContinuationDetector = (ctx) => {
  const calls = parseFor(ctx).calls;
  for (let i = 1; i < calls.length; i++) {
    if (calls[i].name === calls[i - 1].name && calls[i].argsKey !== "" && calls[i].argsKey === calls[i - 1].argsKey) {
      return { kind: "redo-loop", detail: `${calls[i].name} re-invoked with identical args`, turn: ctx.windowTurn };
    }
  }
  return undefined;
};

const RETRIEVAL_TOOL_RE = /read|search|get|fetch|grep|glob|list|view|open|cat/i;

export const refetchSummarizedDetector: ContinuationDetector = (ctx) => {
  const tokens = tokenSet(stripSummaryScaffold(ctx.summaryText));
  if (tokens.size === 0) return undefined;
  for (const c of parseFor(ctx).calls) {
    if (!RETRIEVAL_TOOL_RE.test(c.name)) continue;
    for (const t of tokens) {
      if (c.argsKey.includes(t)) {
        return { kind: "refetch-summarized", detail: `${c.name} may re-fetch summarized content (matched "${t}")`, turn: ctx.windowTurn };
      }
    }
  }
  return undefined;
};

export const planRestatementDetector: ContinuationDetector = (ctx) => {
  // Cheap necessary condition first: without a summary "Next Action:" segment
  // there is nothing to restate (legacy summaries included) — skip the O(messages) scan.
  const next = nextActionSegment(ctx.summaryText);
  if (!next) return undefined;
  const assistantText = parseFor(ctx).assistantText;
  if (!assistantText || !containsAnyKeyword(assistantText, NEXT_ACTION_KEYWORDS)) return undefined;
  const a = tokenSet(assistantText);
  const b = tokenSet(next);
  const shared = [...a].filter((t) => b.has(t));
  if (shared.length === 0) return undefined;
  return { kind: "plan-restatement", detail: `assistant restates next action (overlap: ${shared.slice(0, 3).join(", ")})`, turn: ctx.windowTurn };
};

const BASE_DETECTORS: ContinuationDetector[] = [
  redoLoopDetector,
  refetchSummarizedDetector,
  planRestatementDetector,
];

// ── guard ───────────────────────────────────────────────────────────────────

interface GuardState { remaining: number; turn: number; }

export class ContinuationGuard {
  private config: ContinuationGuardConfig;
  private detectors: ContinuationDetector[];
  private sessions = new Map<string, GuardState>();

  constructor(config?: Partial<ContinuationGuardConfig>, detectors?: ContinuationDetector[]) {
    this.config = { ...DEFAULT_CONTINUATION_GUARD_CONFIG, ...(config ?? {}) };
    this.detectors = detectors ?? BASE_DETECTORS;
  }

  /** Arm after a successful compaction (windowTurns). Disabled ⇒ no-op. */
  arm(sessionId: string): void {
    if (!this.config.enabled) return;
    this.sessions.set(sessionId, { remaining: this.config.windowTurns, turn: 0 });
  }

  /** Called every turn; runs detectors while armed. Disabled ⇒ []. Window expiry auto-disarms. */
  inspect(sessionId: string, messages: any[], summaryText: string): ContinuationSignal[] {
    if (!this.config.enabled) return [];
    const s = this.sessions.get(sessionId);
    if (!s || s.remaining <= 0) return [];
    const ctx: ContinuationContext = { messages, summaryText, windowTurn: s.turn };
    const hits: ContinuationSignal[] = [];
    for (const d of this.detectors) {
      try {
        const sig = d(ctx);
        if (sig) hits.push(sig);
      } catch {
        // detector failure is non-blocking — skip silently (never guess)
      }
    }
    s.turn++;
    s.remaining--;
    if (s.remaining <= 0) this.sessions.delete(sessionId);
    return hits;
  }

  resetSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
