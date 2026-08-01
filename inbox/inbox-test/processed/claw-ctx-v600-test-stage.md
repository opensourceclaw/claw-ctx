# Task: claw-ctx v6.0.0 TEST Stage

**From**: Friday (A)
**To**: Edith (C)
**Date**: 2026-08-01
**Priority**: High
**PipelineId**: v6.0.0
**Project**: claw-ctx
**Version**: v6.0.0
**Stage**: TEST

---

## Background

claw-ctx v6.0.0 已完成 CODE Stage：
- 实现 ContextCapability（Capability Layer）
- BUILD 通过
- 单元测试通过 (14/14 capability tests)

现在需要 Edith 执行集成测试和验收测试。

---

## Test Scope

### 1. 集成测试
- ContextCapability 与现有上下午引擎的集成
- 接口契约测试

### 2. 验收测试
- IContextCapability 接口行为验证
- 7 个方法功能验证
- 资源清理 (dispose)

### 3. 回归测试
- 现有 v5.17.0 功能不受影响

---

## Acceptance Criteria

- [ ] 集成测试全部通过
- [ ] 验收测试全部通过
- [ ] 向后兼容验证

---

## Note

- 8 个 pre-existing test failures 存在于 proactive-compaction-controller（与本次变更无关）
- 版本号从 5.x.x 变为 6.0.0

---

## Output

完成后请在 `inbox/inbox-results/` 创建回复文档。

---

## Project Location

`~/workspace/osprojects/claw-ctx/`
