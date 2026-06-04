# Changelog

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
