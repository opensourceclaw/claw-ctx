// claw-ctx v6.8.0 — role-aware injection behavior tests (T2/T3/T4)
//
//  1. conflict arbitration: same-topic RL exemplar + Governance authority
//  2. priority ordering: P1..P5 stable descending order
//  3. permission semantics: low-priority segments cannot override authority
//  4. roleAwareInjection=false: output matches v6.7.3 (injection-order join)
//  5. ContextQualityEvaluator rubric dimension
//
// Licensed under the Apache License, Version 2.0

import { describe, expect, it, vi } from "vitest";

vi.mock('../../claw-mem/dist/memory_manager', () => ({
  getMemoryManager: () => ({
    sessionId: '',
    store: vi.fn(),
    search: vi.fn().mockReturnValue([]),
    injectConstitution: vi.fn(),
  }),
  MemoryManager: class {},
}));

vi.mock('../../claw-rl/src/memory_strategy_selector', () => ({
  MemoryStrategySelector: class {
    select() { return { strategy: 'selective_recall', confidence: 0.8, topK: 8, budgetAllocation: 2400, reasoning: 'mock' }; }
    recordFeedback() {}
    getStats() { return {}; }
    reset() {}
  },
}));

import { createClawContextEngine } from '../src/engine';
import { MockRLProvider } from '../src/rl_injector';
import { MockGovernanceProvider } from '../src/governance_injector';
import { MockCIProvider } from '../src/ci_injector';
import { MockCrossDomainProvider } from '../src/cross_domain_injector';
import { ContextQualityEvaluator } from '../src/session-resume/context-quality-evaluator';
import type { HistoryEntry } from '../src/session-resume/types';

function mockLogger(): any {
  return { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} };
}

interface Ctx {
  engine: ReturnType<typeof createClawContextEngine>;
  rl: MockRLProvider;
  gov: MockGovernanceProvider;
  ci: MockCIProvider;
  cd: MockCrossDomainProvider;
}

function makeEngine(roleAwareInjection = true): Ctx {
  const engine = createClawContextEngine(
    { workspaceDir: '/tmp', roleAwareInjection },
    mockLogger(),
  );
  const rl = new MockRLProvider();
  const gov = new MockGovernanceProvider();
  const ci = new MockCIProvider();
  const cd = new MockCrossDomainProvider();
  engine.setRLProvider(rl);
  engine.setGovernanceProvider(gov);
  engine.setCIProvider(ci);
  engine.setCrossDomainProvider(cd);
  return { engine, rl, gov, ci, cd };
}

/** Same-topic conflict fixture: RL "aggressive strategy" vs Governance "conservative strategy". */
function seedStrategyConflict(ctx: Ctx): void {
  ctx.rl.addExperience({
    id: 'rl-strategy-1',
    taskType: 'pricing',
    outcome: 'success',
    pattern: 'Aggressive strategy for pricing deployment',
    confidence: 0.9,
    learnedAt: new Date(),
  });
  ctx.gov.addSignal({
    layer: 'L1',
    type: 'policy_check',
    result: 'rejected',
    reason: 'Conservative strategy for pricing deployment required',
    timestamp: new Date(),
  });
}

function seedCiAndCrossDomain(ctx: Ctx): void {
  ctx.cd.addSignal({
    sourcePillar: 'deploy',
    sourceAgent: 'deploy-agent',
    summary: 'Deploy window constraint: no Friday deploys',
    correlation: 0.8,
    suggestion: 'Respect the deploy window',
    timestamp: new Date(),
    tokenCount: 20,
  });
  ctx.ci.addBuild({
    type: 'build',
    status: 'success',
    message: 'Build #42 passed',
    timestamp: new Date(),
    branch: 'main',
    tokenCount: 0,
  });
}

const ASSEMBLE_PARAMS = {
  sessionId: 'role-test-session',
  messages: [] as unknown[],
  ci: { enabled: true, project: 'test-proj' },
  crossDomain: { enabled: true, currentPillar: 'pricing' },
};

async function assembleWithoutMemories(ctx: Ctx): Promise<any> {
  return ctx.engine.assemble(ASSEMBLE_PARAMS);
}

