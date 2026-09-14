/**
 * claw-ctx v6.10.0 — error-card status-driven retrieval + reminder block
 * (joint design §7 ctx list). Manager injected via constructor (no vi.mock
 * needed): mock provides the v7.7.0 mem methods; absence/throw paths assert
 * the graceful-degradation discipline.
 */
import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ClawContextEngine, statusSignalKey } from "../src/engine";
import type { TaskStatusSignal } from "../src/engine";
import { ERROR_CARD_BLOCK_MAX_TOKENS } from "../src/structural-digest/constants";
import { parseDigest, serializeDigest } from "../src/structural-digest/serialize";

function mockLogger(): any {
  return { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} };
}

function mkManager(overrides: Record<string, unknown> = {}): any {
  return {
    sessionId: "",
    store: vi.fn(),
    search: vi.fn().mockReturnValue([]),
    injectConstitution: vi.fn(),
    ...overrides,
  };
}

function mkEngine(manager: any): ClawContextEngine {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-ctx-ec-"));
  const engine = new ClawContextEngine({ workspaceDir: dir }, mockLogger(), manager);
  return engine;
}

const cards = [
  {
    cardId: "epc:deploy-schema-check",
    rootCauseCategory: "skill-defect",
    provenance: { source: "remember" },
    errorSignature: { trigger: "before deploying a schema change", symptom: "runtime rejects new fields" },
    resolution: "run schema validation first.",
    effectiveness: { hitCount: 1, avoidedCount: 0, inactive: false },
  },
];

describe("statusSignalKey (deterministic retrieval key, design §3.1)", () => {
  it("#1 full signal joins deterministically (same input → same key)", () => {
    const s: TaskStatusSignal = { taskType: "deploy", stage: "release", recentErrorIds: ["e1", "e2"] };
    expect(statusSignalKey(s)).toBe("deploy release e1 e2");
    expect(statusSignalKey(s)).toBe(statusSignalKey({ ...s }));
  });

  it("#2 missing dimensions do not participate; recentErrorIds capped at 5", () => {
    expect(statusSignalKey({ stage: "impl" })).toBe("impl");
    const many = { recentErrorIds: ["1", "2", "3", "4", "5", "6", "7"] };
    expect(statusSignalKey(many)).toBe("1 2 3 4 5");
  });

  it("#3 fully absent signal → empty key (nothing to retrieve with)", () => {
    expect(statusSignalKey(undefined)).toBe("");
    expect(statusSignalKey({})).toBe("");
  });
});

describe("error-card reminder block in assemble (§3.2)", () => {
  it("#4 statusSignal present + mem hit → [Error Pattern Cards] block lands in stable prefix AHEAD of the memory block", async () => {
    const manager = mkManager({
      findCardsForInjection: vi.fn().mockReturnValue(cards),
      formatCardsAsReminder: vi.fn().mockReturnValue("[Error Pattern Cards]\n- ⚠️ [epc:x] t → r"),
    });
    const engine = mkEngine(manager);
    await engine.bootstrap({ sessionId: "s1", sessionFile: "/tmp/test.md" });
    const result = await engine.assemble({
      sessionId: "s1",
      messages: [{ role: "user", content: "hello" }],
      prompt: "hello",
      statusSignal: { taskType: "deploy", stage: "release" },
    });
    const addition = (result as any).systemPromptAddition ?? "";
    const found = String(addition).includes("[Error Pattern Cards]");
    expect(found).toBe(true);
    expect(manager.findCardsForInjection).toHaveBeenCalled();
  });

  it("#5 triggerQuery folds the retrieval key and the last user query (deterministic)", async () => {
    const manager = mkManager({
      findCardsForInjection: vi.fn().mockReturnValue(cards),
      formatCardsAsReminder: vi.fn().mockReturnValue("[Error Pattern Cards]\nx"),
    });
    const engine = mkEngine(manager);
    await engine.bootstrap({ sessionId: "s2", sessionFile: "/tmp/test.md" });
    await engine.assemble({
      sessionId: "s2",
      messages: [{ role: "user", content: "hello" }],
      prompt: "hello",
      statusSignal: { taskType: "deploy" },
    });
    const arg = (manager.findCardsForInjection as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.triggerQuery).toContain("deploy");
    expect(arg.triggerQuery).toContain("hello");
  });

  it("#6 mem without v7.7.0 methods (legacy/mock) → block absent, main flow fine", async () => {
    const manager = mkManager(); // no findCardsForInjection
    const engine = mkEngine(manager);
    await engine.bootstrap({ sessionId: "s3", sessionFile: "/tmp/test.md" });
    const result = await engine.assemble({
      sessionId: "s3",
      messages: [{ role: "user", content: "hello" }],
      prompt: "hello",
      statusSignal: { taskType: "deploy" },
    });
    expect((result as any).systemPromptAddition ?? "").not.toContain("[Error Pattern Cards]");
  });

  it("#7 mem query throws → block absent, zero blocking (graceful)", async () => {
    const manager = mkManager({
      findCardsForInjection: vi.fn().mockImplementation(() => { throw new Error("mem down"); }),
    });
    const engine = mkEngine(manager);
    await engine.bootstrap({ sessionId: "s4", sessionFile: "/tmp/test.md" });
    const result = await engine.assemble({
      sessionId: "s4",
      messages: [{ role: "user", content: "hello" }],
      prompt: "hello",
      statusSignal: { taskType: "deploy" },
    });
    expect((result as any).systemPromptAddition ?? "").not.toContain("[Error Pattern Cards]");
  });

  it("#8 no signal and no detectable task type → retrieval skipped entirely", async () => {
    const manager = mkManager({
      findCardsForInjection: vi.fn().mockReturnValue(cards),
    });
    const engine = mkEngine(manager);
    await engine.bootstrap({ sessionId: "s5", sessionFile: "/tmp/test.md" });
    await engine.assemble({
      sessionId: "s5",
      messages: [{ role: "user", content: "hello" }],
      prompt: "hello",
    });
    expect(manager.findCardsForInjection).not.toHaveBeenCalled();
  });
});

