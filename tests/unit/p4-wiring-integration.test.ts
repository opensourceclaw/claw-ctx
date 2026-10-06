// v6.11.0 CX-11/CX-12 — real compact() → collector wiring integration.
// Unit mutations on the collector only prove its formulas; this file pins
// the engine→collector VALUE path (Edith acceptance recommendation 2).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createClawContextEngine } from "../../src/engine.js";
import { optimizerMetricsCollector } from "../../src/metrics/optimizer-metrics.js";

const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

function makeSessionFile(dir: string, contents: string[]): string {
  const f = path.join(dir, "session.jsonl");
  const lines = contents.map((content, i) =>
    JSON.stringify({
      type: "message",
      id: `m${i}`,
      message: { role: i % 2 === 0 ? "user" : "assistant", content },
    }),
  );
  fs.writeFileSync(f, lines.join("\n") + "\n");
  return f;
}

describe("P4 wiring integration — real compact() into collector (CX-11/CX-12)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p4-wire-"));
    optimizerMetricsCollector.reset();
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  async function compactFixture(
    contents: string[],
    config: Record<string, unknown> = {},
  ): Promise<void> {
    const engine = createClawContextEngine(
      { workspaceDir: tmp, sessionResume: false, ...config },
      mockLogger,
    );
    const sessionFile = makeSessionFile(tmp, contents);
    const r = await engine.compact({
      sessionId: "wire",
      sessionFile,
      tokenBudget: 2000,
      force: true,
      triggerReason: "force",
    });
    expect(r.compacted).toBe(true);
  }

  it("CX-11: keyword-bearing persisted summary → missingNextActionPct = 0", async () => {
    await compactFixture(
      Array.from({ length: 60 }, (_, i) =>
        `message ${i}: decided the parser fix. Next step: verify the release. ` +
        "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod. ".repeat(4),
      ),
    );
    const q = optimizerMetricsCollector.getCompactionQuality();
    expect(q.sampleCount).toBe(1);
    // the persisted legacy summary carries the decisions verbatim → action hit
    expect(q.missingNextActionPct).toBe(0);
    expect(q.missingCriticalStatePct).toBe(0);
  });

  it("CX-11: keyword-free persisted summary → missingNextActionPct = 100", async () => {
    // semantic branch: the engine-legacy tail sentence
    // "Continue with the current task…" carries NEXT_ACTION keyword
    // "continue" by template, so the sentinel-100 case lives here
    // (fact reported in the CODE receipt as OBS-3)
    await compactFixture(
      Array.from({ length: 60 }, (_, i) =>
        `message ${i} ` + "lorem ipsum dolor sit amet consectetur adipiscing elit. ".repeat(6),
      ),
      { compressionStrategy: "semantic" },
    );
    const q = optimizerMetricsCollector.getCompactionQuality();
    expect(q.sampleCount).toBe(1);
    expect(q.missingNextActionPct).toBe(100);
    expect(q.missingCriticalStatePct).toBe(100);
  });

  it("CX-12: legacy schema records consistency as notMeasured, never pass", async () => {
    await compactFixture(
      Array.from({ length: 60 }, (_, i) =>
        `message ${i}: decided the parser fix. Next step: verify the release. ` +
        "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod. ".repeat(4),
      ),
    );
    const q = optimizerMetricsCollector.getCompactionQuality();
    expect(q.consistency.notMeasured).toBe(1);
    expect(q.consistency.pass).toBe(0);
    expect(q.consistency.violationRate).toBe(0); // violations only from measured samples
  });

  it("proactive flag follows triggerReason (wiring end-to-end)", async () => {
    await compactFixture(
      Array.from({ length: 60 }, (_, i) =>
        `message ${i} ` + "lorem ipsum dolor sit amet consectetur adipiscing elit. ".repeat(6),
      ),
    );
    const q = optimizerMetricsCollector.getCompactionQuality();
    // triggerReason: "force" → not proactive
    expect(q.proactiveRate).toBe(0);
    expect(q.sampleCount).toBe(1);
  });
});
