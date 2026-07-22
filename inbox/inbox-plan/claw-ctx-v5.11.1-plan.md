# Plan: claw-ctx v5.11.1 — GitHub Integration Fixes

**From**: Friday (A)
**Date**: 2026-07-22
**Project**: claw-ctx
**Version**: 5.11.1

---

## Background

**Current Version**: v5.11.0 (released)

**Issues Identified**:
| # | Issue | Severity |
|:-:|-------|:--------:|
| 1 | CI 失败但仍发布 (CI failure allowed release) | P0 |
| 2 | PLAN 未创建 Issue (No auto-created Issue from PLAN) | P1 |
| 3 | RELEASE 未关闭 Issue (Issue not closed on release) | P2 |

---

## Status: ✅ RESOLVED via devclaw v7.0.0-rc.18

All issues have been fixed in **devclaw v7.0.0-rc.18** instead of claw-ctx.

---

## Resolution Details

| Issue | Fix Location | Status |
|-------|--------------|:------:|
| CI 失败但仍发布 | devclaw v7.0.0-rc.18: `requireCIPass` option | ✅ |
| PLAN 自动创建 Issue | devclaw v7.0.0-rc.17: `plan-default.md.tmpl` template | ✅ |
| RELEASE 关闭 Issue | devclaw v7.0.0-rc.18: `autoCloseIssues` option | ✅ |

---

## Why devclaw instead of claw-ctx?

claw-ctx is a Context Engine plugin (OpenClaw plugin), not an SDLC orchestrator.
The GitHub integration code (orchestrator, GitHubBridge) exists only in **devclaw**.

---

## Usage

To enable GitHub integration in devclaw pipeline:

```typescript
const result = await orchestrator.dispatchRelease(context, {
  github: {
    requireCIPass: true,      // P0: Block release if CI fails
    autoCloseIssues: true,    // P2: Auto-close useCase issues
    autoRelease: true,
  },
});
```

---

## Approval

**Status**: ✅ CLOSED - Fixed in devclaw v7.0.0-rc.18
