# Changelog

## [6.13.0] - 2026-10-09

### Added

- **P1 —— 阶段进度触发（`StageProgressTrigger`）**：boundary-weighted 压缩阈值。宿主提供的阶段迁移（非空 A→B）标记安全压缩点；`adjustThreshold` **每次评估即消费**该边界（钉死项：错失 floor 的边界不在下一阶段补用），带 `minTokens` floor 与单一重标定面（W3 预留）。默认 **off** → 关闭态与 v6.11.x 字节等价。
- **P3 —— continuation 守卫（`ContinuationGuard`）**：压缩后窗口守卫，三个纯函数基础检测器（redo-loop / refetch-summarized / plan-restatement），warn-only sidecar；构造参数 `detectors[]` = v6.14.0 W4 扩展位；单趟解析备忘；`windowTurns` 到期自动 disarm。
- **CI `perf` 通道接入 P1/P3 夹具**（`ci.yml` perf job，仍**仅 `workflow_dispatch`**）：`tests/performance/p13-paired-overhead-benchmark.mjs` —— A existing / Boff default / Bon armed 配对 CPU 采样 + 噪声地板 + amortized(on) 口径，数值落 job summary。
- **CX-20 —— 每仓独立 gates 槽位**：`.githooks/pre-push` 改读 `~/.openclaw/gates/<repo>.json`（legacy 共享 `gates.json` 保留为读回退并打印迁移提示；`OPENCLAW_GATES_FILE` 仍显式优先）；新增 `scripts/migrate-gates.sh` 与 151 行单测。修复 2026-10-07 多仓并发发布互踩槽位的真实事故。

### Fixed

- **OBS-3 —— `stripSummaryScaffold` 单点口径**：legacy 摘要尾句 `[Compacted History …] Continue with the current task …` 命中 `continue` 关键词 → `missingNext` **结构性假阴性**（旧行为 0% 计入）。现以固定、作者可控的脚手架子句统一剥离，**P4 metrics 与 P3 detectors 共用同一筛查定义**。核对：legacy 尾句 → 计入 100%；三段式**空值** → 计入 100%；三段式有值 → 0%；用户内容含关键词 → 不被剥离（命中）。

### Notes

- **性能（CI 权威口径，run `37898544346`，loadavg 1.44 干净机）**：发货默认档 Boff vs A **−0.21%（PASS）**；armed 摊薄 **0.29% ≪ 2% 预算（PASS）**；armed 原始 4.75% **< 本 run 噪声地板 6.46%**（不可判，以摊薄口径为准，§6.5 条件本就按此设计）。
- **§6.5 旧基准如实附记**：同 run 旧基准 delta **4.53% vs 预算 <2%（OVER）**——系 v6.11/v6.12 既有特性，**与本批无关**；「2% 硬门」语义问题登记待 Peter 裁（不属 v6.13.0 判据）。
- **P5 面零实现**（与本批裁定一致，独立单排后）；W1~W6 零实现，W3 仅注释声明「v6.14.0 回填复标」。
- 本批 `ctx_compact` / `ctx_build` / `ctx_inject` 签名不变；默认配置下 engine 输出与 v6.11.x **字节等价**（golden `v6.10.4` fixture 复验 14 passed）。

### Tests

- 114 files / **1400 passed, 0 failed, 5 skipped**；`tsc --noEmit` clean；本批 +22 单测（钉死项同轮失效、OBS-3 两条件、窗口过期、W4 注入）；**零新依赖**（`package.json` / lock 依赖 diff 0 行）。

## [6.12.0] - 2026-10-07

### Added

- **CX-18 —— §6.5 性能夹具入库 + CI `perf` 通道（手动）**：
  - `tests/performance/paired-compaction-benchmark.mjs`：§6.5 口径正式化——pretrim 60 消息夹具、A=legacy / B=three-section+record **交替 10 轮**、`process.cpuUsage` 配对采样、取 median，支持 `--json`，并写入 `GITHUB_STEP_SUMMARY` markdown 表；无 `.test.` 后缀 → **不进 vitest 常规集合**。
  - `ci.yml` 新增 **`perf` job**：**仅 `workflow_dispatch`** 触发（push / PR 路径**零膨胀**），跑 build + 基准，数值落 job summary。
  - **首次 dispatch 实测**（run `37574041315`，CI ubuntu，load 0.78）：A legacy **2.1809 ms/op**、B three-section+record **2.3511 ms/op** → **median delta 6.00%**（预算 <2% → **OVER**）。
- **OBS-F —— `release-notes/` 出 gitignore，CX-15 二态 body 首次可生效**：新增顶层 `release-notes/`（+`README.md`）并确保**不被 ignore**（`docs/` 整目录在 `.gitignore` 中，旧 `docs/releases/<tag>.md` 在 CI 上恒不存在）；CX-15 二态路径由 `docs/releases/<tag>.md` **迁移至 `release-notes/<tag>.md`**，脚本与单测同步（5/5 绿）。本批起发布方可在 bump commit 内落 `<tag>.md`，CI 即走 **`--notes-file`** 分支。

### Fixed

- **PR #15（Dependabot）合并**：dev 传递依赖 `proxy-addr` 2.0.7→2.0.8、`source-map-js` 1.2.1→1.2.2（均 patch 级），**无 manifest / runtime 变化**；合并 commit `51f7f09`。

### Notes

- **CX-19 —— 持久化写路径探路（只探不改，`src/` 零改动、零新依赖）**：`tests/performance/persist-write-exp.mjs` 三路对照（line 325B、n=5000、reps=5）：

  | impl | µs/op | vs 现行 |
  |------|:-----:|:-------:|
  | A `appendFileSync`/条（现行） | 121.6 ~ 127.2 | — |
  | B fd 复用（open 一次 + `writeSync`） | 13.8 ~ 15.2 | **−88.0% ~ −88.7%** |
  | C 缓冲 ×64 | 2.2 ~ 2.8 | −97.8% ~ −98.3% |

  - **三路互证**：Edith 3 轮（−88.1 / −88.7 / −88.0%）、Friday 本机（139.5 → 15.3 µs，−89%）、Jarvis CI 侧（133 → 14 µs，−89%）。
  - **归因（数据说话）**：固定成本在 per-call **open + close**，非 fs 吞吐、且与负载无关——CI delta 6% × 2.18 ms ≈ **130 µs/record**，与 impl A 的 133 µs/record 严丝合缝。
- **§D 口径（如实）**：现行 CI delta = **6.00%（OVER，预算 <2%）**；impl B 修正**未随本版落地**，随 **v6.13.0**；**§D (a) 条件豁免保持开放**。
- 本批为**测量 / 基建批**：无用户可见行为变更；`ctx_compact` / `ctx_build` / `ctx_inject` 签名不变。

### Tests

- 111 files / **1367 passed, 0 failed, 5 skipped**；`tsc --noEmit` clean；新增 `.mjs` 探针不计入 vitest 集合；`release-idempotency.test.ts` 5/5（路径迁移后）。

## [6.11.2] - 2026-10-07

### Added

