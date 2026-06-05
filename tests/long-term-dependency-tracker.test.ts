import { describe, it, expect, beforeEach } from 'vitest';
import { LongTermDependencyTracker } from '../src/long-term-dependency-tracker';

describe('LongTermDependencyTracker', () => {
  let tracker: LongTermDependencyTracker;

  beforeEach(() => {
    tracker = new LongTermDependencyTracker();
  });

  it('tracks entity co-occurrence', () => {
    tracker.track('entityA', 'entityB', 'session-1', 'context text');
    const related = tracker.getRelated('entityA');
    expect(related.length).toBeGreaterThanOrEqual(2);
    expect(related.some((r) => r.entity === 'entityA')).toBe(true);
    expect(related.some((r) => r.entity === 'entityB')).toBe(true);
  });

  it('returns empty for unknown entity', () => {
    const related = tracker.getRelated('nonexistent');
    expect(related).toEqual([]);
  });

  it('exports graph with nodes and edges', () => {
    tracker.track('A', 'B', 's1');
    tracker.track('B', 'C', 's1');
    tracker.track('A', 'C', 's2');

    const graph = tracker.exportGraph();
    expect(graph.nodes.length).toBeGreaterThanOrEqual(3);
    expect(graph.edges.length).toBeGreaterThanOrEqual(2);

    const abEdge = graph.edges.find((e) =>
      (e.source === 'A' && e.target === 'B') || (e.source === 'B' && e.target === 'A')
    );
    expect(abEdge).toBeDefined();
    expect(abEdge!.weight).toBe(1);
  });

  it('tracks causal relationships', () => {
    tracker.trackCausal('bug', 'fix', 's1', 'Fixed the null pointer');
    const causality = tracker.queryCausality('bug');
    expect(causality.length).toBe(1);
    expect(causality[0].cause).toBe('bug');
    expect(causality[0].effect).toBe('fix');
  });

  it('queryCausality returns empty for untracked event', () => {
    const causality = tracker.queryCausality('unknown');
    expect(causality).toEqual([]);
  });

  it('builds dependency chain for session', () => {
    tracker.track('A', 'B', 's1');
    tracker.track('B', 'C', 's1');
    tracker.track('C', 'D', 's1');

    const chain = tracker.getDependencyChain('s1');
    expect(chain.chain.length).toBeGreaterThanOrEqual(3);
    expect(chain.strength).toBeGreaterThan(0);
  });

  it('returns empty chain for unknown session', () => {
    const chain = tracker.getDependencyChain('nonexistent');
    expect(chain.chain).toEqual([]);
    expect(chain.strength).toBe(0);
  });

  it('tracks decision with entity linking', () => {
    tracker.trackDecision('Decided to use TypeScript', 's1', ['TypeScript', 'JavaScript', 'build']);
    const related = tracker.getRelated('TypeScript');
    expect(related.length).toBeGreaterThanOrEqual(2);

    const chain = tracker.getDependencyChain('s1');
    expect(chain.strength).toBeGreaterThanOrEqual(0.8);
  });

  it('detects cross-session entity relations', () => {
    tracker.track('crossEntity', 'helper1', 's1');
    tracker.track('crossEntity', 'helper2', 's2');
    tracker.track('crossEntity', 'helper3', 's3');

    const cross = tracker.getCrossSessionRelations('crossEntity');
    expect(cross.length).toBeGreaterThan(0);
  });

  it('returns empty for single-session entity in crossSession', () => {
    tracker.track('singleSession', 'helper', 's1');
    const cross = tracker.getCrossSessionRelations('singleSession');
    expect(cross).toEqual([]);
  });

  it('ingests entities from SessionState', () => {
    tracker.ingestFromSessionState({
      sessionId: 's1',
      entities: [
        { name: 'claw-ctx', type: 'project' },
        { name: 'openclaw', type: 'project' },
        { name: 'TypeScript', type: 'tool' },
      ],
    });

    const graph = tracker.exportGraph();
    expect(graph.nodes.length).toBeGreaterThanOrEqual(3);
    expect(graph.edges.length).toBeGreaterThanOrEqual(2);
  });

  it('getStats returns correct counts', () => {
    tracker.track('e1', 'e2', 's1');
    tracker.track('e2', 'e3', 's1');
    tracker.trackCausal('cause1', 'effect1', 's2');

    const stats = tracker.getStats();
    expect(stats.entitiesTracked).toBeGreaterThanOrEqual(3);
    expect(stats.coOccurrencePairs).toBeGreaterThanOrEqual(2);
    expect(stats.causalLinks).toBe(1);
    expect(stats.sessions).toBeGreaterThanOrEqual(2);
  });

  it('reset clears all data', () => {
    tracker.track('e1', 'e2', 's1');
    tracker.trackCausal('c', 'e', 's1');
    tracker.reset();

    const related = tracker.getRelated('e1');
    expect(related).toEqual([]);

    const causality = tracker.queryCausality('c');
    expect(causality).toEqual([]);

    const stats = tracker.getStats();
    expect(stats.entitiesTracked).toBe(0);
  });

  it('handles concurrent sessions correctly', () => {
    tracker.track('shared', 'a_only', 'a');
    tracker.track('shared', 'b_only', 'b');

    const chainA = tracker.getDependencyChain('a');
    const chainB = tracker.getDependencyChain('b');

    expect(chainA.chain).toContain('shared');
    expect(chainB.chain).toContain('shared');
  });

  it('causal tracking also creates co-occurrence', () => {
    tracker.trackCausal('nightly_build', 'deploy', 's1');
    const related = tracker.getRelated('nightly_build');
    expect(related.some((r) => r.entity === 'deploy')).toBe(true);
  });

  it('maxMentions pruning does not throw', () => {
    // Create many entity mentions to trigger pruning
    for (let i = 0; i < 2000; i++) {
      tracker.track(`entity_${i}`, `entity_${i + 1}`, `session_${i % 10}`);
    }
    // Should not throw
    const stats = tracker.getStats();
    expect(stats.entitiesTracked).toBeGreaterThan(0);
  });
});
