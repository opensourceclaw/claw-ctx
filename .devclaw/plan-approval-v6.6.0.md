# Plan Approval: claw-ctx v6.6.0

**Version**: 6.6.0
**Date**: 2026-08-14
**SubStage**: PLAN > plan-approval
**Approver**: Friday (A)
**PipelineId**: pipeline-20260814-ctxv660

---

## Plan Summary

### Objective

Context Efficiency Metrics — 量化 compaction 效果与上下文预算利用效率（自适应阈值的前置地基）。

### Scope（本迭代 v6.6.0 交付）

| 模块 | 内容 | 优先级 |
|------|------|:------:|
| Context Efficiency Metrics | utilization% / waste（压缩偏差+触发偏差）/ cache hit rate correlation | P1 |
| Efficiency Report | per-session + 跨 session 聚合报告 | P1 |

### Out of Scope（明确划出）

- ❌ 自适应/自调优阈值（learning）→ v6.7.0
- ❌ 阈值漂移检测 → v6.7.0
- ❌ 效率告警（alert）→ 待定

## Deliverables

### PLAN Stage（Completed）

- [x] Requirements Analysis — v6.6.0-efficiency-metrics-iteration-plan.md（修订版，分模块）
- [x] Architecture Design — v6.6.0-efficiency-metrics-design.md（三指标 + 模块结构 + 类型签名 + 集成点）
- [x] Iteration Planning — scope 边界 + 测试要求 + 验收标准
- [x] design-review — 与现有代码（ProactiveCompactionController / OptimizerMetricsCollector）对齐

### CODE Stage（To Jarvis，已投递，不退回）

- [ ] `src/efficiency/types.ts` — EfficiencyMetric / WasteMetric / EfficiencyReport
- [ ] `src/efficiency/ContextEfficiencyMetrics.ts` — 核心收集器（recordCheckpoint/recordCompaction/recordCacheContext/getSessionReport/getAggregateReport）
- [ ] `src/efficiency/index.ts` — barrel + 单例 contextEfficiencyMetrics
- [ ] 集成 `ProactiveCompactionController`（注入 metrics 实例，纯观测，不改变 shouldCompact/recordCompaction 语义）

### BUILD Stage

- [ ] `npm run build` — TypeScript 编译零错误

### TEST Stage

- [ ] 新增 ≥6 测试文件（效率度量 + 报告 + 集成）
- [ ] 现有 85+ 测试全绿（无回归）

### RELEASE Stage

- [ ] Version bump 6.5.1 → 6.6.0
- [ ] CHANGELOG 更新
- [ ] Git commit（Friday gate）+ 投 release（Karen + Peter）

## Key Design Decisions（本 plan 批准的关键点）

1. **分模块实施**：本迭代只做「效率度量」，自适应阈值推迟 v6.7.0（度量是自适应的必要输入，先度量后自适应）。
2. **纯观测性**：效率度量只读数据 + 计算 + 报告，绝不写入影响 compaction 决策的状态；零回归风险。
3. **代码现状对齐**：挂载到现有 `ProactiveCompactionController`（已有 utilization/waste 数据源），复用 `OptimizerMetricsCollector.getCacheHitRate()`，不重造轮子。
4. **边界清晰**：明确不引入自适应逻辑。

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| 效率可观测性 | 无（阈值静态，效率不可测） | 三指标可度量 + 报告可用 |
| 回归 | — | 现有 85+ 测试全绿 |

---

*Approved by Friday (A) — 2026-08-14*

**注**：本 plan-approval 为补录（CODE 任务已先行投递，plan 内容未变，仅补显式批准节点以保证审计闭环）。
