# Task: claw-ctx v6.5.0 — MECW-Aware Compaction 测试与验收（TEST 阶段）

**From**: Friday (A)
**To**: Edith (C)
**Date**: 2026-08-14
**Stage**: TEST（testing + acceptance）
**Priority**: P1
**PipelineId**: pipeline-20260813-ctxv650
**Project**: claw-ctx
**Version**: v6.5.0

---

## ⚠️ Inbox 绝对路径

```
Read:   /Users/liantian/workspace/osprojects/claw-ctx/inbox/inbox-test/
Write:  /Users/liantian/workspace/osprojects/claw-ctx/inbox/inbox-results/
Repo:   /Users/liantian/workspace/osprojects/claw-ctx/
Design: /Users/liantian/workspace/osprojects/claw-ctx/inbox/inbox-plan/v6.5.0-mecw-compaction-design.md
Review: /Users/liantian/workspace/osprojects/claw-ctx/inbox/inbox-code-review/pipeline-20260813-ctxv650-code-review.md
```

## 背景

Jarvis 已实现 MECW-Aware Compaction（`src/mecw/` + controller/engine 改造）。PLAN 三子阶段 + detailed-design + design-review + code-review 已追溯补齐。本任务为 **TEST 阶段独立验收**——你是独立 QC，不信任 Friday/Jarvis 自证，独立复核（重点核数字真实性，前几轮有数字不实教训）。

## 复验任务（独立）

1. **独立 build + test**：`npm run build` 零错误；`npx vitest run` 全绿。Friday 实测 **85 files / 1143 tests（5 skipped）**——独立复核数字是否真实。

2. **复验 MECW 公式**：`MecwEstimator.estimateMecw` = `maxContextTokens × effectiveWindowRatio × complexityFactor`，向下取整正确。

3. **复验 complexityFactor 表**：4 类（SIMPLE 1.0 / MULTI 0.8 / SUMMARY 0.7 / COMPLEX 0.6），可配置覆盖；**复杂任务 MECW < 简单任务**（Friday 实测 69120 < 115200，独立复核）。

4. **复验 controller 接入**：`shouldCompact` 传 taskType → MECW threshold；未传 → 回退静态 compressionThreshold（向后兼容）。

5. **复验 claw-mem flush**：compact 前 flush，claw-mem 不可用时优雅降级（不抛错）。

6. **复验零回归**：v6.4.0 的 3 工具注册（ctx_compact/ctx_build/ctx_inject）+ compaction 修复仍正常。

7. **独立评估测试覆盖缺口**（Friday code-review 已发现，请独立判断是否 blocking）：design 要求 12 测试文件，实现仅 7 个（缺 cooldown/limit × MECW 交互、factor 越界 clamp、singleton 等 5 个补充用例）。给出独立 verdict（阻断/放行 + 理由）。

## E2E / Performance 子阶段说明

本迭代为纯 TS context-engine 库，无独立 E2E 场景 / 性能基准需求。请独立判断：全量 vitest（85 files）是否已充分覆盖，e2e/performance 子阶段可否本迭代标记 N/A（并说明理由）。

## 验收标准
- [ ] build 零错误；test 全绿（数字独立复核一致）
- [ ] MECW 公式 + factor 表正确可配置
- [ ] controller 接 MECW + 向后兼容
- [ ] claw-mem flush 集成 + 降级
- [ ] 复杂任务 MECW < 简单任务
- [ ] 零回归（v6.4.0 不退化）
- [ ] 对测试覆盖缺口 + e2e/performance N/A 给出独立 verdict

## 输出文档
完成后在 `inbox/inbox-results/pipeline-20260813-ctxv650-test-acceptance.md` 创建独立验收报告（附真实 build/test 数字 + verdict）。

## ⚠️ 提醒
- ✅ 独立验收，特别核数字真实性
- ❌ 不 commit/push/release

---

**启动时间**: 2026-08-14 01:05 GMT+8
