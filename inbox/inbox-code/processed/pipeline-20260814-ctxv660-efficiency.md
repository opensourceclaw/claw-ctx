# Task: claw-ctx v6.6.0 — Context Efficiency Metrics 模块

**From**: Friday (ArchitectAgent, A)
**To**: Jarvis (CodeAgent, B)
**Date**: 2026-08-14
**Stage**: CODE
**SubStage**: implementation
**Priority**: P1（v6.6.0 核心，自适应阈值的前置地基）
**PipelineId**: pipeline-20260814-ctxv660
**Project**: claw-ctx
**Version**: v6.6.0
**DesignRef**: inbox/inbox-plan/v6.6.0-efficiency-metrics-design.md
**PlanRef**: inbox/inbox-plan/v6.6.0-efficiency-metrics-iteration-plan.md

---

## ⚠️ Inbox 绝对路径

```
Read:   /Users/liantian/workspace/osprojects/claw-ctx/inbox/inbox-code/
Write:  /Users/liantian/workspace/osprojects/claw-ctx/inbox/inbox-results/
Repo:   /Users/liantian/workspace/osprojects/claw-ctx/
```

## 背景

v6.5.0 已落地 MECW-aware compaction。但压缩「效率」未被测量——不知道实际 token 利用率、冗余上下文浪费、压缩是否到位。这是后续「自适应阈值」（v6.7.0）的前置缺口。本任务交付独立的**效率度量模块**，纯观测性，不改变现有 compaction 行为。

## 任务

新建 `src/efficiency/` 模块，量化三个核心指标。**严格遵循设计文档 `v6.6.0-efficiency-metrics-design.md`**（已列出模块结构、类型签名、集成点、边界）。

### 三个核心指标

1. **Utilization %**：`currentTokens / effectiveBudget`（`effectiveBudget = maxContextTokens × effectiveWindowRatio`，或用已计算的 `mecwTokens`）。
2. **Waste metrics**：
   - 压缩偏差 `compactionDeltaRate = |tokensAfter - targetTokens| / targetTokens`
   - 触发偏差 `triggerGap = tokensBefore - threshold`
3. **Cache hit rate correlation**：复用 `OptimizerMetricsCollector.getCacheHitRate()`，在 compaction 决策点记录 `{ utilization, cacheHitRate }` 对。

### 模块结构（按设计文档）

```
src/efficiency/
  types.ts              # EfficiencyMetric / WasteMetric / EfficiencyReport
  ContextEfficiencyMetrics.ts
  index.ts              # barrel + 单例 contextEfficiencyMetrics
```

### 集成点（不改变现有语义）

- `ProactiveCompactionController`：在 `shouldCompact()` / `recordCompaction()` 内追加 `ContextEfficiencyMetrics` 的 record 调用（`recordCheckpoint` / `recordCompaction`），**用注入方式**（构造注入 metrics 实例，默认单例），轻量、无语义改变。
- `OptimizerMetricsCollector.getCacheHitRate()` 直接复用。

### 关键约束

1. **纯观测性**：只读数据 + 计算 + 报告，**绝不写入会影响 compaction 决策的状态**。
2. **无自适应**：不引入任何「根据度量调整阈值」逻辑（那是 v6.7.0，明确出界）。
3. **不改变 `shouldCompact` / `recordCompaction` 的返回值和状态更新语义**——现有的 `getSessionState`、cooldown、compaction limit 等行为必须保持不变（回归测试会验证）。
4. **向后兼容**：默认启用但零副作用；现有 85+ 测试必须全绿。
5. **单例 + 可注入**：`contextEfficiencyMetrics` 单例导出，同时构造注入便于测试。

## 验收标准

- [ ] `src/efficiency/` 三文件交付，三指标可度量
- [ ] per-session + aggregate 报告方法可用
- [ ] 与 controller/metrics 集成正确，`shouldCompact`/`recordCompaction` 语义不变
- [ ] 新增测试 ≥6 文件，现有 85+ 全绿
- [ ] `npm run build` 零错误
- [ ] 无自适应逻辑（边界清晰，报告中说明）

## 输出文档

完成后写 `inbox/inbox-results/pipeline-20260814-ctxv660-efficiency-complete.md`（Status: completed，附测试数字 + 关键实现片段 + 三指标样例输出）。

## ⚠️ 提醒

- ✅ 三权分立：不 commit、不 push、不 release
- ⚠️ 严格对照设计文档，不擅自加 scope（尤其不要误入「自适应阈值」）
- ⚠️ 集成不得破坏现有 controller 行为（回归测试是关键）

---

**启动时间**: 2026-08-14 23:20 GMT+8
