# Architecture Decision Record: Compaction Event Exposure

**Title:** ctx.compaction.completed / ctx.compaction.skipped events on OptimizerEvents schema, emitted from engine.compact()
**Status:** Accepted（Peter 2026-09-07 批准，随 v6.9.0 发布转正）
**Date:** 2026-09-06
**Author:** Jarvis (CodeAgent)
**Project:** claw-ctx v6.9.0
**Deciders:** Friday (ArchitectAgent), Peter (Owner)
**Evidence:** plan T2（compact 次数/时机入 tracing 事件，为 Fig 13 探索峰归因 instrumentation 供数）；`optimizer-observer.ts` L15-22（OptimizerEvents 既有 6 事件 schema 与 IEventBus/NoOp 降级机制）；engine.compact() 现**零发射**（observer 仅 model-aware-optimizer 使用）；compact 双触发路径：ctx_compact tool（L168 index.ts）与 afterTurn self-trigger（L1106，ownsCompaction 契约）。

---

## Context

下游行为分析（探索峰归因：探索激增是否与 compaction 逐点对应）需要「压缩执行的结果事件」，而现 schema 只有阈值预警事件 `ctx.compression.triggered`（modelId/tokensBefore/threshold，无执行结果、无 sessionId、无规模变化）。engine.compact() 无任何事件发射。此外 engine.compact() 参数无调用来源字段——无法区分 tool 显式 / afterTurn 自触发 / force。

## Decision

- **schema 扩展**（OptimizerEvents 追加两事件，对接面 = 事件名 + 载荷字段即与 claw-obs 契约，obs 消费下版按此对齐）：
  - `ctx.compaction.completed`: `{timestamp, sessionId, triggerReason: "explicit"|"auto"|"force", tokensBefore, tokensAfter, removedMessages, keptMessages, durationMs, digestRounds?, digestTokens?}`
  - `ctx.compaction.skipped`: `{timestamp, sessionId, triggerReason, reason, tokensBefore}`
- **发射方法**：OptimizerObserver 增 `emitCompactionCompleted/emitCompactionSkipped`，走既有 `IEventBus.emit`（NoOpEventBus 降级自然生效——claw-obs 缺席时静默，本地全量测试可行）。
- **触发原因获取**：`engine.compact()` 参数增**可选** `triggerReason`（内部接口面）；afterTurn 自触发点（L1106）传 `"auto"`；capability/tool 面不传 → 默认 `p.force ? "force" : "explicit"`。**工具签名与 7-tool 面零改动**（红线）。
- **发射点**（全部 try/catch，发射失败不影响主流程）：skipped 于 below-threshold 返回前（L712-714）与 `_executeCompaction` compacted=false 返回前（L738-740）；completed 于成功 return 前（L790-799）。
- 既有 `ctx.compression.triggered` 不动（语义 = 阈值判定预警，不同层事件）。

## Consequences

- 正面：instrumentation 完备（触发原因 × 结果 × 规模 × 耗时全字段）；事件族机制复用（NoOp/降级/单测模式零新基建）；红线合规（签名不变）。
- 负面：engine 模块新增 observer 依赖（装配点沿用 model-aware-optimizer 先例路径）；事件无 buffering/retry（观察事件语义，丢即丢，可接受）。
- 诚实边界：事件提供「逐点对应」所需字段，但归因分析（Fig 13 复现）本身在 obs 侧下游，不在本版验收范围。

## Alternatives Considered

1. **复用 ctx.compression.triggered 并塞结果字段**：既有事件语义已固定（modelId/tokensBefore/threshold），字段不匹配执行结果——语义污染，拒绝。
2. **文件级 audit log 替代事件**：无 claw-obs 消费通道，下游分析需新基建——事件族是既有对接口，拒绝。
3. **工具面加 triggerSource 参数**：破坏 ctx_compact 对外签名（红线）——改走内部可选参数。
