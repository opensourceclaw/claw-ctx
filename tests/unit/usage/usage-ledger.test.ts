// v6.10.1 — usage-ledger regression tests: merged caliber, writeback, persistence

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  UsageLedger,
  createUsageWriteback,
} from "../../../src/usage/usage-ledger.js";

describe("UsageLedger (v6.10.1)", () => {
  it("merges input + cacheRead + cacheCreation", () => {
    const ledger = new UsageLedger();
    const record = ledger.recordUsage("s1", {
      inputTokens: 100,
      cacheReadTokens: 50,
      cacheCreationTokens: 25,
      outputTokens: 10,
    });
    expect(record.mergedTotal).toBe(175);
    expect(ledger.getMergedTotal("s1")).toBe(175);
    expect(ledger.getLastMerged("s1")?.outputTokens).toBe(10);
  });

  it("treats zero values and missing fields as 0 (edge cases)", () => {
    const ledger = new UsageLedger();

    // Explicit zeros
    const zeros = ledger.recordUsage("s2", {
      inputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 0,
    });
    expect(zeros.mergedTotal).toBe(0);

    // Missing cache fields entirely → count as 0
    const partial = ledger.recordUsage("s2", { inputTokens: 42 });
    expect(partial.cacheReadTokens).toBe(0);
    expect(partial.cacheCreationTokens).toBe(0);
    expect(partial.mergedTotal).toBe(42);
    expect(ledger.getMergedTotal("s2")).toBe(42);

    // Empty payload
    const empty = ledger.recordUsage("s2", {});
    expect(empty.mergedTotal).toBe(0);
  });

  it("keeps per-session turn records isolated", () => {
    const ledger = new UsageLedger();
    ledger.recordUsage("alpha", { inputTokens: 10 });
    ledger.recordUsage("alpha", { inputTokens: 20 });
    ledger.recordUsage("beta", { inputTokens: 5 });

    const alpha = ledger.getRecords("alpha");
    expect(alpha).toHaveLength(2);
    expect(alpha[0].turn).toBe(1);
    expect(alpha[1].turn).toBe(2);
    expect(ledger.getMergedTotal("alpha")).toBe(20);
    expect(ledger.getMergedTotal("beta")).toBe(5);
    expect(ledger.getMergedTotal("unknown")).toBe(0);
    expect(ledger.getLastMerged("unknown")).toBeUndefined();
    expect(ledger.getSessionIds().sort()).toEqual(["alpha", "beta"]);
  });

  it("records trigger evaluations and returns the latest", () => {
    const ledger = new UsageLedger();
    ledger.recordEvaluation("s1", {
      inputTokens: 30000,
      shouldCompact: false,
      reason: "below minimum",
      caliber: "estimated",
    });
    ledger.recordEvaluation("s1", {
      inputTokens: 115000,
      shouldCompact: true,
      reason: "exceeds threshold",
      caliber: "reported",
      threshold: 100000,
    });

    const last = ledger.getLastEvaluation("s1");
    expect(last?.shouldCompact).toBe(true);
    expect(last?.caliber).toBe("reported");
    expect(last?.inputTokens).toBe(115000);
    expect(ledger.getLastEvaluation("nope")).toBeUndefined();
  });

  it("persists to JSONL and reloads (optional persistence hook)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "usage-ledger-"));
    const file = path.join(dir, "usage-ledger.jsonl");
    try {
      const writer = new UsageLedger({ persistPath: file });
      writer.recordUsage("s1", { inputTokens: 10, cacheReadTokens: 5, cacheCreationTokens: 1 });
      writer.recordEvaluation("s1", {
        inputTokens: 16,
        shouldCompact: false,
        reason: "below minimum",
        caliber: "reported",
      });

      const reloaded = new UsageLedger({ persistPath: file });
      expect(reloaded.getMergedTotal("s1")).toBe(16);
      expect(reloaded.getLastEvaluation("s1")?.caliber).toBe("reported");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("createUsageWriteback (v6.10.1)", () => {
  it("feeds usage and triggers evaluation with the merged view", () => {
    const ledger = new UsageLedger();
    const seen: Array<{ sessionId: string; mergedTotal: number }> = [];

    const writeback = createUsageWriteback({
      ledger,
      evaluate: (sessionId, merged) => {
        seen.push({ sessionId, mergedTotal: merged.mergedTotal });
        return {
          inputTokens: merged.mergedTotal,
          shouldCompact: merged.mergedTotal >= 100000,
          reason: merged.mergedTotal >= 100000 ? "exceeds threshold" : "below threshold",
          caliber: "reported",
        };
      },
    });

    const { record, evaluation } = writeback.write("s1", {
      inputTokens: 60000,
      cacheReadTokens: 40000,
      cacheCreationTokens: 10000,
      outputTokens: 500,
    });

    // Hook only ingests what the host writes — no transcript reads
    expect(record.mergedTotal).toBe(110000);
    expect(seen).toEqual([{ sessionId: "s1", mergedTotal: 110000 }]);
    expect(evaluation?.shouldCompact).toBe(true);
    expect(evaluation?.caliber).toBe("reported");
    expect(writeback.getMergedTotal("s1")).toBe(110000);
    expect(writeback.getLastMerged("s1")?.mergedTotal).toBe(110000);
  });

  it("works without an evaluate callback (ingest only)", () => {
    const ledger = new UsageLedger();
    const writeback = createUsageWriteback({ ledger });
    const { evaluation } = writeback.write("s1", { inputTokens: 7 });
    expect(evaluation).toBeUndefined();
    expect(ledger.getMergedTotal("s1")).toBe(7);
  });
});
