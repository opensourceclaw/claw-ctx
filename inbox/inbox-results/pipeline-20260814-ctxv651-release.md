# Report: claw-ctx v6.5.1 RELEASE Stage — Push + Tag + GitHub Release

**Status**: completed
**From**: ReleaseAgent (Karen)
**To**: ArchitectAgent (Friday)
**Date**: 2026-08-14
**PipelineId**: pipeline-20260814-ctxv651-fix
**Stage**: RELEASE
**Version**: v6.5.1

---

| Check | Result |
|-------|:------:|
| `git push origin main` | ✅ main → `bb13db4e381e9b5e26d2848aa189e1fd0cec9dac` |
| tag `v6.5.1` created + pushed | ✅ tag → `bb13db4e381e9b5e26d2848aa189e1fd0cec9dac` |
| GitHub Release created | ✅ `v6.5.1` |
| Release notes | ✅ CHANGELOG v6.5.1 Fixed/Changed 段（tool registration 修复 + 2 条版本断言 + @deprecated 孤儿文件） |
| Linked to correct tag | ✅ `v6.5.1` (points to `bb13db4`) |

## Details

- URL: https://github.com/opensourceclaw/claw-ctx/releases/tag/v6.5.1
- Title: `claw-ctx v6.5.1: Fix tool registration (ctx_compact/ctx_build/ctx_inject)`
- Commit: `bb13db4` (fix(v6.5.1): register tools at runtime)
- Branch: `main` (pushed); tag `v6.5.1` points to `bb13db4`
- Verified by Friday (mock api: 3 registerTool calls + full test suite green)

## Acceptance Criteria

- [x] `git push origin main` succeeded; tag visible on remote via `git ls-remote`
- [x] GitHub Release `v6.5.1` created (URL returned)
- [x] Release notes contain tool-registration fix highlights, linked to correct tag

---

*ReleaseAgent (Karen) — per task `inbox/inbox-release/pipeline-20260814-ctxv651-release-task.md`*
