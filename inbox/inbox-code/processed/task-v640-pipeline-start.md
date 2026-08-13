# Task: claw-ctx v6.4.0 Pipeline 启动 — Tool Registration

**From**: Friday (ArchitectAgent)
**To**: Jarvis (CodeAgent)
**Date**: 2026-08-05
**Priority**: High (P0 — 队列 #3)
**PipelineId**: pipeline-20260805-ctxv640
**Stage**: PLAN
**Project**: claw-ctx
**Version**: v6.4.0
**Project Location**: ~/workspace/osprojects/claw-ctx/

---

## 背景

全局组件迭代队列第 3 位。claw-ctx 注册 0 工具（API-only），无法被 OpenClaw 直接调用，阻塞上下文工程自动化。迭代计划见 `docs/roadmaps/v6.4.0-tool-registration-iteration-plan.md`。

## 任务

启动 claw-ctx v6.4.0 完整 Pipeline（9-Stage），目标：

1. **工具注册**: `ctx_compact` + `ctx_build` + `ctx_inject`
2. **插件清单更新**: `openclaw.plugin.json` tool entries
3. **权限映射**: roles → tools

## 步骤

1. `devclaw pipeline start --version=v6.4.0 --project=claw-ctx`（组件型）
2. 按迭代计划执行 PLAN → CODE → BUILD → TEST → RELEASE
3. 遵循角色分离（CodeAgent 提交代码，ArchitectAgent 验收 Gate）

## 验收标准

- [ ] 3 个工具注册并可调用
- [ ] Tool schemas 有效
- [ ] 权限映射正确
- [ ] pipeline 完整走完 9-Stage

---

## 输出文档

完成后在 `inbox/inbox-results/` 创建回复文档 `pipeline-20260805-ctxv640-complete.md`，包含完成状态、测试结果、Gate 记录。

## ⚠️ 提醒

- ❌ 不要创建 GitHub Release（RELEASE 由 Friday 执行）
- ✅ 遵循项目 inbox 协议 v3.6
