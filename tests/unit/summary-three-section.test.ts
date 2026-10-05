// v6.11.0 P2 — three-section summary schema + self-consistency (design §2.1/§4)

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  SemanticCompressor,
  type SummaryOutput,
} from "../../src/semantic-compressor.js";
import {
  OptimizerMetricsCollector,
  NEXT_ACTION_KEYWORDS,
} from "../../src/metrics/optimizer-metrics.js";

const msg = (content: string) => ({ message: { content } });

function build(
  contents: string[],
  overrides: { decisions?: string[]; entities?: string[]; topics?: string[] } = {},
): SummaryOutput {
  const c = new SemanticCompressor();
  return c.buildSummarySections(
    contents.map(msg),
    contents.length,
    overrides.decisions ?? ["decided to ship"],
    overrides.entities ?? ["claw-ctx"],
    overrides.topics ?? ["release"],
  );
}

describe("three-section summary schema (P2, v6.11.0)", () => {
  it("produces all three section heads and keeps the [Compacted History prefix", () => {
    const out = build(["Next step: deploy the fix.", "The gateway is blocked."]);
    expect(out.text).toContain("[Compacted History");
    expect(out.text).toContain("Recorded Findings:");
    expect(out.text).toContain("Workspace State:");
    expect(out.text).toContain("Next Action:");
  });

  it("Findings merges topics + decisions + entities", () => {
    const out = build(["whatever"], {
      decisions: ["decided A", "decided B"],
      entities: ["gates.json"],
      topics: ["governance"],
    });
    expect(out.sections.recordedFindings).toContain("governance");
    expect(out.sections.recordedFindings).toContain('"decided A"');
    expect(out.sections.recordedFindings).toContain("gates.json");
  });

  it("extracts state and action sentences from the removed messages", () => {
    const out = build([
      "The auth error is fixed now.",
      "Next step: run the acceptance suite.",
    ]);
    expect(out.sections.workspaceState).toContain("auth error is fixed");
    expect(out.sections.nextAction).toContain("run the acceptance suite");
    expect(out.consistency.status).toBe("pass");
  });

  it("no action sentence → (none recorded) placeholder", () => {
    const out = build(["Just chatting about the weather today."]);
    expect(out.sections.nextAction).toBe("(none recorded)");
  });

  it("R1: placeholder contains NO keyword from the screening table", () => {
    const out = build(["Just chatting about the weather today."]);
    for (const kw of NEXT_ACTION_KEYWORDS) {
      expect(out.sections.nextAction.toLowerCase()).not.toContain(kw.toLowerCase());
    }
  });

  it("R1配套: a placeholder-only sample counts as missingNextAction = 100%", () => {
    const out = build(["Just chatting about the weather today."]);
    const c = new OptimizerMetricsCollector();
    c.recordCompactionQuality({
      sessionId: "s",
      triggerReason: "auto",
      proactive: true,
      summaryText: out.text,
      removedCount: 5,
      consistency: "pass",
    });
    expect(c.getCompactionQuality().missingNextActionPct).toBe(100);
  });

  it("violation → one rejection → regenerated action prefixed Revisit:", () => {
    const out = build([
      "Next step: deploy is done.",
      "The auth service is blocked.",
    ]);
    expect(out.consistency.status).toBe("rejected");
    expect(out.sections.nextAction).toContain("Revisit:");
    expect(out.text).toContain("Next Action:");
    // regenerated text no longer completion-marked → lands as rejected
    expect(out.consistency).toHaveProperty("reason");
  });

  it("persistent violation after regeneration → degraded fallback (R2-a, table word)", () => {
    const out = build([
      "Next step: schema migration is done.",
      "Login resolved but payments pending.",
    ]);
    expect(out.consistency.status).toBe("degraded");
    expect(out.sections.nextAction).toBe("Next step: resolve unresolved items");
    // R2(a): fallback must itself satisfy the next-action table
    const lower = out.sections.nextAction.toLowerCase();
    expect(NEXT_ACTION_KEYWORDS.some((k) => lower.includes(k.toLowerCase()))).toBe(true);
  });

  it("degraded fallback carries no completion marker → always lands", () => {
    const out = build([
      "Next step: schema migration is done.",
      "Login resolved but payments pending.",
    ]);
    expect(out.consistency.status).toBe("degraded");
    // no completion word in the fallback itself (word-boundary: "unresolved"
    // must NOT count as "resolved" — same rule as isCompletion)
    expect(out.sections.nextAction.toLowerCase()).not.toMatch(
      /\b(done|completed|finished|closed|resolved)\b/,
    );
  });

  it("rejection cap = 1: stable violation ends degraded, never loops", () => {
    const out = build([
      "Next step: schema migration is done.",
      "Login resolved but payments pending.",
    ]);
    // single state-machine evaluation yields a terminal verdict
    expect(["rejected", "degraded"]).toContain(out.consistency.status);
    expect(out.consistency.status).toBe("degraded");
  });

  it("conservative 已: 「已经讨论」 is not completion, no violation", () => {
    const out = build([
      "下一步 已经讨论了方案细节",
      "权限矩阵 待确认",
    ]);
    expect(out.consistency.status).toBe("pass");
  });

  it("default config stays legacy: compress() emits no sections", () => {
    const c = new SemanticCompressor();
    const messages = Array.from({ length: 40 }, (_, i) =>
      msg(`message ${i} with decisions and todos `.repeat(8)),
    );
    const tokens = messages.map(() => 50);
    const r = c.compress(messages, tokens, 500);
    expect(r.sections).toBeUndefined();
    expect(r.consistency).toBeUndefined();
    expect(r.summary).toBe(
      c.buildSummary(
        messages.filter((_, i) => r.keptIndices.includes(i) === false),
        r.removedIndices.length,
        r.decisions,
        r.entities,
        r.topics,
      ),
    );
  });

  it("summarySchema: three-section → sections + consistency present", () => {
    const c = new SemanticCompressor({ summarySchema: "three-section" });
    const messages = Array.from({ length: 40 }, (_, i) =>
      msg(`message ${i}: decided the fix, next step: verify `.repeat(8)),
    );
    const tokens = messages.map(() => 50);
    const r = c.compress(messages, tokens, 500);
    expect(r.sections).toBeDefined();
    expect(r.consistency).toBeDefined();
    expect(r.summary).toContain("Recorded Findings:");
    expect(r.summary).toBe(r.summary); // text is the summary
  });

  it("golden: default schema output byte-equals the v6.10.4 fixture", () => {
    // Same deterministic 60-message fixture that produced
    // tests/golden/legacy-summary-v6104.txt (f90073a behavior; the source
    // file diff f90073a..HEAD has zero deletions in buildSummary).
    const messages = Array.from({ length: 60 }, (_, i) => ({
      message: {
        role: i % 2 ? "user" : "assistant",
        content:
          `message ${i}: decided to keep the gate, fixed the parser. ` +
          (i % 3 === 0 ? "Next step: verify the release. " : "") +
          "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor. ".repeat(3),
      },
    }));
    const tokens = messages.map((_, i) => 40 + (i % 7));
    const c = new SemanticCompressor();
    const r = c.compress(messages, tokens, 1500);
    const golden = fs.readFileSync(
      path.join(import.meta.dirname, "../golden/legacy-summary-v6104.txt"),
      "utf-8",
    );
    expect(r.summary + "\n").toBe(golden);
    expect(r.sections).toBeUndefined();
  });
});
