# Task: claw-ctx v6.0.0 CODE Stage

**From**: Friday (A)
**To**: Jarvis (B)
**Date**: 2026-08-01
**Priority**: High
**PipelineId**: v6.0.0
**Project**: claw-ctx
**Version**: v6.0.0
**Stage**: CODE
**SubStage**: implementation

---

## Background

claw-ctx v6.0.0 目标：实现 Capability Layer，将上下文管理封装为统一的 IContextCapability 接口。

PLAN Stage 已完成：
- PRD: `docs/design/PRD_v6.0.0.md`
- 架构设计: `docs/design/v6.0.0-architecture.md`
- 详细设计: `docs/design/v6.0.0-detailed.md`

Design Review Gate 已通过。

---

## Development Scope

### Sprint 1: Interface + Implementation

| Task | File | Description |
|------|------|-------------|
| T1 | `src/capability/types.ts` | IContextCapability + 辅助类型 |
| T2 | `src/capability/context-capability.ts` | ContextCapability 实现 (7 方法) |
| T3 | `src/capability/index.ts` | Barrel exports |
| T4 | `src/index.ts` | 添加 Capability 导出 |

### Sprint 2: Tests

| Task | File | Description |
|------|------|-------------|
| T5 | `tests/capability/context-capability.test.ts` | 单元测试 |
| T6 | `tests/capability/contract.test.ts` | 契约测试 |

### Sprint 3: Integration

| Task | Description |
|------|-------------|
| T7 | 更新 `package.json` → 6.0.0 |
| T8 | 更新 `CHANGELOG.md` |

---

## Acceptance Criteria

- [ ] `npm run build` 通过
- [ ] `npm test` 全部通过
- [ ] 所有 8 个开发任务完成
- [ ] CHANGELOG.md 更新
- [ ] 向后兼容：无 Breaking Change

---

## Output

完成后请在 `inbox/inbox-results/` 创建回复文档。

---

## Project Location

`~/workspace/osprojects/claw-ctx/`
