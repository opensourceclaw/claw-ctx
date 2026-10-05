// v6.11.0 / CX-2 — `doctor --usage --json` structured output (design §6.4)

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("doctor --usage --json (CX-2 closed)", () => {
  const originalArgv = process.argv;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  async function runDoctor(argv: string[]): Promise<any> {
    process.argv = ["node", "cli.ts", ...argv];
    await import("../../src/cli.js");
    const out = logSpy.mock.calls.map((c) => c[0]).join("\n");
    return JSON.parse(out); // throws if not valid JSON
  }

  it("emits valid JSON with usage + compactionQuality + version (no ledger)", async () => {
    const doc = await runDoctor(["doctor", "--usage", "--json", "--file", "/nonexistent/ledger.jsonl"]);
    expect(doc.usage.ledgerPath).toBe("/nonexistent/ledger.jsonl");
    expect(Array.isArray(doc.usage.sessions)).toBe(true);
    expect(doc.usage.sessions).toHaveLength(0);
    expect(doc.compactionQuality).toBeDefined();
    expect(typeof doc.compactionQuality.sampleCount).toBe("number");
    expect(typeof doc.compactionQuality.missingNextActionPct).toBe("number");
    expect(doc.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("emits valid JSON when a seeded ledger is present", async () => {
    const os = await import("os");
    const fs = await import("fs");
    const path = await import("path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-json-"));
    const ledger = path.join(dir, "usage-ledger.jsonl");
    fs.writeFileSync(
      ledger,
      JSON.stringify({
        kind: "usage",
        sessionId: "s1",
        record: {
          turn: 1, inputTokens: 60000, cacheReadTokens: 40000,
          cacheCreationTokens: 15000, outputTokens: 500,
          mergedTotal: 115000, at: 1791200000000,
        },
      }) + "\n",
    );
    try {
      const doc = await runDoctor(["doctor", "--usage", "--json", "--file", ledger]);
      expect(doc.usage.sessions).toHaveLength(1);
      expect(doc.usage.sessions[0].sessionId).toBe("s1");
      expect(doc.usage.sessions[0].turns[0].mergedTotal).toBe(115000);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("table path (no --json) still prints keyword tables (review ruling B)", async () => {
    process.argv = ["node", "cli.ts", "doctor", "--usage", "--file", "/nonexistent/ledger.jsonl"];
    await import("../../src/cli.js");
    const out = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(out).toContain("Keyword tables (manual verification):");
    expect(out).toContain("CRITICAL_STATE:");
    expect(out).toContain("NEXT_ACTION:");
    expect(out).toContain("Compaction Quality (P4):");
    expect(() => JSON.parse(out)).toThrow(); // table path is NOT json
  });
});
