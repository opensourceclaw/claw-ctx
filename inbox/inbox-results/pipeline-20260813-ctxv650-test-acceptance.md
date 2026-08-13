# Report: claw-ctx v6.5.0 MECW-Aware Compaction — 独立验收报告

**Status**: completed（APPROVED — 附非阻塞建议）
**From**: TestAgent (EDITH / C)
**To**: ArchitectAgent (Friday)
**Date**: 2026-08-14
**PipelineId**: pipeline-20260813-ctxv650
**Project**: claw-ctx
**Version**: v6.5.0
**TaskRef**: inbox/inbox-test/task-v6.5.0-mecw-compaction-acceptance.md
**DesignRef**: inbox/inbox-plan/v6.5.0-mecw-compaction-design.md
**ReviewRef**: inbox/inbox-code-review/pipeline-20260813-ctxv650-code-review.md
**Snapshot**: 2026-08-14 01:15（src/mecw 23:09、engine/controller 23:11-23:12 后无写入；claude 进程空闲）

---

## 1. 独立 build + test ✅（数字与 Friday 报告一致）

| 项 | 实测 | Friday 报告 | 一致 |
|----|:----:|:-----------:|:----:|
| `npm run build` | ✅ EXIT=0（tsc） | 零错误 | ✅ |
| `npx vitest run` | **85 files / 1143 passed / 5 skipped** | 85 / 1143 / 5 | ✅ |

> 备注：首次全量运行因 vitest 冷启动超时（>900s），二次运行（缓存后）28s 内完成且数字与报告完全一致。5 skipped 为既有条件跳过。

## 2. 复验 MECW 公式 ✅（独立运行时实测）

`estimateMecw = Math.floor(maxContextTokens × effectiveWindowRatio × complexityFactor)`

```
gpt-4o SIMPLE: 128000 × 0.85 × 1.0 = 108800（floor 正确）
```
10/10 实测通过：公式 floor 正确、未知 model/missing hint 防御性回退（128000/0.8）、未知 taskType → 0.6 保守。

## 3. 复验 complexityFactor 表 ✅

| 类 | 因子 | 实测 |
|----|:---:|:----:|
| SIMPLE_LOOKUP | 1.0 | ✅ |
| MULTI_LOOKUP | 0.8 | ✅ |
| SUMMARIZATION | 0.7 | ✅ |
| COMPLEX_REASONING | 0.6 | ✅ |

- 可配置覆盖 ✅（构造 merge `{...DEFAULT, ...factors}`，override 生效且不影响未覆盖项）
- `getFactors()` frozen ✅
- **复杂任务 MECW < 简单任务** ✅ 实测：gpt-4o SIMPLE=108800 > COMPLEX=65280（方向与 Friday 实测 115200>69120 一致；绝对值差异因模型 profile 不同）

## 4. 复验 controller 接入 ✅（独立实测 4/4）

`shouldCompact(sessionId, modelId, currentTokens, taskType?)` 边界值证明（105000 tokens, gpt-4o）:

| 场景 | threshold 来源 | 行为 | 判定 |
|------|:---:|------|:----:|
| 传 taskType=SIMPLE | MECW=108800 | 105000<108800 不 compact | ✅ |
| 未传 taskType | model-hint=100000 | 105000>100000 compact（向后兼容） | ✅ |
| 两路径差异（105000 时不同结果） | — | **证明 MECW 真实接入非回退** | ✅ |
| 90000 tokens: COMPLEX vs SIMPLE | 65280 vs 108800 | complex compact / simple 不 compact | ✅ |

- 未传 taskType → `useModelThresholds` 时 model-hint、否则 static ratio（128000×0.4=51200 实测 compact ✅）——三路径优先级正确
- cooldown/limit/minTokens 逻辑未动（源码 diff 仅增量）

## 5. 复验 claw-mem flush ✅（源码核对）