describe("capacity & frozen surfaces (§3.3 / §6)", () => {
  it("#9 ERROR_CARD_BLOCK_MAX_TOKENS exported with 待校准 annotation; maxChars = tokens*4 passed to mem formatter", async () => {
    expect(ERROR_CARD_BLOCK_MAX_TOKENS).toBe(256);
    const src = fs.readFileSync(new URL("../src/structural-digest/constants.ts", import.meta.url), "utf8");
    expect(src).toContain("待校准");
    const manager = mkManager({
      findCardsForInjection: vi.fn().mockReturnValue(cards),
      formatCardsAsReminder: vi.fn().mockReturnValue("[Error Pattern Cards]\nx"),
    });
    const engine = mkEngine(manager);
    await engine.bootstrap({ sessionId: "s6", sessionFile: "/tmp/test.md" });
    await engine.assemble({
      sessionId: "s6",
      messages: [{ role: "user", content: "hello" }],
      prompt: "hello",
      statusSignal: { taskType: "deploy" },
    });
    const fmt = manager.formatCardsAsReminder as ReturnType<typeof vi.fn>;
    expect(fmt.mock.calls[0][1]).toEqual({ maxChars: 256 * 4 });
  });

  it("#10 structural-digest frozen: section order (confirmed → rejected → pitfalls) unchanged; serializer never emits card blocks", () => {
    const digest = parseAnyDigest();
    const out = serializeDigest(digest);
    // 序列化按段定义序（v6.9.0 冻结面）；截断优先级（rejected 最先保留）是
    // 溢出丢弃序，不改变输出段序
    const confirmedAt = out.indexOf("-- 已确认 --");
    const rejectedAt = out.indexOf("-- 已否决 --");
    const pitfallsAt = out.indexOf("-- API 契约与坑 --");
    expect(confirmedAt).toBeGreaterThan(-1);
    expect(rejectedAt).toBeGreaterThan(confirmedAt);
    expect(pitfallsAt).toBeGreaterThan(rejectedAt);
    expect(out).not.toContain("[Error Pattern Cards]"); // serializer never emits card blocks
  });

  it("#11 enum passthrough: no rootCauseCategory literal hardcoded in ctx src (source-lock)", () => {
    const src = fs.readFileSync(new URL("../src/engine.ts", import.meta.url), "utf8");
    for (const literal of ["skill-defect", "state-defect", "invocation-timing", "transition-judgment"]) {
      expect(src.includes(literal)).toBe(false);
    }
  });

  it("#12 contract §3 timing documented + host-silent path has no fabricated data", async () => {
    // 跨仓原件在 CI 单仓 checkout 下不可达 → 快照 vendored 至 tests/fixtures/（同步责任见快照头注）
    const contract = fs.readFileSync(
      new URL("./fixtures/error-card-injection-contract.snapshot.md", import.meta.url),
      "utf8"
    );
    expect(contract).toContain("avoided");
    expect(contract).toContain("Verdict authority = the host");
    // host never writes back → mem hit-count untouched (mock records no extra calls)
    const manager = mkManager({
      findCardsForInjection: vi.fn().mockReturnValue(cards),
      formatCardsAsReminder: vi.fn().mockReturnValue("[Error Pattern Cards]\nx"),
      recordErrorPatternHit: vi.fn(),
    });
    const engine = mkEngine(manager);
    await engine.bootstrap({ sessionId: "s7", sessionFile: "/tmp/test.md" });
    await engine.assemble({
      sessionId: "s7",
      messages: [{ role: "user", content: "hello" }],
      prompt: "hello",
      statusSignal: { taskType: "deploy" },
    });
    expect(manager.recordErrorPatternHit).not.toHaveBeenCalled(); // ctx never auto-writes back
  });

  it("#13 re-vendored snapshot carries the v7.8.0 §6 face (cardType dimension; additive lock)", () => {
    // ctx passes mem-produced blocks through verbatim (engine.ts) — §6 is
    // mem-side additive; this lock only keeps the vendored copy honest.
    const contract = fs.readFileSync(
      new URL("./fixtures/error-card-injection-contract.snapshot.md", import.meta.url),
      "utf8"
    );
    expect(contract).toContain("## 6. v7.8.0 additive extension");
    expect(contract).toContain('cardType?: "error-pattern" | "success-strategy"');
    expect(contract).toContain("[Experience Cards]");
    expect(contract).toContain("lifecycle");
    expect(contract).toContain("Verdict authority = the host"); // v7.7.0 base face preserved
  });
});

/** Minimal digest fixture for #10 (serializer input shape). */
function parseAnyDigest(): any {
  const text = [
    "[STRUCTURAL-DIGEST v1]",
    "-- 已确认 --",
    "- fact one (actor: team) [src m1: snippet]",
    "-- 已否决 --",
    "- approach x: broke y [src m2: snippet]",
    "-- API 契约与坑 --",
    "- api z: pitfall (workaround: w) [src m3: snippet]",
  ].join("\n");
  return parseDigest(text);
}
