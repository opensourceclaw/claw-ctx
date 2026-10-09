/**
 * claw-ctx v6.13.0 — P3 continuation guard unit tests (design §6.1)
 */
import { describe, it, expect } from "vitest";
import {
  ContinuationGuard,
  redoLoopDetector,
  refetchSummarizedDetector,
  planRestatementDetector,
  DEFAULT_CONTINUATION_GUARD_CONFIG,
} from "../../src/continuation-guard.js";

const ON = { enabled: true, windowTurns: 3, refetchHint: true };

function toolUse(name: string, input: unknown) {
  return { role: "assistant", content: [{ type: "tool_use", name, input }] };
}

const DUP = [toolUse("read", { path: "a" }), toolUse("read", { path: "a" })];

describe("ContinuationGuard", () => {
  it("default config is disabled", () => {
    expect(DEFAULT_CONTINUATION_GUARD_CONFIG.enabled).toBe(false);
    expect(DEFAULT_CONTINUATION_GUARD_CONFIG.windowTurns).toBe(3);
    expect(DEFAULT_CONTINUATION_GUARD_CONFIG.refetchHint).toBe(true);
  });

  it("disabled ⇒ arm/inspect are no-ops", () => {
    const g = new ContinuationGuard(); // default disabled
    g.arm("s");
    expect(g.inspect("s", DUP, "")).toEqual([]);
  });

  it("redo-loop detector fires on identical adjacent tool calls", () => {
    const sig = redoLoopDetector({ messages: DUP, summaryText: "", windowTurn: 0 });
    expect(sig?.kind).toBe("redo-loop");
  });

  it("redo-loop does not fire on distinct args", () => {
    const sig = redoLoopDetector({
      messages: [toolUse("read", { path: "a" }), toolUse("read", { path: "b" })],
      summaryText: "",
      windowTurn: 0,
    });
    expect(sig).toBeUndefined();
  });

  it("refetch-summarized fires when a retrieval tool's args hit summary content", () => {
    const sig = refetchSummarizedDetector({
      messages: [toolUse("read", { path: "importantdecisions.md" })],
      summaryText: "Recorded Findings: importantdecisions were recorded earlier",
      windowTurn: 0,
    });
    expect(sig?.kind).toBe("refetch-summarized");
  });

  it("plan-restatement fires on assistant text restating the summary's next action", () => {
    const sig = planRestatementDetector({
      messages: [{ role: "assistant", content: "Next step: verify the release pipeline" }],
      summaryText: "[Compacted History - 5 msgs] Next Action: verify the release pipeline",
      windowTurn: 0,
    });
    expect(sig?.kind).toBe("plan-restatement");
  });

  it("plan-restatement is silent when the summary has no Next Action segment (legacy)", () => {
    const sig = planRestatementDetector({
      messages: [{ role: "assistant", content: "Next step: verify the release pipeline" }],
      summaryText: "[Compacted History — 5 earlier messages summarized]\nTopics: x",
      windowTurn: 0,
    });
    expect(sig).toBeUndefined();
  });

  it("inspect before arm ⇒ no-op", () => {
    const g = new ContinuationGuard(ON);
    expect(g.inspect("s", DUP, "")).toEqual([]);
  });

  it("runs while armed then auto-disarms after windowTurns", () => {
    const g = new ContinuationGuard(ON);
    g.arm("s");
    expect(g.inspect("s", DUP, "").length).toBeGreaterThan(0); // turn 0
    expect(g.inspect("s", DUP, "").length).toBeGreaterThan(0); // turn 1
    expect(g.inspect("s", DUP, "").length).toBeGreaterThan(0); // turn 2
    expect(g.inspect("s", DUP, "")).toEqual([]);               // window expired
  });

  it("W4 extension point: an injected detector runs", () => {
    const custom = () => ({ kind: "redo-loop" as const, detail: "custom", turn: 0 });
    const g = new ContinuationGuard(ON, [custom]);
    g.arm("s");
    const hits = g.inspect("s", [], "");
    expect(hits).toHaveLength(1);
    expect(hits[0].detail).toBe("custom");
  });

  it("resetSession disarms", () => {
    const g = new ContinuationGuard(ON);
    g.arm("s");
    g.resetSession("s");
    expect(g.inspect("s", DUP, "")).toEqual([]);
  });
});