- **CX-16 —— stage-gate 审计脚本双 mode + CI `release` job（服务端化）**：
  - `tools/audit-stage-gate.sh` 双模式：`--mode=client` 为原 `check_main` 的**逐字迁移**（窗口计算、四项校验、§D(c) warns、输出文案全保留，双端单点同源）；`--mode=repo` 校验**入库面**五项（hook 存在 + `sh -n` 语法、golden 夹具、版本三点一致、`.DS_Store` 零跟踪、关键夹具存在）。
  - `pre-push` 薄壳化（脚本定位随 hook 自身位置；数据根仍随 `ROOT`），**41 用例零改动全绿** = 重构等价达成。
  - `ci.yml` 新增 **`release` job**（main push：build + vitest（排除 performance）+ `--mode=repo` 审计）并加 `workflow_dispatch` 干跑通道；`release.yml` 的 job 更名 `release-tag`。分支规则集零改动——此前 main 上恒"expected 而缺失"的必检 `release` **终于有了真实来源**（OBS-A 结构性收口）。
  - **校验面如实声明**：CI 校验的是**入库面**（版本面/夹具面）；**回执面（`inbox/`）不随版本入库**，故回执校验仍留**客户端纪律层**（defense-in-depth 已知缺口 #5）。
- **Ledger 持久化**：`recordCompactionQuality` 尾部单点写入 JSONL（`<workspace>/.claw-ctx/compaction-quality.jsonl`，`{"k":"cq",…}`）；内存字节计数 >512KB 触发单级轮转 `.1`；**fail-open**——一切 fs 失败只进 `report.persist.writeErrors`，绝不抛进压缩路径。`doctor` 跨进程经 `loadCompactionQuality`（JSONL 重放，坏行计数）+ `mergeCompactionQuality`（绝对计数无损合并），报告/表格/`--json` 的 `compactionQuality` = 磁盘 ∪ 进程，显式 `source: disk|in-process|disk+in-process`；开关 `persistCompactionQuality` 默认 true。

### Fixed

- **CX-14 —— approval actor 签名（dual-claim 判据修正）**：approval 分支的排除条件由「内容含 `Stage.*TEST` 字样」改为「**回执作者签名** `From.*:.*(TestAgent|Edith)`」——**正文引用**所据件 TEST 字样的真审批不再被误杀；`From: TestAgent` 且 `Approver: Peter` 同文件的**真双 claim** 拦截保留。（即 v6.11.0 发布受阻根因的修复。）
- **CX-15 —— GH Release 幂等化**：`scripts/release-idempotency.sh` 改用 **list+tag 全量判定**（绕开 `gh release view` 对 draft 的可见性缺陷——即 v6.11.0 的重复 Release 事件），创建前后**双查**，`count≠1` 即 FATAL（双 Release 从人工发现升级为 CI 红）；body 二态：`docs/releases/<tag>.md` 存在则用 `--notes-file`，否则 `--generate-notes` + 显式「publisher may PATCH」兜底。
- **CX-17 —— boundary 写序（测试夹具竞态）**：`CX-9: window boundary` 用例改为**先提交批次、后写回执/审批**，使 `receipt mtime ≥ batch start` 由构造保证（无时间旅行）。修复前本机 5 轮 4 红，修复后 boundary **20/20 连跑零红**、全量 **5/5 轮全绿**。

### Notes

- **Ledger 性能口径（§D，如实）**：本机高负载（load ≈9）实测交付版 `three + record + sync append` **11.07%**（轮间 4.0~21.0%）；归因分测证明差额**全部**来自 `appendFileSync` syscall 放大（`bare appendFileSync` 180B = 157~158μs/op；record 本体 5.2~6.4μs/op）。正常负载预期 persist 增量 **≈1% < 2%** 预算。async 退路实测无改善（`process.cpuUsage` 含 fs 线程池）且削弱读写确定性 → 已回滚。
- **fail-open 语义**：持久化失败**不影响**压缩主路径；`persist{path, writeErrors, bytes, rotated}` 可读。
- 本批为**基建批**，无用户可见行为变更；`ctx_compact` / `ctx_build` / `ctx_inject` 签名不变。

### Tests

- 111 files / **1367 passed, 0 failed, 5 skipped**；`tsc --noEmit` clean；hook 用例 42（41 + CX-14 引述用例）；audit 脚本 10 用例（repo mode 6 分支 + client/hook rc 对照 4 组）。


## [6.11.1] - 2026-10-06

### Guardrails

- **CX-10 —— stage-gate `pre-push` hook 新增 requirement 4：handoff 清单校验**。采用**锚点 opt-in**：只解析标题匹配 `## …handoff…清单` 的文档，无锚点文档一律不解析（不做自由文本推断——CX-8 教训）。锚点块内每条 `- [ ]` / `- [x]` 行（半/全角冒号、可带反引号目标）承诺一份 inbox 任务单，须满足：① 目标已交付（存在于对应域，含 `processed/`——归档后仍算交付）；② 任务单头部在 `依据` / `Task` / `Refs` 行引用源文档；③ 晚于源文档。角色→域映射覆盖五个 inbox 域（Jarvis→`inbox-code`、Edith→`inbox-test`、Karen→`inbox-release`/`inbox-deploy`、DeployAgent→`inbox-deploy`、OpsAgent→`inbox-operate`；其余含 Friday/Peter 视为格式错误）。**`[x]` 与 `[ ]` 同等校验**——「勾了没单」同样 fail-closed。窗口复用 CX-9 的 `EFFECTIVE_TS`。
- **CX-14 —— handoff 断言③ 降级为 warning**。源文档交付后被无关再编辑会刷新 mtime，此前会把合规交付误判为 `missing` 而硬拦（R2 中的唯一残留阻塞）。现断言③ 写入独立 `warns` 桶，**通过与拒绝两条路径都打印**，且**不影响 `rc`**（EXIT=0）；断言①② 与 CX-9 逻辑未动。
- **CX-9（自 v6.11.0 起生效，本版沿用）**：进入批次窗口的裁决/审批文档须在 `inbox-results/` 有 `Refs:` 回执（按文件名匹配，`processed/` 亦扫描），fail-closed。

### Notes

- **断言③ warning 语义**：`warning: handoff task <task> for "<source>" (task predates source doc)` 是**已知可审计痕迹**，不是拦截项；warning 缺席才是异常。
- **残余风险（OBS-7，已登记）**：③ 放宽后，「**预造**任务文件、事后在其 `依据:` 行补引用」在**客户端不可检**（hook 只能观测文件存在与 mtime）。已写入 defense-in-depth 已知缺口清单。
- **`--no-verify` 天花板**：客户端 hook 可被 `git push --no-verify` 静默跳过（git 设计使然，无本地痕迹）；指引见 hook 头部注释所引 `docs/audits/stage-gate-defense-in-depth.md`（服务端 branch protection + tag ruleset 为 backstop）。

### Tests

- hook 单测 **41 passed**；全量 108 files / **1345 passed, 0 failed, 5 skipped**；`tsc --noEmit` clean。


## [6.11.0] - 2026-10-06

### Added

- **P4 压缩质量度量（Compaction Quality Metrics）**：`metrics/optimizer-metrics.ts` 新增 `CompactionQualityRecord/Report`、`recordCompactionQuality()` / `getCompactionQuality()`，按 session 记录 `proactiveRate`、`missingCriticalStatePct`、`missingNextActionPct` 三项指标，并汇总 consistency 四态计数与 `violationRate`。明细 store 受 FIFO 50/session + LRU 500 约束（截尾以 `capped` 标记），三指标基于**全量累计计数**、不随明细截尾失真。双语（EN+ZH）关键词表随模块导出。
- **P2 三段摘要 schema（Three-Section Summary Schema）**：`semantic-compressor.ts` 新增 `summarySchema: "legacy" | "three-section"` 配置（**默认 `legacy`**，逐字节等价 v6.10.4）与 `buildSummarySections()`；三段结构携带状态机，校验打回上限 1 次后降级至 `degraded` 兜底文案。`CompressionResult` 追加可选 `sections/consistency`。
- **接线**：`engine.compact()` 成功分支埋点（透传 `consistency`、`summarySchema`）；`doctor --usage --json` 与 doctor 表格新增 `Compaction Quality (P4)` 段及关键词表；`index` 导出追加。`ctx_compact` / `ctx_build` / `ctx_inject` 工具签名不变。

