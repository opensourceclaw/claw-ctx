# Changelog

## v4.9.0 (2026-06-05)

### Added
- **LongTermDependencyTracker**: Cross-session entity dependency tracking
  - `track(entity1, entity2, sessionId)` — Record entity co-occurrence
  - `getRelated(entity)` — Query related entities and context
  - `getDependencyChain(sessionId)` — Get session dependency chain
  - `exportGraph()` — Export complete entity graph (nodes + edges)
  - `trackCausal(cause, effect, sessionId)` — Causal relationship tracking
  - `trackDecision(description, sessionId, entities)` — Decision chain tracking
  - `queryCausality(event)` — Query causal relationships
  - `getCrossSessionRelations(entity)` — Cross-session relation query
  - `ingestFromSessionState(state)` — Integration with SessionStateExtractor
- 16 unit tests covering core functionality

## v4.8.0 (2026-06-05)

### Added
- **Performance benchmark tests**: `tests/performance/benchmark.test.ts` — 16 benchmarks
  - Token counting: short text <50ms, long text <200ms, batch 100 items <500ms
  - driftdetection: 3 turn <50ms, batch 10 turn <100ms
  - budget allocation: <20ms
  - state extraction: 50 messages <100ms

### Fixed
- **Coverage report fix**: configuration `@vitest/coverage-v8` provider
  - reporter: text/json/html/lcov
  - Thresholds: lines 80%, functions 80%, branches 70%, statements 80%
  - DevClaw coveringrate correctly displayed >= 80%
- `engine.test.ts` VersionassertionsUpdatedfor v4.7.0

## v4.5.0 (2026-06-05)

### Added — smart budget allocation (C1-P1)
- **`calculateSmartBudget(totalBudget, taskType)`**: drift-state-aware dynamic budget allocation based on task type
  - high drift (drift ≥ 0.7) → buffer expands 15%, base reduces → reserved for compaction
  - stable context (drift < 0.3) → base expand 5%，buffer reduce → more useful information
  - task-type aware: coding (0.9x base), debug (0.8x base), review (0.7x base), planning (1.1x base)
- `ClawContextEngine` Added API: `calculateSmartBudget()`, `feedDriftDetector()`, `getDriftReport()`, `getDriftAlerts()`, `resetDriftDetector()`, `updateDriftConfig()`

### Changed
- `assemble()` when high drift, system prompt automatically injects drift alerts and suggested actions

## v4.4.0 (2026-06-05)

### Added — context driftdetection (C5-P0)
- **`DriftDetector`**: primary topic drift detection based on cosine similarity
  - `feedTurn(messages)`: turn-by-turn feeding，compute adjacent-turn similarity，return DriftAlert[]
  - `detectDrift(history: Message[])`: flat platform message array batch analysis (auto-grouped into turns)
  - `detectDrift(history: Turn[][])`: pre-grouped turns analysis，return DriftReport
  - `getDriftScore()`: sliding window average drift score (0.0–1.0)
  - `suggestActions()`: suggested actions compact/suggest_new_session/summarize/refresh_memory
  - `getAlerts()` / `reset()` / `updateConfig()` / `getDriftScores()`
  - three-level alerts: low(0.3)/medium(0.5)/high(0.7)
  - `minMessages`: minimum message count to startdetection（default 5）
- **`TopicModel`**:
  - `extractTopics(messages)`: TF-weighted keyword extraction with stop-word removal; technical terms weighted 1.5x
  - `computeSimilarity(t1, t2)`: single Topic or Topic[] contrast，cosine similarity
  - `getEmbedding(topics)`: returns keyword weight direction vector
- `ClawContextEngine` integration: `assemble()` automaticfeed messages for driftdetection

## v4.3.0 (2026-06-05)

### Added — Token precise counting (C1-P0)
- **`TiktokenCounter`**: based on js-tiktoken precise token countingdetector
  - `encode(text)` / `encodeBatch(texts)` / `decode(tokens)` / `getTokenCount(text)`
  - `getStats(messages)` / `estimateTokenBudget(totalBudget, messages)`
  - Support cl100k_base, p50k_base, r50k_base encoding and model nameautomaticparse
  - `setModel()` runtime encoding switch
- **`FallbackCounter`**: CJK character-aware fallback estimation algorithm
  - CJK character 1.5 token/char，non- CJK 0.25 token/char，10% overhead factor
  - `estimate()` / `isAccurate()` / `accuracy()`
- **`createTokenCounter(model)`**: smart factory，automaticselect tiktoken or fallback
- `engine.ts` original `char/3.5` estimation replaced with tiktoken precise counting
- `getTokenCounter()` / `countTokens()` public API

## v4.2.2 (2026-06-05)

### Fixed
- Correct import path to claw-mem (../../claw-mem/dist/memory_manager)