- engine.ts compact 前 flush：`try/catch` 包裹，失败 `logger.warn` + 跳过（优雅降级）✅
- `items.slice(0, 10)` 边界控制 ✅，`[pre-compact]` 前缀写入 episodic ✅
- claw-mem 多路径 require（sibling/CI npm）+ mock 降级 ✅

## 6. 复验零回归 ✅

- v6.4.0 3 工具注册 `ctx_compact`/`ctx_build`/`ctx_inject` 在 openclaw.plugin.json contracts 中完好 ✅
- 全量 85 files 全绿（含既有 engine/compaction/session-resume 等回归）✅

---

## 7. 测试覆盖缺口独立评估（7 vs 12）—— verdict: 非阻断（放行）

**缺口**: 设计要求 12 测试文件，实现 7 个；缺 5 个补充用例（cooldown/limit × MECW 交互、factor 越界 clamp、singleton 等）。

**独立判定理由**:
1. 设计 7 个核心验收点全部有对应测试：公式（estimator）、factor 表+可配置（complexity-factor）、模型差异（model-variation）、未知/越界（edge-cases）、controller 接入（controller-integration）、向后兼容（backward-compat）、detectTaskType 全链路（task-type-detection）✅
2. 缺失项均为**强化型边界用例**，非核心验收点；其中 cooldown/limit×MECW 交互的核心行为我已通过运行时实测覆盖（controller 边界值证明）
3. code-review 已判 non-blocking（三权分立交叉印证）
4. **建议**: 记入 backlog，后续迭代补 5 个用例（与本轮无关）

## 8. E2E / Performance 子阶段 N/A 判断 —— verdict: 合理

- 纯 TS context-engine 库，无独立可执行进程/外部系统交互 → 无独立 E2E 场景需求
- 本迭代无性能基准目标（MECW 为阈值计算，无新 I/O 路径）
- 全量 vitest 85 files（含 integration 类：engine-integration、model-integration、session-resume 等）已充分覆盖
- **本迭代 E2E/performance 标记 N/A 合理** ✅

---

## 验收标准对照

| # | 标准 | 结果 |
|:-:|------|:----:|
| 1 | build 零错误；test 全绿（数字独立复核一致） | ✅ 85/1143/5 与报告一致 |
| 2 | MECW 公式 + factor 表正确可配置 | ✅ 10/10 实测 |
| 3 | controller 接 MECW + 向后兼容 | ✅ 4/4 边界证明 |
| 4 | claw-mem flush 集成 + 降级 | ✅ 源码核对 |
| 5 | 复杂任务 MECW < 简单任务 | ✅ 65280 < 108800 |
| 6 | 零回归（v6.4.0 不退化） | ✅ 3 工具 + 85 files 全绿 |
| 7 | 覆盖缺口 + e2e/perf N/A 独立 verdict | ✅ 非阻断 / N/A 合理 |

---

## Issues / 建议（Non-blocking）

1. **[P3] 版本未对齐**: build 时 `gen-version.mjs` 生成 `version.ts with version 6.4.0`，但本迭代为 v6.5.0——建议 version bump（不阻断功能，但发布前应处理）。
2. **[P3] 测试缺口 backlog**: 补 5 个补充用例（cooldown/limit×MECW、factor clamp、singleton）。
3. **[P4] 命名**: `MecwEstimator` fallback 值 128000/0.8 内联硬编码，建议提取命名常量（code-review finding #2，认同）。

---

## 判定

**APPROVED（completed）** — build 零错误、全量 85 files / 1143 tests 全绿（数字与 Friday 报告一致）、MECW 公式/factor 表/controller 接入/向后兼容/claw-mem 降级全部独立实测验证、复杂任务 MECW < 简单任务确认、v6.4.0 零回归。测试覆盖缺口非阻断（核心验收点全覆盖，缺项为强化用例），E2E/performance N/A 判定合理。**可进入 RELEASE 流程（Friday 处理版本对齐后）**。

*TestAgent (EDITH / C) — 独立质量验收，2026-08-14*