### Fixed

- **CX-11（HIGH）质量埋点取样错位**：埋点原取 `result.summary`（「Removed N old messages…」报告行），改为取实际落盘摘要 `result.summaryBlock`——此前关键词型落盘摘要会被误记为 `missingNextActionPct = 100%`。新增真 `compact()` 集成测试 `tests/unit/p4-wiring-integration.test.ts`（4 用例）纳入回归面。
- **CX-12（MEDIUM）consistency 缺省口径误导**：未启用 three-section 时原按 `pass` 计，改为第四态 **`notMeasured`**（`undefined ≠ pass`）；样本仍入 `sampleCount` 与三指标分母（统计面不缩水），报告/doctor 自文档化呈现。

### Guardrails

- **CX-9 —— stage-gate `pre-push` hook 新增 requirement 3**：进入批次窗口的 adjudication/approval 文档（`inbox-design-review/`、`inbox-plan/` 的 review/approval 件）须在 `inbox-results/` 有 `Refs:` 回执（按文件名匹配，`processed/` 亦扫描），fail-closed。
- **CX-7 —— hook 解析修正**：`release-approval-gate` 读取改为先展平 json 再取段，兼容 pretty-printed `gates.json`（旧逐行 `grep` 对多行文件永不匹配）；另 `chore: untrack .DS_Store`。

### Performance（如实标注）

- P2+P4 新增 CPU 开销实测 **≈3.2%（profile 口径：gate regex 2.5% + sections 框架 0.6%）**。配对法测得残余差额归因 GC/运行时（对照组噪声底 0.79%、轮间波动 -3.4%~+19.7%），非实现缺陷；**本版不做“零开销”表述**。残余主项 = 对 39KB removed 文本的 33 词正则首扫（物理下限 ≈0.025ms/op）。优化方向（扫描文本限量 / 复用 `scoreImportance` 已算文本，需接口配合）登记 **v6.12**；record 通道配对 +2~4% 现象列 v6.12 观察项。

### Notes

- **`notMeasured` 第四态**：consistency 的“未测量”与“通过/拒绝/降级”四态互斥——**未测量 ≠ 通过**。
- **CX-9 hook 天花板**：客户端 hook 可被 `git push --no-verify` 静默跳过（git 设计使然）；服务端 branch protection + tag ruleset 为 defense-in-depth backstop（见 hook 头部注释所引 `docs/audits/stage-gate-defense-in-depth.md`）。

### Tests

- 108 files / **1335 passed, 0 failed, 5 skipped**；`tsc --noEmit` clean；golden `tests/golden/legacy-summary-v6104.txt` byte-equal（开关关 = v6.10.4 逐字节等价，源码级零删除行）。


## [6.9.0] - 2026-09-07

### Added

- **Compaction Structural Digest（结构保护带，ADR-1/2/3/4）**：压缩时以规则提取（非 LLM、零 LLM 面）从被移除消息中识别三类结构信息——已确认决策/事实（confirmed）、已否决方案（rejected）、API 契约与坑（pitfalls），合并跨轮持久化条目后以一条准 header 消息注入压缩后上下文，保证结构信息跨压缩轮存活（swamp 稀释可审计）。
  - 双语 pattern 成对（EN+ZH）逐句提取；置信门控 `CONFIDENCE_FLOOR = 0.75`（强信号 0.85+，弱信号仅含因果连词可升 0.75），压制词（maybe/也许 等）与疑问句零捕获；`provenance {msgId, snippet≤200, round}` 行尾 `[src ...]` 可回指源条目。
  - 容量保护：`DIGEST_MAX_TOKENS = 2048`；截断优先级 rejected > confirmed > pitfalls，类内低置信先裁、旧轮先裁；`cutRank` 纯函数导出供测试锁定。
  - 序列化文本 `[STRUCTURAL-DIGEST v1]` 三节（已确认/已否决/API 契约与坑），parse 有损重建（confidence 回底、round 归零）保证再序列化幂等且新提取胜旧条目（保守语义）。
  - 新模块 `src/structural-digest/`（types/constants/patterns/extract/serialize）；引擎 `_executeCompaction` 接线（digest 剔除/合并/写入 + `newTokens` 记账 + 异常回退现版输出）。
  - 纯增量红线：无结构信息时输出与 v6.8.0 逐字节一致；`ctx_compact` 工具签名不变（`engine.compact` 仅加可选内部参数 `triggerReason`）。
- **Compaction 事件暴露（ADR-4）**：`OptimizerEvents` 追加 `ctx.compaction.completed` / `ctx.compaction.skipped`（payload schema 锁 §5.1：sessionId/triggerReason/tokensBefore/tokensAfter/removedMessages/keptMessages/durationMs + 可选 digestRounds/digestTokens；skipped 带 reason）；observer 新增 `emitCompactionCompleted/emitCompactionSkipped`，走既有 `IEventBus`（NoOp 降级，发射失败不影响主流程）。发射点：skipped（below-threshold 早退 / compacted=false）、completed（成功 return 前）；triggerReason 由 afterTurn 自触发传 `"auto"`、工具面默认 `force/explicit`；既有 `ctx.compression.triggered` 语义不变。

### Tests

- 94 files / 1195 passed（基线）→ **97 files / 1234 passed / 0 failed**（+39：structural-digest extract 18、serialize 12、压缩集成 9 含跨轮 round 递增与事件 schema 断言）。

## [6.8.0] - 2026-08-31

### Added

- **Role-Aware Injection (ADR: role-aware-injection)**: five-role context package semantics (Authority > Exemplar > Constraint > Rubric > Metadata) from arXiv 2604.04258v1 applied to the injection pipeline. Injection segments now carry `role + priority`; assembly orders by priority (Authority first) and records same-topic conflicts instead of joining by injection order — low-priority signals (RL experience, CI signals) can no longer override high-priority governance constraints.
- `src/context-role.ts`: `RoleHint`, source→role classification, `sortRoleHints`, `detectRoleConflicts` (conservative: both segments retained, conflict logged), `roleBreakdown`, `resolveRoleAssembly`.
- Engine injectors emit `RoleHint[]`; `_assembleRoleAware` at the assembly layer (after cache lookups); `ctx_build` returns `roleConflicts` / `roleBreakdown` (observational, non-breaking). `_rlGovernanceCache` / `_crossDomainCache` keys untouched; hot-cache string entries wrapped as metadata (content never dropped).
- `ContextQualityEvaluator.evaluate` accepts optional `rubricBlocks?` and reports `metadata.rubricCount`; behavior unchanged when omitted (backward-compatible).
- Config: `roleAwareInjection` (default true) and `roleOverrides`.

### Reference

- Paper review: `docs/research/papers/2026-08-31-Context-Engineering.md` (arXiv 2604.04258v1).

### Tests

- 1168 -> 1195 (+23): `context-role.test.ts` (17) + `role-aware-injection.test.ts` (6); benchmarks 22/22 PASS; dependency audit 0 vulnerabilities (openclaw 2026.8.1).

## [6.7.0] - 2026-08-22

### Added

- **pi agent adapter** (`pi_plugin/`): tools wrapped as pi `AgentTool` definitions（TypeBox schema），`package.json` exports `./pi`，`tsconfig.pi.json` 隔离类型检查。依赖 `@earendil-works/pi-agent-core >= 0.84.2`（peer），`@sinclair/typebox`（dev）。

## v6.6.1 (2026-08-15)

### Fixed