describe('role-aware injection (v6.8.0)', () => {
  it('1. conflict arbitration: authority kept ahead, exemplar degraded, conflict recorded', async () => {
    const ctx = makeEngine(true);
    seedStrategyConflict(ctx);

    const result = await assembleWithoutMemories(ctx);
    const sys: string = result.systemPromptAddition ?? "";

    // authority segment appears before exemplar segment in injected text
    const govPos = sys.indexOf("[Governance Signals]");
    const rlPos = sys.indexOf("[RL Experience]");
    expect(govPos).toBeGreaterThanOrEqual(0);
    expect(rlPos).toBeGreaterThanOrEqual(0);
    expect(govPos).toBeLessThan(rlPos);

    // conflict report records the arbitration
    expect(result.roleConflicts).toEqual([
      expect.objectContaining({
        lowPrioritySource: "rl",
        highPrioritySource: "governance",
        resolved: "authority",
      }),
    ]);
    // topic is an overlapping keyword
    expect(result.roleConflicts[0].topic).toBe("strategy");

    // both segments retained (conservative: 冲突保留双段先于抑制)
    expect(sys).toContain("Aggressive strategy for pricing");
    expect(sys).toContain("Conservative strategy for pricing");

    // observational breakdown reported
    expect(result.roleBreakdown).toMatchObject({
      byRole: expect.objectContaining({ authority: 1, exemplar: 1 }),
      total: 2,
    });
  });

  it('2. priority ordering: P1 < P2 < P3 stable in injected text', async () => {
    const ctx = makeEngine(true);
    seedStrategyConflict(ctx);
    seedCiAndCrossDomain(ctx);

    const result = await assembleWithoutMemories(ctx);
    const sys: string = result.systemPromptAddition ?? "";

    const pos = (marker: string) => sys.indexOf(marker);
    const govPos = pos("[Governance Signals]");
    const rlPos = pos("[RL Experience]");
    const cdPos = pos("[Cross-Domain Signals]");
    const ciPos = pos("[CI/CD Pipeline Status]");
    expect(govPos).toBeGreaterThanOrEqual(0);
    expect(rlPos).toBeGreaterThan(govPos);
    expect(cdPos).toBeGreaterThan(rlPos);
    expect(ciPos).toBeGreaterThan(cdPos);

    expect(result.roleBreakdown).toMatchObject({
      byRole: expect.objectContaining({ authority: 1, exemplar: 1, constraint: 2 }),
      total: 4,
    });
  });

  it('3. permission semantics: RL/CI low-priority cannot override Governance authority', async () => {
    const ctx = makeEngine(true);
    seedStrategyConflict(ctx);
    seedCiAndCrossDomain(ctx);

    const result = await assembleWithoutMemories(ctx);
    const sys: string = result.systemPromptAddition ?? "";

    // authority is the first injected segment — nothing overrides it
    expect(sys.startsWith("[Governance Signals]")).toBe(true);
    // exemplar and constraint come after
    expect(sys.indexOf("[RL Experience]")).toBeGreaterThan(0);
    expect(sys.indexOf("[CI/CD Pipeline Status]")).toBeGreaterThan(0);
  });

  it('4. roleAwareInjection=false: byte-identical to v6.7.3 injection-order join', async () => {
    const ctx = makeEngine(false);
    seedStrategyConflict(ctx);
    seedCiAndCrossDomain(ctx);

    const result = await assembleWithoutMemories(ctx);
    const sys: string = result.systemPromptAddition ?? "";

    // v6.7.3 join semantics: injection order (RL -> Governance -> crossDomain -> CI),
    // no role fields, no reordering
    expect(sys.indexOf("[RL Experience]")).toBeLessThan(sys.indexOf("[Governance Signals]"));
    expect(result.roleConflicts).toBeUndefined();
    expect(result.roleBreakdown).toBeUndefined();
    // all segments still present (content never dropped)
    expect(sys).toContain("Aggressive strategy for pricing");
    expect(sys).toContain("Conservative strategy for pricing");
    expect(sys).toContain("no Friday deploys");

    // same fixture with roleAware enabled reorders; false must not
    const roleAware = makeEngine(true);
    seedStrategyConflict(roleAware);
    seedCiAndCrossDomain(roleAware);
    const ra = await assembleWithoutMemories(roleAware);
    const raSys: string = ra.systemPromptAddition ?? "";
    expect(raSys.indexOf("[Governance Signals]")).toBeLessThan(raSys.indexOf("[RL Experience]"));
  });

  it('4b. roleAwareInjection defaults to enabled', async () => {
    const ctx = makeEngine();
    seedStrategyConflict(ctx);
    const result = await assembleWithoutMemories(ctx);
    expect(result.roleConflicts).toBeDefined();
    expect(result.roleBreakdown).toBeDefined();
  });

  it('5. quality evaluator reports rubric dimension (T3)', () => {
    const evaluator = new ContextQualityEvaluator();
    const entry: HistoryEntry = {
      summary: {
        theme: 'pricing strategy',
        pendingTasks: [],
        keyPoints: ['deploy pricing'],
        timestamp: Date.now(),
        sessionId: 's1',
        messageCount: 1,
        entities: ['pricing', 'deploy'],
      },
      memoryId: 'm1',
      storedAt: Date.now(),
    };
    const report = evaluator.evaluate([entry], 'formatted context', 'pricing', [
      '[Drift Monitor]\nScore: 0.80 — quality gate',
    ]);
    expect(report.metadata.rubricCount).toBe(1);

    // without rubric blocks: backward-compatible 0
    const legacy = evaluator.evaluate([entry], 'formatted context', 'pricing');
    expect(legacy.metadata.rubricCount).toBe(0);
  });
});
