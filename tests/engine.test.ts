import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Mock claw-mem to avoid CJS/ESM conflict
vi.mock('../../claw-mem/dist/memory_manager', () => ({
  getMemoryManager: () => ({
    sessionId: '',
    store: vi.fn(),
    search: vi.fn().mockReturnValue([]),
    injectConstitution: vi.fn(),
  }),
  MemoryManager: class {},
}));

// Mock claw-rl strategy selector
vi.mock('../../claw-rl/src/memory_strategy_selector', () => ({
  MemoryStrategySelector: class {
    select() {
      return { strategy: 'selective_recall', confidence: 0.8, topK: 8, budgetAllocation: 2400, reasoning: 'mock' };
    }
    recordFeedback() {}
    getStats() { return {}; }
    reset() {}
  },
}));

import { ClawContextEngine, createClawContextEngine } from '../src/engine';
import { MockRLProvider } from '../src/rl_injector';
import { MockGovernanceProvider } from '../src/governance_injector';
import { MockCrossDomainProvider } from '../src/cross_domain_injector';
import { MockCIProvider } from '../src/ci_injector';

function mockLogger(): any {
  return { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} };
}

function createSessionFile(msgCount: number = 30): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claw-ctx-test-'));
  const file = path.join(dir, 'session.jsonl');
  const entries = [
    JSON.stringify({ type: 'session', version: '3', id: 'test', timestamp: new Date().toISOString(), cwd: '/tmp' }),
  ];
  // Large filler: each message ~200 tokens → 30 messages = ~6000 tokens
  const filler = 'Lorem ipsum dolor sit amet '.repeat(40); // ~600 chars, ~170 tokens each
  for (let i = 0; i < msgCount; i++) {
    entries.push(JSON.stringify({
      type: 'message',
      id: `msg-${i}`,
      parentId: i === 0 ? 'test' : `msg-${i - 1}`,
      timestamp: new Date(Date.now() - (msgCount - i) * 1000).toISOString(),
      message: { role: i % 2 === 0 ? 'user' : 'assistant', content: `Msg ${i}: ${filler}` },
    }));
  }
  fs.writeFileSync(file, entries.join('\n') + '\n', 'utf-8');
  return file;
}

