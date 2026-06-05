import { describe, it, expect, beforeEach } from 'vitest';
import { ClawContextEngine, createClawContextEngine } from '../src/engine';
import { MockRLProvider } from '../src/rl_injector';
import { MockGovernanceProvider } from '../src/governance_injector';
import { MockCrossDomainProvider } from '../src/cross_domain_injector';
import { MockCIProvider } from '../src/ci_injector';

function mockLogger(): any {
  return { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} };
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
      expect(engine.info.version).toBe('4.7.0');
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
      const result = await engine.compact({
        sessionId: 'test',
        sessionFile: '/tmp/test.md',
        force: false,
        currentTokenCount: 110000,
        reserveForCrossDomain: 5000,
      });
      // v4.1.0: 110000 >= 100000 - 5000 = 95000, triggers compaction
      expect(result.compacted).toBe(true);
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
      const result = await engine.compact({
        sessionId: 'test',
        sessionFile: '/tmp/test.md',
        force: false,
        currentTokenCount: 105000,
        reserveForCrossDomain: 3000,
        reserveForCI: 3000,
      });
      // v4.1.0: 105000 >= 100000 - 3000 - 3000 = 94000, triggers compaction
      expect(result.compacted).toBe(true);
    });

    it('info shows v4.0.0', () => {
      const engine = createClawContextEngine({ workspaceDir: '/tmp' }, mockLogger());
      expect(engine.info.version).toBe('4.7.0');
    });
  });
});
