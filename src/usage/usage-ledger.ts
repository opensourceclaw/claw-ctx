/**
 * claw-ctx v6.10.1 — Usage Ledger
 *
 * Merged-usage accounting for compaction triggering: the real occupancy
 * caliber is input + cacheRead + cacheCreation (not input alone).
 *
 * Pure in-memory by default; optional JSONL persistence (node fs only,
 * no external deps) so `claw-ctx doctor --usage` can read what hosts wrote.
 *
 * The writeback hook only ingests usage payloads and re-runs evaluation —
 * it never reads host transcripts (decoupling decision: hook shape only).
 */

import * as fs from "fs";
import * as path from "path";

/** Per-turn usage payload fed by the host. Missing fields count as 0. */
export interface UsageInput {
  inputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  outputTokens?: number;
}

/** Normalized usage with the merged occupancy caliber. */
export interface MergedUsage {
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  /** input + cacheRead + cacheCreation */
  mergedTotal: number;
}

export interface UsageRecord extends MergedUsage {
  /** 1-based turn index within the session */
  turn: number;
  /** epoch ms */
  at: number;
}

/** Result of one trigger evaluation (input/output/caliber for diagnostics). */
export interface TriggerEvaluation {
  /** Token count the trigger decision saw */
  inputTokens: number;
  shouldCompact: boolean;
  reason: string;
  caliber: "reported" | "estimated";
  threshold?: number;
  at: number;
}

export interface UsageLedgerOptions {
  /** Optional JSONL file; loaded on construct, appended on record. */
  persistPath?: string;
}

interface PersistedLine {
  kind: "usage" | "evaluation";
  sessionId: string;
  record?: UsageRecord;
  evaluation?: TriggerEvaluation;
}

export class UsageLedger {
  private usages: Map<string, UsageRecord[]> = new Map();
  private evaluations: Map<string, TriggerEvaluation[]> = new Map();
  private persistPath?: string;

  constructor(opts?: UsageLedgerOptions) {
    this.persistPath = opts?.persistPath;
    if (this.persistPath && fs.existsSync(this.persistPath)) {
      this.load(this.persistPath);
    }
  }

  /** Record one turn of host-reported usage for a session. */
  recordUsage(sessionId: string, input: UsageInput): UsageRecord {
    const merged: MergedUsage = {
      inputTokens: input.inputTokens ?? 0,
      cacheReadTokens: input.cacheReadTokens ?? 0,
      cacheCreationTokens: input.cacheCreationTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      mergedTotal: 0,
    };
    merged.mergedTotal = merged.inputTokens + merged.cacheReadTokens + merged.cacheCreationTokens;

    const list = this.usages.get(sessionId) ?? [];
    const record: UsageRecord = { ...merged, turn: list.length + 1, at: Date.now() };
    list.push(record);
    this.usages.set(sessionId, list);
    this.persist({ kind: "usage", sessionId, record });
    return record;
  }

  /** Merged occupancy (input + cacheRead + cacheCreation) of the latest turn. */
  getMergedTotal(sessionId: string): number {
    return this.getLastMerged(sessionId)?.mergedTotal ?? 0;
  }

  /** Full merged usage of the latest turn, or undefined if no records. */
  getLastMerged(sessionId: string): MergedUsage | undefined {
    const list = this.usages.get(sessionId);
    if (!list || list.length === 0) return undefined;
    const last = list[list.length - 1];
    return {
      inputTokens: last.inputTokens,
      cacheReadTokens: last.cacheReadTokens,
      cacheCreationTokens: last.cacheCreationTokens,
      outputTokens: last.outputTokens,
      mergedTotal: last.mergedTotal,
    };
  }

  /** All recorded turns for a session (empty array if none). */
  getRecords(sessionId: string): UsageRecord[] {
    return [...(this.usages.get(sessionId) ?? [])];
  }

  getSessionIds(): string[] {
    return [...this.usages.keys()];
  }

  /** Record one trigger-evaluation outcome (for doctor diagnostics). */
  recordEvaluation(
    sessionId: string,
    e: Omit<TriggerEvaluation, "at">
  ): TriggerEvaluation {
    const evaluation: TriggerEvaluation = { ...e, at: Date.now() };
    const list = this.evaluations.get(sessionId) ?? [];
    list.push(evaluation);
    this.evaluations.set(sessionId, list);
    this.persist({ kind: "evaluation", sessionId, evaluation });
    return evaluation;
  }

  /** Latest evaluation for a session, or the most recent across sessions. */
  getLastEvaluation(sessionId?: string): TriggerEvaluation | undefined {
    if (sessionId) {
      const list = this.evaluations.get(sessionId);
      return list && list.length > 0 ? list[list.length - 1] : undefined;
    }
    let latest: TriggerEvaluation | undefined;
    for (const list of this.evaluations.values()) {
      const last = list[list.length - 1];
      if (last && (!latest || last.at > latest.at)) latest = last;
    }
    return latest;
  }

  /** Load persisted JSONL lines (merge into memory). */
  load(filePath: string): void {
    const raw = fs.readFileSync(filePath, "utf-8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as PersistedLine;
        if (entry.kind === "usage" && entry.record) {
          const list = this.usages.get(entry.sessionId) ?? [];
          list.push(entry.record);
          this.usages.set(entry.sessionId, list);
        } else if (entry.kind === "evaluation" && entry.evaluation) {
          const list = this.evaluations.get(entry.sessionId) ?? [];
          list.push(entry.evaluation);
          this.evaluations.set(entry.sessionId, list);
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  private persist(line: PersistedLine): void {
    if (!this.persistPath) return;
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(this.persistPath, JSON.stringify(line) + "\n", "utf-8");
    } catch {
      // persistence is best-effort; in-memory record already stands
    }
  }
}

/** Shared singleton for hosts that do not manage their own ledger. */
export const usageLedger = new UsageLedger();

export interface UsageWriteback {
  /** Host calls once per turn: ingest usage, then re-run evaluation. */
  write(
    sessionId: string,
    usage: UsageInput
  ): { record: UsageRecord; evaluation?: TriggerEvaluation };
  getMergedTotal(sessionId: string): number;
  getLastMerged(sessionId: string): MergedUsage | undefined;
}

export interface UsageWritebackOptions {
  ledger?: UsageLedger;
  /**
   * Trigger re-evaluation with the merged (reported) view after ingest.
   * Return an evaluation outcome to record it in the ledger.
   */
  evaluate?: (
    sessionId: string,
    merged: MergedUsage
  ) => Omit<TriggerEvaluation, "at"> | void;
}

/**
 * Host writeback hook: feed per-turn usage and trigger re-evaluation.
 * Deliberately does not read host transcripts — data comes only from
 * what the host writes.
 */
export function createUsageWriteback(opts?: UsageWritebackOptions): UsageWriteback {
  const ledger = opts?.ledger ?? usageLedger;
  return {
    write(sessionId, usage) {
      const record = ledger.recordUsage(sessionId, usage);
      let evaluation: TriggerEvaluation | undefined;
      if (opts?.evaluate) {
        const merged = ledger.getLastMerged(sessionId);
        if (merged) {
          const outcome = opts.evaluate(sessionId, merged);
          if (outcome) evaluation = ledger.recordEvaluation(sessionId, outcome);
        }
      }
      return { record, evaluation };
    },
    getMergedTotal: (sessionId) => ledger.getMergedTotal(sessionId),
    getLastMerged: (sessionId) => ledger.getLastMerged(sessionId),
  };
}