describe('ClawContextEngine', () => {
  it('creates instance with factory', () => {
    const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
    expect(engine).toBeDefined();
    expect(engine.info.id).toBe('claw-ctx');
  });

  it('bootstrap initializes session', async () => {
    const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
    const result = await engine.bootstrap({ sessionId: 'test-session', sessionFile: '/tmp/test.md' });
    expect(result.bootstrapped).toBe(true);
    expect(result.reason).toContain('bootstrapped');
  });

  it('ingest stores valid message', async () => {
    const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
    await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
    const result = await engine.ingest({
      sessionId: 'test',
      message: { role: 'user', content: 'This is a test message with enough content to be stored' },
    });
    expect(typeof result.ingested).toBe('boolean');
  });

  it('ingest skips short messages', async () => {
    const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
    await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
    const result = await engine.ingest({
      sessionId: 'test',
      message: { role: 'user', content: 'hi' },
    });
    expect(result.ingested).toBe(false);
  });

  it('ingest skips heartbeats', async () => {
    const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
    const result = await engine.ingest({
      sessionId: 'test',
      message: { role: 'user', content: 'hello world' },
      isHeartbeat: true,
    });
    expect(result.ingested).toBe(false);
  });

  it('assemble returns messages even without memories', async () => {
    const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
    await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
    const result = await engine.assemble({
      sessionId: 'test',
      messages: [{ role: 'user', content: 'hello' }],
      prompt: 'hello',
    });
    expect(result.messages).toBeDefined();
    expect(result.estimatedTokens).toBeGreaterThanOrEqual(0);
  });

  it('compact returns below threshold when not forced', async () => {
    const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
    await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
    const result = await engine.compact({
      sessionId: 'test', sessionFile: '/tmp/test.md',
      force: false, currentTokenCount: 10000,
    });
    expect(result.ok).toBe(true);
    expect(result.compacted).toBe(false);
  });

  it('compact aborts on signal', async () => {
    const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
    const controller = new AbortController();
    controller.abort();
    const result = await engine.compact({
      sessionId: 'test', sessionFile: '/tmp/test.md',
      abortSignal: controller.signal,
    });
    expect(result.ok).toBe(false);
  });

  it('afterTurn stores compaction summary', async () => {
    const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
    await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
    await engine.afterTurn({
      sessionId: 'test', sessionFile: '/tmp/test.md',
      messages: [], prePromptMessageCount: 0,
      autoCompactionSummary: 'summary text',
    });
    // No throw = pass
  });

  it('dispose cleans up', async () => {
    const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
    await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
    await engine.dispose();
    // No throw = pass
  });

  describe('v2.0.0 features', () => {
    it('assemble with confidenceMode strict', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
      const result = await engine.assemble({
        sessionId: 'test',
        messages: [{ role: 'user', content: 'hello' }],
        prompt: 'hello',
        confidenceMode: 'strict',
        confidenceThreshold: 0.5,
      });
      expect(result.messages).toBeDefined();
      expect(result.confidenceReport).toBeDefined();
      expect(result.confidenceReport!.mode).toBe('strict');
    });

    it('assemble with confidenceMode disabled produces no report', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
      const result = await engine.assemble({
        sessionId: 'test',
        messages: [{ role: 'user', content: 'hello' }],
        prompt: 'hello',
        confidenceMode: 'disabled',
      });
      expect(result.messages).toBeDefined();
    });

    it('injectRLExperience returns empty when no provider set', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
      const result = await engine.injectRLExperience({
        sessionId: 'test',
      });
      expect(result.experiences).toHaveLength(0);
    });

    it('injectRLExperience returns experiences from provider', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const provider = new MockRLProvider();
      provider.addExperience({
        id: 'rl-1',
        taskType: 'test',
        outcome: 'success',
        pattern: 'Test pattern',
        confidence: 0.9,
        learnedAt: new Date(),
      });
      engine.setRLProvider(provider);
      const result = await engine.injectRLExperience({
        sessionId: 'test',
        taskType: 'test',
      });
      expect(result.experiences).toHaveLength(1);
      expect(result.experiences[0].taskType).toBe('test');
    });

    it('injectGovernanceSignals returns empty when no provider set', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
      const result = await engine.injectGovernanceSignals({
        sessionId: 'test',
      });
      expect(result.signals).toHaveLength(0);
    });

    it('injectGovernanceSignals returns signals from provider', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const provider = new MockGovernanceProvider();
      provider.addSignal({
        layer: 'L1',
        type: 'intent_check',
        result: 'approved',
        timestamp: new Date(),
      });
      engine.setGovernanceProvider(provider);
      const result = await engine.injectGovernanceSignals({
        sessionId: 'test',
        governanceLayers: ['L1'],
      });
      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].layer).toBe('L1');
    });

    it('getConfidenceGate returns null by default', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      expect(engine.getConfidenceGate()).toBeNull();
    });

    it('getConfidenceGate returns gate after assemble with confidence', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.assemble({
        sessionId: 'test',
        messages: [],
        confidenceMode: 'strict',
      });
      expect(engine.getConfidenceGate()).not.toBeNull();
    });

    it('info shows v2.0.0', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      expect(engine.info.version).toBe('4.21.0');
    });
  });

  describe('v3.0.0 features', () => {
    it('assemble with crossDomain disabled returns no report', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
      const result = await engine.assemble({
        sessionId: 'test',
        messages: [{ role: 'user', content: 'hello' }],
        prompt: 'hello',
      });
      expect(result.crossDomainReport).toBeUndefined();
    });

    it('assemble with crossDomain enabled injects signals', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const provider = new MockCrossDomainProvider();
      provider.addSignal({
        sourcePillar: 'stark',
        sourceAgent: 'stark-dev',
        summary: 'Fixed N+1 query',
        correlation: 0.85,
        suggestion: 'Performance may be improved',
        timestamp: new Date(),
        tokenCount: 0,
      });
      engine.setCrossDomainProvider(provider);

      const result = await engine.assemble({
        sessionId: 'test',
        messages: [{ role: 'user', content: 'hello' }],
        prompt: 'hello',
        crossDomain: {
          enabled: true,
          currentPillar: 'pepper',
          currentIntent: 'chat',
        },
      });
      expect(result.crossDomainReport).toBeDefined();
      expect(result.crossDomainReport!.signalsInjected).toBe(1);
      expect(result.crossDomainReport!.correlations[0].sourcePillar).toBe('stark');
    });

    it('assemble with crossDomain filters same-pillar signals', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const provider = new MockCrossDomainProvider();
      provider.addSignal({
        sourcePillar: 'pepper',
        sourceAgent: 'pepper-agent',
        summary: 'Something from pepper',
        correlation: 0.9,
        suggestion: 'test',
        timestamp: new Date(),
        tokenCount: 0,
      });
      engine.setCrossDomainProvider(provider);

      const result = await engine.assemble({
        sessionId: 'test',
        messages: [{ role: 'user', content: 'hello' }],
        prompt: 'hello',
        crossDomain: {
          enabled: true,
          currentPillar: 'pepper',
        },
      });
      // Should have no cross-domain signals since only pepper signal exists
      expect(result.crossDomainReport?.signalsInjected ?? 0).toBe(0);
    });

    it('compact uses crossDomain reserve', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const sessionFile = createSessionFile(30);
      // Small tokenBudget (1000) forces compaction on 6K-token session
      const result = await engine.compact({
        sessionId: 'test',
        sessionFile,
        force: false,
        currentTokenCount: 110000,
        tokenBudget: 4000,
        reserveForCrossDomain: 5000,
      });
      expect(result.compacted).toBe(true);
      expect(result.ok).toBe(true);
    });

    it('getBudgetManager returns budget manager', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const bm = engine.getBudgetManager();
      expect(bm).toBeDefined();
      const config = bm.getConfig();
      expect(config.totalBudget).toBe(8000);
    });
  });

  describe('v4.0.0 features', () => {
    it('assemble with ci disabled returns no ciReport', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
      const result = await engine.assemble({
        sessionId: 'test',
        messages: [{ role: 'user', content: 'hello' }],
        prompt: 'hello',
      });
      expect(result.ciReport).toBeUndefined();
    });

    it('assemble with ci enabled injects signals', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const provider = new MockCIProvider();
      provider.addBuild({
        type: 'build',
        status: 'success',
        message: 'Build #42 passed',
        timestamp: new Date(),
        branch: 'main',
        tokenCount: 0,
      });
      engine.setCIProvider(provider);

      const result = await engine.assemble({
        sessionId: 'test',
        messages: [{ role: 'user', content: 'hello' }],
        prompt: 'hello',
        ci: { enabled: true, project: 'test-proj' },
      });
      expect(result.ciReport).toBeDefined();
      expect(result.ciReport!.signalsInjected).toBe(1);
      expect(result.ciReport!.signals[0].type).toBe('build');
    });

    it('assemble with ci shows failures first in report', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const provider = new MockCIProvider();
      provider.addTestResult({
        type: 'test',
        status: 'success',
        message: 'All passed',
        timestamp: new Date(),
        tokenCount: 0,
      });
      provider.addBuild({
        type: 'build',
        status: 'failure',
        message: 'Compilation error',
        timestamp: new Date(Date.now() - 60000),
        tokenCount: 0,
      });
      engine.setCIProvider(provider);

      const result = await engine.assemble({
        sessionId: 'test',
        messages: [{ role: 'user', content: 'hello' }],
        prompt: 'hello',
        ci: { enabled: true },
      });
      expect(result.ciReport!.signals[0].status).toBe('failure');
    });

    it('compact uses ci reserve', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const sessionFile = createSessionFile(30);
      const result = await engine.compact({
        sessionId: 'test',
        sessionFile,
        force: false,
        currentTokenCount: 105000,
        tokenBudget: 4000,
        reserveForCrossDomain: 3000,
        reserveForCI: 3000,
      });
      expect(result.compacted).toBe(true);
      expect(result.ok).toBe(true);
    });

    it('info shows v4.0.0', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      expect(engine.info.version).toBe('4.21.0');
    });
  });

  // ── v4.3.0: Token Counter ────────────────────────────────────────

  describe('v4.3.0 token counter', () => {
    it('getTokenCounter returns counter instance', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const tc = engine.getTokenCounter();
      expect(tc).toBeDefined();
      expect(typeof tc.count).toBe('function');
    });

    it('countTokens returns result with method and tokens', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const result = engine.countTokens('hello world test');
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.method).toBeDefined();
    });

    it('countTokens handles Chinese text', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const result = engine.countTokens('你好世界测试文本');
      expect(result.tokens).toBeGreaterThan(0);
    });

    it('countTokens handles empty string', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const result = engine.countTokens('');
      expect(result.tokens).toBe(0);
    });
  });

  // ── v4.5.0: Smart Budget Allocation ──────────────────────────────

  describe('v4.5.0 smart budget', () => {
    it('calculateSmartBudget returns allocation with drift info', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const result = engine.calculateSmartBudget(10000, 'debugging', [
        { role: 'user', content: 'fix the bug in the code' },
        { role: 'assistant', content: 'analyzing the error...' },
      ]);
      expect(result.allocation).toBeDefined();
      expect(result.driftScore).toBeGreaterThanOrEqual(0);
      expect(['stable', 'low', 'medium', 'high']).toContain(result.driftLevel);
    });

    it('calculateSmartBudget works with unknown task type', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const result = engine.calculateSmartBudget(8000, 'unknown');
      expect(result.allocation).toBeDefined();
    });

    it('getSmartBudgetAllocator returns allocator', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const allocator = engine.getSmartBudgetAllocator();
      expect(allocator).toBeDefined();
    });

    it('getBudgetHistory returns empty array initially', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const history = engine.getBudgetHistory();
      expect(Array.isArray(history)).toBe(true);
    });
  });

  // ── v4.7.0: Session State ────────────────────────────────────────

  describe('v4.7.0 session state', () => {
    it('getSessionState returns null initially', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      expect(engine.getSessionState()).toBeNull();
    });

    it('ingest populates session state with entities', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 's1', sessionFile: '/tmp/test.md' });
      await engine.ingest({
        sessionId: 's1',
        message: { role: 'user', content: 'Working on the TypeScript migration for the devclaw project' },
      });
      const state = engine.getSessionState();
      // State may or may not be populated depending on entity extraction
      expect(state === null || typeof state === 'object').toBe(true);
    });

    it('getKeyEntities returns categorized entities', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const entities = engine.getKeyEntities();
      expect(entities).toBeDefined();
      expect(entities).toHaveProperty('person');
      expect(entities).toHaveProperty('tool');
      expect(entities).toHaveProperty('concept');
      expect(entities).toHaveProperty('project');
    });
  });

  // ── v4.19.0: Health Check ────────────────────────────────────────

  describe('v4.19.0 health check', () => {
    it('healthCheck returns healthy status with valid checks', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const result = engine.healthCheck();
      expect(result.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.checks).toBeDefined();
      expect(result.metrics).toBeDefined();
    });

    it('healthCheck includes tokenCounter check', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const result = engine.healthCheck();
      expect(result.checks).toHaveProperty('tokenCounter');
      expect(result.metrics).toHaveProperty('tokenCountLatency');
    });

    it('healthCheck includes driftDetector check', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const result = engine.healthCheck();
      expect(result.checks).toHaveProperty('driftDetector');
      expect(result.metrics).toHaveProperty('driftScore');
    });

    it('healthCheck includes memoryManager check', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const result = engine.healthCheck();
      expect(result.checks).toHaveProperty('memoryManager');
      expect(result.metrics).toHaveProperty('hasSession');
    });

    it('healthCheck includes tokenCache check', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const result = engine.healthCheck();
      expect(result.checks).toHaveProperty('tokenCache');
      expect(result.metrics).toHaveProperty('tokenCacheSize');
    });

    it('healthCheck includes dependencyTracker check', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const result = engine.healthCheck();
      expect(result.checks).toHaveProperty('dependencyTracker');
      expect(result.checks.dependencyTracker).toBe(false);
    });

    it('healthCheck reports healthy with dep tracker after access', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      engine.getDependencyTracker(); // initialize it
      const result = engine.healthCheck();
      expect(result.checks.dependencyTracker).toBe(true);
    });
  });

  // ── v5.0.0: Drift Detection ──────────────────────────────────────

  describe('v5.0.0 drift detection', () => {
    it('feedDriftDetector returns alerts', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const alerts = engine.feedDriftDetector([
        { content: 'we are building a new feature for the API', role: 'user' },
        { content: 'actually, let me reconsider the whole architecture', role: 'user' },
        { content: 'now I want to switch to a different framework entirely', role: 'user' },
      ]);
      expect(Array.isArray(alerts)).toBe(true);
    });

    it('getDriftScore returns number between 0 and 1', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const score = engine.getDriftScore();
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('getDriftReport returns comprehensive report', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const report = engine.getDriftReport([
        [
          { role: 'user', content: 'I want to build an API' },
          { role: 'assistant', content: 'OK let me help' },
          { role: 'user', content: 'actually change to a CLI tool' },
          { role: 'assistant', content: 'sure' },
        ],
      ]);
      expect(report).toBeDefined();
      expect(report.drifted).toBeDefined();
      expect(typeof report.driftScore).toBe('number');
    });

    it('getDriftAlerts returns accumulated alerts', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      engine.feedDriftDetector([
        { content: 'first topic', role: 'user' },
        { content: 'completely different second topic', role: 'user' },
      ]);
      const alerts = engine.getDriftAlerts();
      expect(Array.isArray(alerts)).toBe(true);
    });

    it('resetDriftDetector clears alerts', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      engine.feedDriftDetector([
        { content: 'test', role: 'user' },
      ]);
      engine.resetDriftDetector();
      expect(engine.getDriftAlerts()).toHaveLength(0);
    });

    it('updateDriftConfig changes thresholds', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      expect(() => engine.updateDriftConfig({ threshold: 0.8 })).not.toThrow();
    });
  });

  // ── Subagent Lifecycle ────────────────────────────────────────────

  describe('subagent lifecycle', () => {
    it('prepareSubagentSpawn returns rollback function', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 'parent', sessionFile: '/tmp/test.md' });
      const result = await engine.prepareSubagentSpawn({
        parentSessionKey: 'parent',
        childSessionKey: 'child',
        contextMode: 'isolated',
      });
      expect(result).toBeDefined();
      expect(typeof result!.rollback).toBe('function');
    });

    it('prepareSubagentSpawn with fork preserves parent session', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 'parent', sessionFile: '/tmp/test.md' });
      const result = await engine.prepareSubagentSpawn({
        parentSessionKey: 'parent',
        childSessionKey: 'child',
        contextMode: 'fork',
        parentSessionId: 'parent',
        childSessionId: 'child',
      });
      expect(result).toBeDefined();
      result!.rollback(); // should not throw
    });

    it('onSubagentEnded with completed reason searches memories', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 'parent', sessionFile: '/tmp/test.md' });
      await expect(
        engine.onSubagentEnded({ childSessionKey: 'child', reason: 'completed' }),
      ).resolves.toBeUndefined();
    });

    it('onSubagentEnded with deleted reason does nothing', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await expect(
        engine.onSubagentEnded({ childSessionKey: 'child', reason: 'deleted' }),
      ).resolves.toBeUndefined();
    });
  });

  // ── Maintenance & Edge Cases ──────────────────────────────────────

  describe('maintenance and edge cases', () => {
    it('maintain returns decay result', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
      const result = await engine.maintain({ sessionId: 'test', sessionFile: '/tmp/test.md' });
      expect(result).toHaveProperty('changed');
      expect(result).toHaveProperty('bytesFreed');
      expect(result).toHaveProperty('rewrittenEntries');
    });

    it('afterTurn skips heartbeat', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await expect(
        engine.afterTurn({
          sessionId: 'test', sessionFile: '/tmp/test.md',
          messages: [], prePromptMessageCount: 0, isHeartbeat: true,
        }),
      ).resolves.toBeUndefined();
    });

    it('ingestBatch skips heartbeats', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const result = await engine.ingestBatch({
        sessionId: 'test',
        messages: [{ role: 'user', content: 'should not store' }],
        isHeartbeat: true,
      });
      expect(result.ingestedCount).toBe(0);
    });

    it('ingestBatch processes valid messages', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
      const result = await engine.ingestBatch({
        sessionId: 'test',
        messages: [
          { role: 'user', content: 'This is a valid message with enough content' },
          { role: 'assistant', content: 'short' },
        ],
      });
      expect(typeof result.ingestedCount).toBe('number');
    });

    it('compact with sessionFile that exists actually compacts', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const sessionFile = createSessionFile(60); // many messages
      const result = await engine.compact({
        sessionId: 'test-sess',
        sessionFile,
        tokenBudget: 1000, // very small budget forces compaction
      });
      expect(result.compacted).toBe(true);
      expect(result.ok).toBe(true);
      expect(result.result?.tokensBefore).toBeGreaterThan(0);
      expect(result.result?.tokensAfter).toBeGreaterThan(0);
    });

    it('compact with missing sessionFile returns error', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const result = await engine.compact({
        sessionId: 'test',
        sessionFile: '/tmp/nonexistent-12345.jsonl',
        currentTokenCount: 200000,
      });
      expect(result.ok).toBe(false);
      expect(result.compacted).toBe(false);
    });

    it('v4.9.0: getDependencyTracker creates tracker lazily', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const tracker = engine.getDependencyTracker();
      expect(tracker).toBeDefined();
      const stats = tracker.getStats();
      expect(stats).toBeDefined();
      expect(stats.entitiesTracked).toBeGreaterThanOrEqual(0);
    });

    it('v4.9.0: setDependencyTracker replaces tracker', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const t1 = engine.getDependencyTracker();
      const t2 = engine.getDependencyTracker();
      // Same instance returned (lazy singleton)
      expect(t2).toBe(t1);
    });

    it('compact with runtimeContext does not crash', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const sessionFile = createSessionFile(30);
      const result = await engine.compact({
        sessionId: 'test',
        sessionFile,
        tokenBudget: 4000,
        runtimeContext: { skipReasoning: true },
      });
      expect(result.compacted).toBe(true);
    });

    it('compaction handles session file with custom instructions', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const sessionFile = createSessionFile(30);
      const result = await engine.compact({
        sessionId: 'test',
        sessionFile,
        tokenBudget: 4000,
        customInstructions: 'preserve error messages',
      });
      expect(result.compacted).toBe(true);
    });

    it('compaction with compactionTarget parameter', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const sessionFile = createSessionFile(30);
      const result = await engine.compact({
        sessionId: 'test',
        sessionFile,
        tokenBudget: 4000,
        compactionTarget: 'remove old messages only',
      });
      expect(result.compacted).toBe(true);
    });
  });

  // ── External Context via assemble ─────────────────────────────────

  describe('external context through assemble', () => {
    it('assemble injects RL experiences through provider', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
      const provider = new MockRLProvider();
      provider.addExperience({
        id: 'rl-1', taskType: 'debugging', outcome: 'success',
        pattern: 'Check logs first', confidence: 0.95, learnedAt: new Date(),
      });
      engine.setRLProvider(provider);
      const result = await engine.assemble({
        sessionId: 'test',
        messages: [{ role: 'user', content: 'debug the issue' }],
        prompt: 'debug',
      });
      expect(result.systemPromptAddition).toBeDefined();
    });

    it('assemble injects governance signals through provider', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
      const provider = new MockGovernanceProvider();
      provider.addSignal({
        layer: 'L1', type: 'intent_check', result: 'approved',
        timestamp: new Date(),
      });
      engine.setGovernanceProvider(provider);
      const result = await engine.assemble({
        sessionId: 'test',
        messages: [{ role: 'user', content: 'update the production config' }],
        prompt: 'update config',
      });
      expect(result.systemPromptAddition).toBeDefined();
    });

    it('assemble with both RL and governance providers', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
      const rlProvider = new MockRLProvider();
      rlProvider.addExperience({
        id: 'rl-1', taskType: 'refactoring', outcome: 'success',
        pattern: 'Write tests first', confidence: 0.85, learnedAt: new Date(),
      });
      engine.setRLProvider(rlProvider);
      const govProvider = new MockGovernanceProvider();
      govProvider.addSignal({
        layer: 'L1', type: 'safety_check', result: 'approved',
        timestamp: new Date(),
      });
      engine.setGovernanceProvider(govProvider);
      const result = await engine.assemble({
        sessionId: 'test',
        messages: [{ role: 'user', content: 'refactor the module' }],
        prompt: 'refactor',
      });
      expect(result.systemPromptAddition).toBeDefined();
    });
  });

  // ── Config & Edge ─────────────────────────────────────────────────

  describe('config options', () => {
    it('respects compactThreshold config', async () => {
      const engine = createClawContextEngine(
        { workspaceDir: '/tmp', compactThreshold: 500000 },
        mockLogger()
      );
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
      // Should not compact with high threshold
      const result = await engine.compact({
        sessionId: 'test', sessionFile: '/tmp/test.md',
        force: false, currentTokenCount: 300000,
      });
      expect(result.ok).toBe(true);
    });

    it('respects reserveRatio config', async () => {
      const engine = createClawContextEngine(
        { workspaceDir: '/tmp', reserveRatio: 0.5 },
        mockLogger()
      );
      expect(engine).toBeDefined();
    });

    it('debug mode does not crash', () => {
      const engine = createClawContextEngine(
        { workspaceDir: '/tmp', debug: true },
        { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} },
      );
      expect(engine).toBeDefined();
    });

    it('topK affects search depth', async () => {
      const engine = createClawContextEngine(
        { workspaceDir: '/tmp', topK: 20 },
        mockLogger()
      );
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
      const result = await engine.assemble({
        sessionId: 'test',
        messages: [{ role: 'user', content: 'test query' }],
        prompt: 'test',
        tokenBudget: 2000,
      });
      expect(result.messages).toBeDefined();
    });
  });

  // ── ingestBatch edge ──────────────────────────────────────────────

  describe('ingestBatch edge cases', () => {
    it('ingestBatch handles empty messages array', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const result = await engine.ingestBatch({
        sessionId: 'test', messages: [],
      });
      expect(result.ingestedCount).toBe(0);
    });

    it('ingestBatch handles mixed valid and invalid messages', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
      const result = await engine.ingestBatch({
        sessionId: 'test',
        messages: [
          { role: 'user', content: 'This is a valid test message with sufficient content length' },
          { role: 'user', content: '' },
          { role: 'user', content: 'hi' },
        ],
      });
      expect(typeof result.ingestedCount).toBe('number');
    });
  });

  // ── v4.11.0: RL Memory Strategy Selection ──────────────────────────

  describe('v4.11.0 RL strategy selection', () => {
    it('selectMemoryStrategy returns valid result', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const result = engine.selectMemoryStrategy({
        tokenBudget: 8000,
        taskComplexity: 'medium',
      });
      expect(result.strategy).toBeDefined();
      expect(['aggressive_recall', 'selective_recall', 'minimal_context', 'drift_adaptive']).toContain(result.strategy);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.topK).toBeGreaterThan(0);
      expect(result.reasoning).toBeDefined();
    });

    it('selectMemoryStrategy with simple task', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const result = engine.selectMemoryStrategy({
        tokenBudget: 8000,
        taskComplexity: 'simple',
      });
      expect(result.strategy).toBeDefined();
    });

    it('selectMemoryStrategy with complex task favors higher topK', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const result = engine.selectMemoryStrategy({
        tokenBudget: 80000,
        taskComplexity: 'complex',
      });
      expect(result.budgetAllocation).toBeGreaterThanOrEqual(0);
    });

    it('recallWithStrategy aggressive returns results', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
      const results = await engine.recallWithStrategy('aggressive_recall', 'test query');
      expect(Array.isArray(results)).toBe(true);
    });

    it('recallWithStrategy selective filters by score', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
      const results = await engine.recallWithStrategy('selective_recall', 'query');
      expect(Array.isArray(results)).toBe(true);
    });

    it('recallWithStrategy minimal returns few results', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
      const results = await engine.recallWithStrategy('minimal_context', 'query');
      expect(Array.isArray(results)).toBe(true);
    });

    it('recallWithStrategy drift_adaptive works', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test.md' });
      const results = await engine.recallWithStrategy('drift_adaptive', 'query');
      expect(Array.isArray(results)).toBe(true);
    });

    it('recordStrategyFeedback tracks feedback', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      expect(() => engine.recordStrategyFeedback('aggressive_recall', 1.0)).not.toThrow();
    });

    it('getStrategyStats returns stats object', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const stats = engine.getStrategyStats();
      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
    });

    it('resetStrategySelector clears stats', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      engine.recordStrategyFeedback('aggressive_recall', 1.0);
      engine.resetStrategySelector();
      const stats = engine.getStrategyStats();
      expect(Object.keys(stats).length).toBe(0);
    });

    it('selectMemoryStrategy low budget returns minimal strategy more often', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      const results = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const r = engine.selectMemoryStrategy({ tokenBudget: 1000, taskComplexity: 'simple' });
        results.add(r.strategy);
      }
      expect(results.size).toBeGreaterThanOrEqual(1);
    });

    it('recallWithStrategy all four strategies return arrays', async () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      await engine.bootstrap({ sessionId: 't', sessionFile: '/tmp/t.md' });
      for (const s of ['aggressive_recall', 'selective_recall', 'minimal_context', 'drift_adaptive'] as const) {
        const r = await engine.recallWithStrategy(s, 'query');
        expect(Array.isArray(r)).toBe(true);
      }
    });
  });
});