## v4.2.1 (2026-06-05)

### Fixed
- Correct import path to claw-mem for proper TypeScript compilation

## v4.1.0 (2026-06-03)

### Added — Session Continuity
- **`_loadPreviousSessionContext()`**: On bootstrap, searches claw-mem for previous
  session summaries and injects them as `[Previous Session Context]`.
- **`_storeSessionSummary()`**: After each turn, extracts keywords and last action
  into a compact session summary, persisted to claw-mem episodic storage.
- Key features:
  - Survives OpenClaw restart, computer sleep, and shutdown
  - New sessions automatically recall what was being worked on
  - Keyword extraction for topic-aware summary
  - Tagged as `session_summary` and `continuity` for targeted retrieval

### Changed
- `bootstrap()` now returns `importedMessages > 0` when previous context is found
- `afterTurn()` now stores session summaries (>=3 messages)

## v4.0.0 (2026-06-02)

### Added
- **CI/CD Signal Injection**: Inject pipeline status into context assembly
  - `CIInjector` with pluggable `CIProvider` interface
  - `MockCIProvider` for testing
  - Support for build, test, deploy, and error signal types
  - Failures sorted first with implicit fix guidance
  - CI URL linking for deep integration
- **Token Budget v4**: 60/10/10/20 allocation (base/cross-domain/CI/buffer)
  - `ciPct` and `maxCI` constraints
  - `reserveForCI()` method for compact() integration
  - `canFit()` and `remaining()` support "ci" budget type
- New public API: `setCIProvider()`
- New exports: `CIInjector`, `MockCIProvider`, `CISignal`, `CIProvider`

### Changed
- `assemble()` accepts new optional `ci` parameter
- `assemble()` returns optional `ciReport`
- `compact()` accepts new optional `reserveForCI` parameter
- Budget defaults: 70/15/15 → 60/10/10/20 to accommodate CI signals

## v3.0.0 (2026-06-02)

### Added
- **Cross-Domain Signal Injection**: Inject neoclaw multi-Pillar signals into context
  - `CrossDomainInjector` with pluggable `CrossDomainProvider` interface
  - `MockCrossDomainProvider` for testing
  - Time-range filtering, same-pillar exclusion, correlation sorting
  - Formatted context blocks with pillar, agent, and time-ago indicators
- **Token Budget Manager**: Structured budget allocation with cross-domain reservation
  - 70/15/15 default split (base/cross-domain/buffer)
  - `maxCrossDomain` enforcement, `minBaseContext` guarantee
  - Runtime config updates, `canFit()` and `remaining()` checks
  - Budget-aware compact() with `reserveForCrossDomain` parameter
- New public API methods: `setCrossDomainProvider()`, `getBudgetManager()`
- New exports: `CrossDomainInjector`, `TokenBudgetManager`, `MockCrossDomainProvider`, all types

### Changed
- `assemble()` accepts new optional `crossDomain` parameter with `enabled`/`currentPillar`/`currentIntent` fields
- `assemble()` returns optional `crossDomainReport` with signal injection stats
- `compact()` accepts new optional `reserveForCrossDomain` parameter

## v2.0.0 (2026-06-02)

### Added
- **C2 Confidence Gate**: Strict/adaptive/disabled modes for context item filtering
  - `ConfidenceGate` class with dynamic threshold adjustment
  - Confidence reports included in `assemble()` response
  - Runtime threshold and mode switching
- **RL Experience Injection**: Inject claw-rl learning results into context
  - `RLInjector` with pluggable `RLProvider` interface
  - `MockRLProvider` for testing
  - Formatted context blocks with success/failure indicators
- **Governance Signal Pass-through**: Inject neoclaw L1-L6 governance signals
  - `GovernanceInjector` with pluggable `GovernanceProvider` interface
  - `MockGovernanceProvider` for testing
  - Layer-grouped context blocks with approved/rejected/warning indicators
- New public API methods: `injectRLExperience()`, `injectGovernanceSignals()`
- New public API: `setRLProvider()`, `setGovernanceProvider()`, `getConfidenceGate()`
- New exports: `ConfidenceGate`, `RLInjector`, `GovernanceInjector`, mock providers, all types

### Changed
- `assemble()` accepts new optional params: `confidenceThreshold`, `confidenceMode`
- `assemble()` returns optional `confidenceReport` field
- Memory filtering moved from hardcoded 0.3 threshold to pluggable confidence gate
- External context (RL, governance) injected even when no memories found

## v1.0.0 (2026-06-02)

### Added
- Initial release: standalone Context Engine plugin
- Bisection-based token budget control
- CJK-aware token estimation
- Search cache (30s TTL)
- Subagent lifecycle support (fork/isolate modes)
- Integration with claw-mem MemoryManager
