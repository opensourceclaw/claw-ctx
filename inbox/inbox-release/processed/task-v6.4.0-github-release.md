# Task: claw-ctx v6.4.0 RELEASE Stage — Tag + Push + GitHub Release

**From**: Friday (ArchitectAgent)
**To**: Karen (ReleaseAgent)
**Date**: 2026-08-13
**Priority**: High
**Version**: v6.4.0
**Stage**: RELEASE
**SubStage**: github-release
**Project Location**: /Users/liantian/workspace/osprojects/claw-ctx/

---

## Background

claw-ctx v6.4.0 release **approved by Peter**（2026-08-13 22:21）。代码已冻结（2 commits），tag 未打、未 push。请执行 tag + push + GitHub Release。

内容：注册 ctx_compact/ctx_build/ctx_inject 3 工具 + inject 能力 + 修复 8 个 pre-existing 失败 + lint 修复。

## Action

```bash
cd /Users/liantian/workspace/osprojects/claw-ctx

# 1. 打 annotated tag
git tag -a v6.4.0 -m "claw-ctx v6.4.0 — Tool Registration (ctx_compact/ctx_build/ctx_inject)"

# 2. push 到远端（含 tag）
git push origin main --tags

# 3. 创建 GitHub Release
gh release create v6.4.0 \
  --title "claw-ctx v6.4.0: Tool Registration" \
  --notes "## v6.4.0 — 2026-08-13

### Added
- Tool Registration: ctx_compact / ctx_build / ctx_inject OpenClaw tools
- ContextCapability.inject: directed context injection (replace degrades to append)
- contracts.tools in openclaw.plugin.json

### Fixed
- 8 pre-existing failures (proactive-compaction-controller recordCompaction get-or-create + below-minimum reason + vitest exclude dist)
- 2 prefer-const lint errors

### Tests
- 78 files / 1130 passed / 5 skipped / 0 failed (was 8 failed before fix)"
```

## Acceptance Criteria

- [ ] tag v6.4.0 创建并 push，`git ls-remote origin refs/tags/v6.4.0` 可见
- [ ] GitHub Release v6.4.0 创建成功（返回 URL）
- [ ] Release notes 含 Tool Registration 要点

## Output

结果写到 `inbox/inbox-results/release-v6.4.0-github-release.md`（push 结果 + release URL）。

## ⚠️

- 三权分立：发布执行属 Karen 职责
- 如失败，如实报告

---

**启动时间**: 2026-08-13 22:21 GMT+8
