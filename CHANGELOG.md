# Changelog

## v4.5.0 (2026-06-05)

### Added — 智能预算分配 (C1-P1)
- **`calculateSmartBudget(totalBudget, taskType)`**: 基于漂移状态和任务类型的动态预算分配
  - 高漂移 (drift ≥ 0.7) → buffer 扩大 15%，base 减少 → 为 compaction 预留空间
  - 稳定上下文 (drift < 0.3) → base 扩大 5%，buffer 减少 → 更多有用信息
  - 任务类型感知: coding (0.9x base), debug (0.8x base), review (0.7x base), planning (1.1x base)
- `ClawContextEngine` 新增 API: `calculateSmartBudget()`, `feedDriftDetector()`, `getDriftReport()`, `getDriftAlerts()`, `resetDriftDetector()`, `updateDriftConfig()`

### Changed
- `assemble()` 高漂移时 system prompt 自动注入漂移警告和建议操作

## v4.4.0 (2026-06-05)

### Added — 上下文漂移检测 (C5-P0)
- **`DriftDetector`**: 基于余弦相似度的主题漂移检测
  - `feedTurn(messages)`: 逐轮喂入，计算相邻轮相似度，返回 DriftAlert[]
  - `detectDrift(history: Message[])`: 平台消息数组批量分析（自动分组为 turns）
  - `detectDrift(history: Turn[][])`: 预分组 turns 分析，返回 DriftReport
  - `getDriftScore()`: 滑动窗口平均漂移分数 (0.0–1.0)
  - `suggestActions()`: 建议操作 compact/suggest_new_session/summarize/refresh_memory
  - `getAlerts()` / `reset()` / `updateConfig()` / `getDriftScores()`
  - 三级警报: low(0.3)/medium(0.5)/high(0.7)
  - `minMessages`: 最少消息数才开始检测（默认 5）
- **`TopicModel`**:
  - `extractTopics(messages)`: TF 加权关键词提取，去停用词，技术词 1.5x 加权
  - `computeSimilarity(t1, t2)`: 单 Topic 或 Topic[] 对比，余弦相似度
  - `getEmbedding(topics)`: 返回关键词权重向量
- `ClawContextEngine` 集成: `assemble()` 自动喂入消息进行漂移检测

## v4.3.0 (2026-06-05)

### Added — Token 精确计数 (C1-P0)
- **`TiktokenCounter`**: 基于 js-tiktoken 的精确 token 计数器
  - `encode(text)` / `encodeBatch(texts)` / `decode(tokens)` / `getTokenCount(text)`
  - `getStats(messages)` / `estimateTokenBudget(totalBudget, messages)`
  - 支持 cl100k_base, p50k_base, r50k_base 编码及模型名称自动解析
  - `setModel()` 运行时切换编码
- **`FallbackCounter`**: CJK 字符感知备选估算
  - CJK 字符 1.5 token/char，非 CJK 0.25 token/char，10% 开销因子
  - `estimate()` / `isAccurate()` / `accuracy()`
- **`createTokenCounter(model)`**: 智能工厂，自动选择 tiktoken 或 fallback
- `engine.ts` 中原 `char/3.5` 估算替换为 tiktoken 精确计数
- `getTokenCounter()` / `countTokens()` 公开 API

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