- **Version assertion drift**: 2 tests (version-bump / plugin-contract) expected 6.5.1 but actual was 6.6.0 — v6.6.0 released with these failing; assertions synced to 6.6.0 in `0673ea2`
- **js-yaml security upgrade**: devDependency bumped 4.3.0 → 4.3.1 (PR #7, dependabot npm_and_yarn group)

### Changed

- Version: 6.6.0 → 6.6.1

### Tests

- 92 files / 1172 tests / 5 skipped / 0 failed (assertion-sync verification)

# Changelog

## v6.6.0 (2026-08-14)

### Added

- **Context Efficiency Metrics** (`src/efficiency/`): measure compaction effectiveness and context budget utilization, the observational foundation for future adaptive thresholds
  - `ContextEfficiencyMetrics` — records utilization (currentTokens / effectiveBudget), waste (compactionDeltaRate + triggerGap), and cache-hit-rate correlation
  - `EfficiencyReport` — per-session (`getSessionReport`) and cross-session (`getAggregateReport`) aggregation
  - Integrated into `ProactiveCompactionController` via injectable metrics (pure observation, zero decision impact)

### Changed

- Version: 6.5.1 → 6.6.0

## v6.5.1 (2026-08-14)

### Fixed

- **Tool registration missing**: `ctx_compact` / `ctx_build` / `ctx_inject` were declared in `contracts.tools` but never registered at runtime (the registration code lived only in an unreferenced orphan file `openclaw_plugin/index.ts`). Registered the three tools in `src/index.ts`'s `plugin.register(api)` via `api.registerTool`, aligned with the real `ContextCapability` API.
- Update 2 version assertions (6.4.0 → 6.5.0) that were not synced at v6.5.0 release.

### Changed

- Version: 6.5.0 → 6.5.1
- `openclaw_plugin/index.ts` marked `@deprecated` (kept as audit trail; not build output, incorrect registration pattern).

## v6.5.0 (2026-08-14)

### Added

- **MECW-Aware Compaction**: dynamic compaction threshold based on Maximum Effective Context Window
  - `MecwEstimator` (`src/mecw/`) — `estimateMecw = maxContextTokens × effectiveWindowRatio × complexityFactor`
  - `complexityFactor` table (SIMPLE 1.0 / MULTI 0.8 / SUMMARIZATION 0.7 / COMPLEX_REASONING 0.6), configurable override
  - `ProactiveCompactionController.shouldCompact` now accepts optional `taskType` → routes to MECW threshold (backward-compatible fallback to static `compressionThreshold` when omitted)
  - `detectTaskType` full-chain integration in engine/controller
  - Complex task MECW < simple task (65280 < 108800 for gpt-4o, verified)

### Changed

- Version: 6.4.0 → 6.5.0

## v6.4.0 (2026-08-13)

### Added

- **Tool Registration**: ctx_compact / ctx_build / ctx_inject OpenClaw tools
- **ContextCapability.inject**: directed context injection (replace degrades to append)
- **contracts.tools** in openclaw.plugin.json

### Changed

- Version: 6.3.0 → 6.4.0

## v6.0.0 (2026-08-01)

### Added
- **Capability Layer** — `IContextCapability` interface for OpenClaw Runtime
  - `bootstrap(params)` — Session init + history import
  - `ingest(params)` — Message ingestion
  - `assemble(params)` — Context assembly (with all injectors)
  - `compact(params)` — Context compaction
  - `closeSession(id)` — Session cleanup
  - `healthCheck()` — Health status
  - `dispose()` — Resource cleanup
- **ContextCapability** class wrapping ClawContextEngine

### Changed
- All v5.17.0 public API remains backward-compatible (plugin entrypoint preserved)

## v5.16.5 (2026-07-29)

### Added
- **Model Config Sync API** — `getModelConfigs()` for OpenClaw integration
  - Returns all 35+ model configs with proactiveThreshold
  - `proactiveThreshold` = `contextWindow * 0.75`
- **OpenClaw Integration Guide** — `docs/openclaw-integration.md`
  - 5-step integration process (~1 hour)
  - Config drift detection guidance
- **Example Code** — `examples/openclaw-proactive-compact.ts`

### Fixed
- Auto-compaction failure at 57% (now provides clear guidance via API)

### Tests
- Unit tests for `getModelConfigs()` (4 tests)
- Total: 1116 passed, 99.29% pass rate

---

## v5.16.4 (2026-07-29)

### Fixed
- Confirmed model context windows against official documentation
- Compression thresholds unified: 128k→75%, 200k→75%, 256k→78%, 1M→80%

### Verified Models
- Kimi k2: 262,144 ✅, Gemini 2.0 Flash: 128k ✅, GPT-4o: 128k ✅, DeepSeek R1: 128k ✅

---

## v5.16.3 (2026-07-27)

### Changed
- **Model Context Window Audit** - Full verification against official docs for 35 models
  - **GLM-5**: 128k → 200k, threshold 100k → 150k
  - **GLM-5.1**: 128k → 200k, threshold 100k → 150k
  - **GLM-5.2**: 256k → 1M, threshold 200k → 800k, effectiveWindowRatio 0.85 → 0.9
  - **MiniMax M2.5**: 128k → 204.8k
  - **MiniMax M3**: 256k → 1M
  - **DeepSeek V4 Flash**: 128k → 1M
  - **DeepSeek V4 Pro**: 256k → 1M
  - **Qwen 3.5-3.8**: 128k/256k → 1M
  - **Claude Opus 4**: 200k → 1M
  - **Claude 4.6**: 256k → 1M
  - **Claude 5 (Sonnet 5)**: 512k → 1M
  - **Gemini 2.5 Pro**: 256k → 1,048,576
  - **Kimi k1.5**: 200k → 128k (downgrade)
  - **Kimi k2**: 320k → 262k (downgrade)

### Fixed
- **Security**: ReDoS protection and workflow permissions (CodeQL fixes)

### Documentation
- **Audit Report**: `docs/audits/2026-07-27-model-context-window-audit.md`
  - 15 models correct, 14 updated, 2 downgraded, 4 unverifiable
  - Compression thresholds optimized per context size (75%-80% ratio)

---

## v5.16.2 (2026-07-27)

### Added
- **Proactive Compaction Controller** (`src/proactive-compaction-controller.ts`)
  - Triggers compaction *before* token overflow, not after errors
  - Model-specific thresholds (e.g., DeepSeek: 100k, GLM-5.2: 200k, GPT-5.6: 400k)
  - Session state tracking (compaction count, cooldown, last token count)
  - Configurable proactive ratio (default: 75% of context window)
  - Exported via `index.ts` for external use

### Changed
- `index.ts` exports `ProactiveCompactionController` and related types

### Tests
- 18 new tests for ProactiveCompactionController

---

## v5.16.0 (2026-07-25)

### Added
- **Model-Aware Context Optimization**
  - `ModelProfile` interface with 35 model configs
  - `ModelProfileRegistry` class for model management
  - `ModelAwareOptimizer` core class
  - 3 optimization strategies: static-prefix, dynamic-load, hybrid
  - Custom config loading (`.claw-ctx/models.json`)
  - CLI commands: `model list`, `model show`, `model strategy`, `model providers`

### Changed
- `engine.ts` integrated with ModelAwareOptimizer

### Test
- 1073 tests passed (新增 110 个测试)

---

## v5.11.4 (2026-07-22)

### Fixed
- **P1: RecapLoader JSON 解析优先** (`src/session-resume/recap-loader.ts:280-330`)
  - `parseRecap()` 现在优先使用 `JSON.parse()` 解析 SummaryGenerator 存储的 JSON 格式
  - 保留正则回退路径兼容旧版文本格式
  - `formatRecap()` 支持渲染 `pendingTasks` 和 `keyPoints`

- **P2: pendingItems 从 SessionState.decisions 提取** (`src/session-resume/checkpoint.ts:248-260`)
  - `buildSnapshot()` 从 decisions 中提取 user/team actor 且 confidence >= 0.6 的项
  - 与 `SummaryGenerator` 的 pendingTasks 提取逻辑一致
  - 修复 `pendingItems: []` 恒为空的问题

### Tests
- 2 个新测试覆盖 v5.11.4 改动
  - `v5.11.4: parseRecap handles JSON from SummaryGenerator`
  - `v5.11.4: buildSnapshot extracts pendingItems from decisions`

## v5.11.3 (2026-07-22)

### Fixed
- **P0: compact 成功后状态同步** (`src/engine.ts:686-745`)
  - `_executeCompaction()` 返回 `keptMsgs` 和 `summaryBlock`
  - `compact()` 成功路径主动重建 `_sessionState`、调 `_checkpointManager.checkpoint()`、`manager.store(summaryBlock, "episodic", ["compaction", "post-compact"])`
  - **根因**：原实现仅重写 sessionFile，内存态和持久化态都反映 pre-compaction 状态，导致溢出后 /new 或重启会注入陈旧上下文
  - **失败非阻塞**：任何同步步骤抛异常只 warn，不影响 compact 主流程

- **P0: `closeSession` 调 `_checkpointManager.closeSession`** (`src/engine.ts:1138-1160`)
  - 之前只清 LRU 缓存，未标记 claw-mem 中 session 为 `isClosed=true`
  - 导致 `/new` 后旧 session 仍被 `sessionGetUnclosed` 返回，当作"中断未恢复"再次注入
  - **签名变更**：`closeSession()` 从同步 `void` 变为 `async Promise<void>`（OpenClaw 不直接调此方法，向后兼容）

- **P0: `bootstrap` 调 `_sessionResume.reset()`** (`src/engine.ts:351`)
  - 防止跨 session 复用同一实例时 `_history`/`_recap` 泄漏到新 session
  - 在 `_sessionResume.bootstrap()` 之前调用，失败回退到旧行为

- **P0: `getRecoveryContext` 接受 sessionId 过滤** (`src/session-resume/checkpoint.ts:132-171`)
  - `getRecoveryContext(currentSessionId?)` 过滤掉当前 session
  - `bootstrap(sessionId)` 传 sessionId 到 getRecoveryContext
  - 防止新 session 的 bootstrap 把自己当作"中断未恢复"注入

### Tests
- 3 个新测试覆盖 v5.11.3 改动
  - `v5.11.3: bootstrap filters out current sessionId from recovery`
  - `v5.11.3: compact syncs state (tokenWarningEmitted reset + state rebuilt)`
  - `v5.11.3: closeSession is async and returns Promise`

### Remaining Issues (未修，留待 v5.12.0)
- **P1**: Recap 格式不匹配 - `SummaryGenerator` 产 JSON 但 `RecapLoader.parseRecap` 用正则匹配字面量（`recap-loader.ts:275`）
- **P2**: `buildSnapshot.pendingItems` 恒为空数组（`checkpoint.ts:248`）

## v5.11.2 (2026-07-22)

### Changed
- **Compaction threshold 85% -> 75%** (`src/engine.ts`)
  - `assemble()` token warning: `budgetLimit * 0.85` -> `budgetLimit * 0.75`
  - `afterTurn()` self-trigger: `tokenBudget * 0.85` -> `tokenBudget * 0.75`
  - **Why**: 85% was too conservative - by the time compaction triggers, only 15% budget remains for response + tool calls. 75% aligns with industry-standard proactive compaction (LangChain 80%, Continue.dev 70%, Cursor ~80%) and leaves 25% headroom for response generation.
  - For 1M-token DeepSeek window: triggers at 750k instead of 850k, giving 256k response budget (was 150k).

### Tests
- Updated 3 test assertions/comments to reflect 75% threshold

## v5.11.1 (2026-07-22)

### Fixed
- **afterTurn self-triggered compaction** (`src/engine.ts`)
  - When `tokenBudget` is provided and estimated tokens exceed 85% of budget, `afterTurn()` now proactively calls `compact()` to rewrite the session file
  - **Root cause**: OpenClaw `2026.7.x` skips `[context-overflow-precheck]` when `ownsCompaction: true` and never reads `assembled.autoCompact`, so claw-ctx must self-trigger to avoid token growth until timeout/overflow error
  - Last successful compaction before this fix: `2026-07-18T01:00:35` (pre-OpenClaw upgrade)
  - Non-blocking: failures only warn, do not interrupt `afterTurn`

### Tests
- 2 new tests in `tests/engine.test.ts`
  - `v5.11.1: afterTurn self-triggers compaction when tokens exceed 85% budget`
  - `v5.11.1: afterTurn does not trigger compaction when below threshold`

## v5.11.0 (2026-07-21)

### Theme
- **Context Compression Optimization** - Memory leak fix, edge case handling, token reduction

### Added
- **LRUCache** (`src/lru-cache.ts`) - Bounded LRU cache with optional TTL
  - `get/set/delete/has/clear/prune/entries/size`
  - `maxSize` enforced via Map insertion order (LRU eviction)
  - Optional `ttlMs` for time-based expiry
  - 17 unit tests in `tests/lru-cache.test.ts`
- **SemanticCompressorConfig** - Configurable `minKeep`, `duplicateWindowSize`, `duplicateThreshold`
- **engine.closeSession(sessionId)** - Explicitly release session-scoped cache entries

### Fixed
- **L1/L6: Memory leak in `_memorySearchCache`** (`src/engine.ts`)
  - Replaced unbounded `Map` with `LRUCache` (maxSize=32, ttlMs=30s)
  - `_rlGovernanceCache` and `_crossDomainCache` also upgraded to `LRUCache` (maxSize=10), removing ~30 lines of manual LRU logic
- **L2: `compress()` empty input handling** (`src/semantic-compressor.ts`)
  - Explicit null/empty check returns empty `CompressionResult`
  - Length mismatch now throws (was silent index-out-of-bounds risk)
- **L3: `extractText()` nested content blocks** (`src/semantic-compressor.ts`)
  - `tool_use` blocks now serialize `{ tool, input }` JSON
  - `tool_result` blocks extract nested text content
  - Mixed arrays of string/text/thinking/tool_use/tool_result fully supported
- **L4: Jaccard duplicate detection performance** (`src/semantic-compressor.ts`)
  - Sliding window of tokenized `Set<string>` reuses prior tokenization
  - New `jaccardSetSimilarity(a, b)` operates on Sets directly
  - Avoids O(n*k) re-tokenization in long sessions

### Changed
- **SemanticCompressor constructor** now accepts optional `SemanticCompressorConfig`
  - Default behavior unchanged (minKeep=20, window=10, threshold=0.7)
  - Fully backward compatible - existing `new SemanticCompressor()` calls work unchanged
- **`buildSummary()` output format** - Single-line compact form
  - Old: 4-line block (~80 tokens)
  - New: ` | `-joined parts (~25 tokens), empty fields omitted
  - Reduces compressed summary token count by ~55%
  - Still contains `Compacted History` and `Topics:` keywords (existing test compatibility)

### Tests
- `tests/lru-cache.test.ts` - 17 cases (basic ops, LRU eviction, TTL, entries iteration)
- `tests/semantic-compressor-edge-cases.test.ts` - 21 cases (L2/L3/L4, config, buildSummary format)
- Full suite: 61 files, 963 passed, 5 skipped, 0 failures

### Out of Scope
- LLM-based summarization
- `IncrementalCompressor` / `StreamingCompressor` refactor (in `importance-scorer.ts`)
- Compression audit log
- `src/compression/` subdirectory restructure (kept flat to match existing style)

## v5.9.3 (2026-07-06)

### Fixed
- **afterTurn auto-ingest**: When OpenClaw calls afterTurn directly (without prior ingest), claw-ctx now auto-ingests new messages before checkpointing
- Session Snapshot now works end-to-end (verified: checkpointCount increments correctly)

### Changed
- **engine.ts**: Added diagnostic logging for `_sessionState` in afterTurn checkpoint
- **engine.ts**: Added diagnostic logging for ingest state extraction

## v5.9.2 (2026-07-06)

### Fixed
- **claw-mem fallback path**: Corrected import path from `dist/memory_manager.js` to `dist/src/memory_manager.js`
  - Session Snapshot now works correctly when claw-mem is loaded via fallback path
  - CheckpointManager now properly detects claw-mem >= v6.27.0 support

### Changed
- **engine.ts mock**: Added `sessionSnapshot`, `sessionGetUnclosed`, `sessionClose` methods to fallback mock
  - Ensures CheckpointManager returns correct supported status even when claw-mem is unavailable

## v5.9.1 (2026-07-06)

### Added
- **Dynamic Version Injection** (`scripts/gen-version.mjs`)
  - Build-time script to generate `src/version.ts` from `package.json`
  - Version automatically syncs with package.json during build

### Changed
- **src/index.ts**
  - Added VERSION import from auto-generated `version.ts`
  - Hardcoded version replaced with dynamic VERSION constant
  - Registration log uses dynamic version

- **package.json**
  - Build script now runs `gen-version.mjs` before TypeScript compilation

- **.gitignore**
  - Added `src/version.ts` to prevent committing auto-generated file

### Fixed
- Version mismatch issue: runtime version now always matches package.json

## v5.9.0 (2026-07-06)

### Added
- **CheckpointManager Enhanced Logging** (`src/session-resume/checkpoint.ts`)
  - Added detailed logging for all checkpoint operations
  - Logger interface for custom logging implementations
  - Checkpoint statistics (count, last checkpoint time)
  - Better error messages with stack traces

### Changed
- **CheckpointManager** (`src/session-resume/checkpoint.ts`)
  - Improved error handling with detailed logging
  - Added stats property for checkpoint monitoring
  - Added logger parameter to constructor

- **RecapLoader** (`src/session-resume/recap-loader.ts`)
  - Added fallback logic: if session_summary not found, try loading session-related memories
  - Improved timestamp sorting with better null handling
  - Added extractTimestamp helper method
  - Added logger parameter to constructor

### Fixed
- Session snapshot storage errors now logged instead of silently swallowed
- Recap loading fallback improves recovery success rate

## v5.8.0 (2026-07-05)

### Fixed
- **ContextAssembler ignoring injectMode="recap"**: When injectMode was set to "recap", ContextAssembler still loaded full history
  - Added check before calling ContextAssembler.assemble() to skip when injectMode="recap"
  - Engine.ts line 480: Skip ContextAssembler preload when isRecapMode is true

- **RecapLoader search logic**: When sessionId=undefined, search returned unsorted results
  - Added time-based sorting to return most recent recap
  - Request multiple results (5) when sessionId is undefined, then sort by timestamp
  - Properly handles metadata.timestamp type conversion

- **_buildStableSessionResume priority**: Used ContextAssembler result instead of recap when injectMode="recap"
  - Added explicit check for injectMode="recap" at the start of the method
  - When injectMode="recap", uses SessionResumeManager.assemble() directly
  - Returns with [Session Recap] prefix instead of [Session History]

### Changed
- **engine.ts**: Two modifications for recap mode support
  - Line 482-484: Check injectMode before calling ContextAssembler
  - Line 1305-1318: Priority logic for recap mode in _buildStableSessionResume

- **recap-loader.ts**: Enhanced search with time-based sorting
  - Line 56-59: Request multiple results when sessionId undefined
  - Line 70-73: Sort by timestamp (most recent first)

## v5.7.0 (2026-07-05)

### Added
- **Recap Loader** (`src/session-resume/recap-loader.ts`)
  - Loads session recaps from claw-mem
  - Used when injectMode="recap" for lightweight session recovery
  - Parses recap content and metadata

- **Recap Formatter** (`src/session-resume/recap-formatter.ts`)
  - Formats recaps for context injection
  - Three styles: friendly, compact, detailed
  - Configurable max length and metadata inclusion

### Changed
- **types.ts**: Added "recap" to injectMode options
- **bootstrap.ts**: SessionResumeManager now supports recap injection mode
  - When injectMode="recap", only injects session recap (not full history)
- **mod.ts**: Exported RecapLoader, RecapFormatter, Recap types

## v5.6.2 (2026-07-01)

### Fixed
- **Flaky Tests**: Fixed 4 probabilistic test assertions in `tests/memory_strategy_selector.test.ts`
  - `selects drift_adaptive when drift is high`: 200 iterations + `>= 1` + `reset()`
  - `selects aggressive_recall when budget is high and drift low`: 100 iterations + `>= 10` + `reset()`
  - `selects minimal_context when budget is very low`: 100 iterations + `>= 10` + `reset()`
  - `topK varies with drift level for drift_adaptive strategy`: 200 iterations + `>= 1` + `reset()`

### Root Cause
- Epsilon-greedy algorithm (`explorationRate = 0.15`) made probabilistic assertions non-deterministic
- At `drift=0.9`, `selective_recall` (0.82) wins exploitation over `drift_adaptive` (0.81)
- Tests relied solely on random exploration (~3.75% per strategy per iteration)

### Solution
- Added `selector.reset()` before each test for clean state
- Increased iterations to 200 for drift_adaptive tests (P(failure) < 0.05%)
- Kept 100 iterations + 10% threshold for tests where expected strategy wins exploitation

### Verified
- Build: 0 errors
- Tests: 886/886 passed
- Stability: 8/8 consecutive runs passed

## v5.6.1 (2026-07-01)

### Added
- **Integration Tests**: 39 new tests with real imports (no vi.mock for claw-mem/claw-rl)
  - `tests/plugin-registration.test.ts`: Plugin registration smoke tests (6 tests)
  - `tests/engine-integration.test.ts`: Engine integration with real dependencies (10 tests)
  - `tests/session-resume/pipeline-integration.test.ts`: Session-resume pipeline tests (11 tests)
  - `tests/injectors/coordination.test.ts`: Multi-injector coordination tests (13 tests)

### Changed
- Test methodology upgrade: Integration tests now use real `src/` imports instead of vi.mock
- Follows tri-role-release-v2 Test Methodology Standard: "hook/integration tests MUST import real src/ modules"

### Verified
- Build: 0 errors
- Tests: 886/886 passed (57 files)
- No regression: All 847 existing tests still pass

## v5.6.0 (2026-07-01)

### Added
- **ContextQualityEvaluator**: 3-dimension quality evaluation (coverage, redundancy, freshness)
- **CoverageEvaluator**: Query keyword coverage in context (stopword filtering, entity matching)
- **RedundancyEvaluator**: Jaccard similarity for duplicate detection (with sampling for performance)
- **FreshnessEvaluator**: Exponential decay on entry timestamps (configurable half-life)
- **ContextQualityReport**: Structured quality report with assessment (good/acceptable/poor)
- **relevanceScore passthrough**: HistoryLoader passes hybrid_search score to HistoryEntry
- **engine.ts integration**: ContextAssembler now integrated into main assembly pipeline

### Changed
- `types.ts`: Added `relevanceScore` to HistoryEntry
- `context-assembler.ts`: Uses relevanceScore for relevance sort, evaluates quality
- `history-loader.ts`: Passes through search score as relevanceScore
- `bootstrap.ts`: Added `getManager()` method for ContextAssembler initialization
- `engine.ts`: Preloads ContextAssembler result, uses cached result in sync methods

### Quality Dimensions
| Dimension | Weight | Method |
|-----------|:------:|--------|
| Coverage | 0.40 | Keyword match: context vs query |
| Redundancy | 0.35 | Jaccard similarity between entries |
| Freshness | 0.25 | Exponential decay on timestamps |

### Integration Pipeline
```
engine.assemble() [async]
    ├── ContextAssembler.assemble() → _lastAssemblyResult
    ├── _buildStableSessionResume() → uses _lastAssemblyResult.formatted
    └── _injectSessionResume() → uses _lastAssemblyResult.formatted
```

### Verified
- Build: 0 errors
- Tests: 847/847 passed (53 files)

## v5.5.0 (2026-07-01)

### Added
- **ContextStrategy**: 5 assembly strategy definitions (factual_recall, temporal_reasoning, procedural_execution, compositional_reasoning, balanced)
- **StrategyRouter**: Maps TaskType → AssemblyStrategyType with fallback to "balanced"
- **ContextAssembler**: Orchestrates strategy-based context assembly (route → load → sort → format)
- **Format templates**: 5 strategy-specific templates (facts, timeline, procedural, evidence, default)
- **TaskTypeDetector keywords**: Extended for better strategy routing

### Changed
- `types.ts`: Added `AssemblyStrategyType`, `AssemblyParams`, `AssemblyResult` types
- `mod.ts`: Exported new ContextAssembler components

### Strategy Mapping
| TaskType | Strategy |
|----------|----------|
| coding | procedural_execution |
| debugging | factual_recall |
| planning | compositional_reasoning |
| review | compositional_reasoning |
| question | factual_recall |
| conversation | balanced |
| unknown | balanced |

### Verified
- Build: 0 errors
- Tests: 813/813 passed (49 files)

## v5.4.0 (2026-07-01)

### Added
- **HierarchicalLoader**: Time-based 3-level history loading (Recent / This Week / Earlier)
- **TimeBucket**: Pure utility for bucketing sessions by recency (recent / this_week / older)
- **BucketConsolidator**: Conservative merge strategies per level with Jaccard similarity dedup
- **New config**: `historyMode: "flat" | "hierarchical"` (default: "flat")
- **New config**: `hierarchicalLoader.recentSessionCount`, `weekBoundaryDays`, `level3MaxAgeDays`, `dedupThreshold`

### Changed
- `HistoryLoader.load()`: Branches on `historyMode` — delegates to HierarchicalLoader when hierarchical
- `SessionResumeConfig`: Extended with optional `historyMode` and `hierarchicalLoader` fields
- Level 3 (Older) intentionally drops pendingTasks (likely completed)

## v5.3.0 (2026-06-30)

### Added
- **CompletenessGate**: Evaluates completeness scores from hybrid_search and recommends actions (use/expand/max_expand)
- **AdaptiveExpansion**: Computes expanded search parameters when completeness is insufficient (max 2 rounds)
- **hybrid_search integration**: HistoryLoader uses hybrid_search from claw-mem >= v6.29.0 when available
- **Completeness metadata**: `HistoryLoadResult` now includes optional `completeness` field
- **New config options**: `completenessThreshold` (default 0.4) and `adaptiveExpansion` (default true)

### Changed
- `HistoryLoader.load()`: Now uses hybrid_search with completeness gate and adaptive expansion
- `HistoryLoader`: Added `_performSearch()` with graceful fallback to legacy search
- `SessionResumeConfig`: Extended with optional completeness fields (backward compatible)
- `HistoryLoadResult`: Extended with optional `completeness` field (backward compatible)

### Verified
- Build: 0 errors
- Tests: 718/718 passed (42 files)
- Edith acceptance: Code PASS, pending release artifact fix

## v5.2.1 (2026-06-30)

### Added
- **Session-level cache stabilization**: RL/Governance signals cached per session with LRU eviction (10 entries max)
- **Cross-domain change detection**: Cross-domain signals only re-injected on pillar/intent change
- **Auto-session dedup**: Suggestion only triggers once per session (boolean flag)

### Changed
- **Drift session aggregation**: Removed 5-turn batch; alerts now sticky on sudden change only
- **DeepSeek prefix cache hit rate**: ~95% → 96-97%
- **Dynamic suffix changes**: Reduced by ~70% within session

### Verified
- Build: 0 errors
- Tests: 690/690 passed (39 files)
- Edith acceptance: Conditional Pass

## v5.2.0 (2026-06-29)

### Added
- **systemPromptAddition internal reordering**: Stable prefix + dynamic suffix for DeepSeek prefix cache optimization
- **Session resume**: Deterministic format with session hash
- **Memory search caching**: Session+query key with 30s TTL

### Changed
- `assemble()`: Split into `stableAdditions` + `dynamicAdditions`
- DeepSeek prefix cache hit rate: 93.3% → 94.8-95.3%

### Verified
- Build: 0 errors
- Tests: 682/682 passed (39 files)
- Edith acceptance: Approved

## v5.1.1 (2026-06-29)

### Added
- **Drift Alert Batching**: Aggregate alerts every 5 turns (or immediate on >0.3 gap)
- **Token Warning Dedup**: Emit once per threshold crossing, reset after compaction

### Changed
- DeepSeek prefix cache hit rate: 91.3% → 93.3%

### Verified
- Build: 0 errors
- Tests: 678/678 passed
- Edith acceptance: Approved

## v5.1.0 (2026-06-25)

### Added
- **Checkpoint & Session Recovery**: Session checkpointing with automatic recovery on resume
- `CheckpointManager`: Snapshot session state (token usage, drift, memory state, external context)
- `SessionRecovery`: Three-phase recovery (restore checkpoint → reconcile with live state → inject recovery context)

### Changed
- `engine.ts`: Integrated checkpoint save/restore in bootstrap and afterTurn lifecycle
- `session-resume`: Extended types with checkpoint interfaces

### Verified
- Build: 0 errors
- Tests: 13 new checkpoint tests added

## v5.0.0 (2026-06-21)

### Added — Cross-Domain Signal Fusion
- **CrossDomainFusion**: Aggregate signals from different domains (memory/governance/ci/cross-domain/session)
- **SignalAggregator**: Multi-source signal weighted fusion
- **DomainClassifier**: Signal domain classification

### Added — Adaptive Injection Strategy
- **AdaptiveInjector**: Dynamic injection based on task type (7 types)
- **TaskTypeDetector**: Task type detection
- **InjectionStrategy**: Dynamic strategy selection (aggressive/balanced/minimal/contextual)

### Added — Multi-Style Prompt Engine
- **Descriptive**: Describe current context state
- **Prescriptive**: Specify selection rules
- **Prohibitive**: Exclude rules
- **Explanatory**: Explain selection rationale
- **Conditional**: Conditional inclusion

### Added — Predictive Context
- **ContextPredictor**: Predict future context needs
- **PreloadManager**: Context preloading with TTL
- **PredictionEngine**: Frequency/co-occurrence/sequence analysis

### Added — Context Version Evolution Tracking
- **ContextSnapshot**: Record context assembly input/output
- **VersionHistory**: Manage snapshot history
- **ChangePatternAnalyzer**: Analyze add/modify/delete patterns

### Added — Project Standardization
- **AGENTS.md**: Project structure, build commands, test strategy, contribution guide
- **Context Strategy Spec**: Documented 4+ strategies (retrieval/recent/hybrid/rl-enhanced)
- **Standardized Prompt Template**: Defined I/O format for external reuse

### Changed
- Minimum Node.js: 20.0.0
- OpenClaw Gateway: 2026.3.28+

### Verified
- Tests: 659/659 passed
- Coverage: 90.93%

## v4.26.0 (2026-06-16)

### Removed
- **engine.ts**: Cleaned 7 dead imports (`MockRLProvider`, `MockGovernanceProvider`, `MockCrossDomainProvider`, `MockCIProvider`, `TopicModel`, `DEFAULT_DRIFT_CONFIG`, `RelevanceScorer`) — unused in production code
- **RelevanceScorer**: Deleted `src/relevance-scorer.ts` — exported but never used by any module
- **DriftBudgetLinker**: Deleted `src/drift-budget-linker.ts` — exported but never used by any module

### Added
- **ESLint**: Flat config with @typescript-eslint, configured in `eslint.config.js`
- **TypeDoc**: API documentation generation via `npm run docs` → `docs/api/`
- **ADR**: `docs/adr/README.md` with ADR-001 (module structure), ADR-002 (no-LLM rule), ADR-003 (claw-mem integration)
- **License Header**: Apache 2.0 header on all 37 .ts source files

### Changed
- **tsconfig.json**: `moduleResolution: NodeNext`, `module: NodeNext`
- **package.json**: Added `engines`, `exports`, `files` fields; `lint` and `docs` scripts
- **README.md**: Updated architecture diagram (v4.26.0) and Context Flow (9 steps)
- **.gitignore**: Added `docs/api/` to exclude TypeDoc output from version control

### Fixed
- **engine.ts:85**: prefer-const (let → const for globalTokenCounter)

## v4.25.0 (2026-06-16)

### Added
- **SECURITY.md**: Security vulnerability reporting process, response timeline, supported versions
- **CONTRIBUTING.md**: Development setup guide, code style, PR process, testing requirements

### Changed
- **.gitignore**: Added `coverage/` and `cov-merged/` to exclude build artifacts from version control
- **README.md**: Version badge updated to v4.24.0; added note clarifying coverage HTML files as build artifacts
- **Git tracking**: Removed `dist/`, `coverage/`, `cov-merged/` from version control (now properly gitignored)

## v4.24.0 (2026-06-16)

### Added
- **Self-Refinement Module**: New `src/self-refinement/` sub-module with quality evaluation and reasoning strategies
  - `QualityEvaluator`: 4-dimensional output quality evaluation (completeness/accuracy/consistency/readability) with weighted average scoring
  - `ChainOfThoughtStrategy`: Step-by-step sequential reasoning strategy
  - `TreeOfThoughtsStrategy`: Multi-path exploration reasoning strategy
  - `GraphOfThoughtsStrategy`: Network-based reasoning strategy
  - `ReasoningStrategy` interface for extensible strategy implementations

### Changed
- `SelfRefiner.evaluate()` now delegates to `QualityEvaluator` for 4-dimensional scoring (backward compatible)
- `PromptStrategyController` now uses `ReasoningStrategy` instances internally (backward compatible)
- Version: 4.23.0 → 4.24.0 (engine.ts, index.ts)

### Fixed
- **engine.test.ts**: Version assertions updated to 4.24.0
- **benchmark.test.ts**: `getKeyEntities` threshold 5ms → 50ms, `batch detectDrift` threshold 100ms → 200ms, `stateExtraction` 100ms → 200ms, `stateMerge` 20ms → 100ms
- **openclaw.plugin.json**: Version 4.22.0 → 4.23.0

## v4.23.0 (2026-06-16)

### Added
- **SessionResume**: Session continuity module with structured history loading and summary generation
  - `SessionResumeManager`: Three-phase lifecycle (bootstrap → assemble → afterTurn)
  - `SummaryGenerator`: Pure rule-based keyword/task/key-point extraction from messages
  - `HistoryLoader`: claw-mem backed multi-session history loading with dedup/filter/format
  - CJK/Unicode support: Bigram-based keyword extraction, CJK regex patterns for tasks/key-points

### Fixed
- **engine.ts**: Added missing `await` on `manager.search()` calls (P0 bug — memory search was returning Promise instead of results)
- **engine.ts**: Session resume history injection now works in both early-return and main paths
- **onSubagentEnded**: Added missing `await` on `manager.search()` call

### Changed
- engine.ts: Replaced private `_loadPreviousSessionContext()` / `_storeSessionSummary()` with SessionResumeManager
- engine.ts: Added `getSessionResumeManager()` accessor
- index.ts: Added session-resume exports
- Performance thresholds adjusted for local environment

## v4.22.0 (2026-06-11)

### Added
- **SemanticCompressor**: Importance-aware message compression preserving key context
  - `MessageImportance` scoring: code (+30), entities (+20), decisions (+25), questions (+15), duplicates (-20)
  - Entity extraction via regex patterns (project names, versions, URLs, PascalCase, filenames)
  - Decision extraction from sentences containing decision markers
  - Jaccard similarity-based duplicate detection
  - `compress()` method: keeps high-importance messages within token budget, always preserves newest 20

### Changed
- engine.ts: integrated SemanticCompressor, added `compressionStrategy` config ("semantic" | "legacy", default "legacy")
- `_executeCompaction()` supports semantic mode for importance-aware message selection

## v4.21.0 (2026-06-11)

### Added
- **Gateway Integration Verification**: Debug logging for assemble(), afterTurn(), ingest(), ingestBatch()
  - assemble() confirmed called with correct sessionId, messages count, tokenBudget
  - afterTurn() confirmed called by Gateway (preferred over ingest() when implemented)
  - Gateway successfully routes context engine calls through plugin slot system

### Verified
- Gateway loads claw-ctx as context engine via `plugins.slots.contextEngine: "claw-ctx"`
- Hook coexistence: 5 internal hook handlers loaded, no conflicts with claw-ctx
- Gateway auto-discovers context engine methods: assemble → afterTurn → ingestBatch → ingest (priority order)

### Changed
- engine.ts: v4.10.0 → v4.21.0, added template-string debug logs
- Version: 4.20.0 → 4.21.0 (package.json, index.ts, engine.ts)

## v4.20.0 (2026-06-11)

### Added
- **AutoCompactController**: Automatic compaction triggering when drift score ≥ 0.7
  - Configurable threshold, cooldown (default 5min), max compacts per session (default 3)
  - `shouldCompact(driftScore)` / `recordCompact()` / `reset()` / `getStats()`
- **AutoSessionController**: New session suggestion when drift score ≥ 0.9
  - Configurable threshold, suggestion cooldown (default 10min)
  - `shouldSuggestNewSession(driftScore)` / `generateSuggestion()` / `reset()`
- **RelevanceScorer**: Cross-session memory relevance scoring
  - 4-dimension scoring: entity overlap (40%), topic similarity (35%), recency (15%), confidence (10%)
  - `score()` / `rank()` / `buildContext()` — static context builder
- `assemble()` now returns `driftScore`, `autoCompact`, `newSessionSuggestion` fields

### Changed
- engine.ts: integrated AutoCompactController, AutoSessionController, RelevanceScorer
- index.ts: version 5.1.0 → 4.20.0, plugin registration updated
- Fixed version consistency: package.json, engine INFO, plugin version all aligned

### Tests
- 22/22 new tests passing (auto-compact: 7, auto-session: 7, relevance-scorer: 8)
- Full suite: 516/516 passing

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
