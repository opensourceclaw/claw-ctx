# Release Approval: claw-ctx v6.4.0

**From**: Friday (ArchitectAgent)
**To**: Peter (Owner)
**Date**: 2026-08-13
**Version**: v6.4.0
**Stage**: RELEASE (release-approval)

---

## Release Summary

claw-ctx v6.4.0 注册 3 个 OpenClaw 工具，使 claw-ctx 从「API-only（0 工具）」升级为「可被 OpenClaw 直接调用」。

### Key Achievements
- **Tool Registration**: `ctx_compact` / `ctx_build` / `ctx_inject` 三个工具
- **ContextCapability.inject**: 定向上下文注入能力（replace 降级 append）
- **contracts.tools** 声明于 openclaw.plugin.json
- **修复 8 个 pre-existing 失败**（proactive-compaction-controller 的 recordCompaction get-or-create + below-minimum reason + vitest 排除 dist）
- **lint 修复**: 2 个 prefer-const error（0 errors）

### Test Results
- Build: Clean
- Tests: **78 files / 1130 passed / 5 skipped / 0 failed**
- 修复前后：8 failed → 0 failed（pre-existing 已消除）

### Git Commits
| Hash | Description |
|------|-------------|
| `ba52b3e` | feat(v6.4.0): register ctx_compact/ctx_build/ctx_inject tools + fix pre-existing compaction failures |
| `1b187a4` | chore(v6.4.0): lint fixes + README version badge |

### Version
- package.json: `6.4.0` ✅
- openclaw.plugin.json: `6.4.0` ✅
- README badge: `6.4.0` ✅
- CHANGELOG: `[6.4.0]` ✅

### Tag
- 未创建（待审批后创建 + push）

---

## Approval Request

请审批 release claw-ctx v6.4.0。

- [ ] **Approved** — 委托 Karen 执行 tag + push + GitHub Release
- [ ] **Rejected** — 有问题

---

## 交付物清单
1. ✅ Git commits（ba52b3e + 1b187a4）
2. ✅ 测试全绿（78/1130/0）
3. ✅ CHANGELOG [6.4.0] + 版本对齐
4. ⏳ Release approval（等 Peter）

---

**审批通过后**：Friday 委托 Karen 执行 release 动作（tag v6.4.0 + push + GitHub Release）。
