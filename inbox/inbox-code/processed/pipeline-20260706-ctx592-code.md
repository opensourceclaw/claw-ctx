# Task: claw-ctx v5.9.2 Fix claw-mem Fallback Path

**From**: Friday (A)
**To**: Jarvis (B)
**Date**: 2026-07-06
**Stage**: code
**Priority**: Critical
**PipelineId**: pipeline-20260706-ctx592
**Project**: claw-ctx
**Version**: v5.9.2

---

## Background

claw-ctx's fallback require path for claw-mem is wrong, causing Session Snapshot to never work. The mock fallback has no `sessionSnapshot` method, so CheckpointManager always reports "not supported".

**Design Spec**: `inbox/inbox-plan/pipeline-20260706-ctx592-plan.md`
**Project Location**: `/Users/liantian/workspace/osprojects/claw-ctx/`

**Root Cause**:
```
src/engine.ts line 38:
_require("../../claw-mem/dist/memory_manager.js");  ← wrong path
                                                    ↓
claw-mem actual structure: dist/src/memory_manager.js
```

---

## Scope

### 1. Fix `src/engine.ts`

Change line 38:
```typescript
// Before
_require("../../claw-mem/dist/memory_manager.js");

// After
_require("../../claw-mem/dist/src/memory_manager.js");
```

### 2. Version Bump

- `package.json`: `5.9.1` → `5.9.2`
- `openclaw.plugin.json`: `5.9.1` → `5.9.2`
- `src/index.ts` comment: `v5.9.1` → `v5.9.2`
- CHANGELOG.md: add v5.9.2 entry

---

## Acceptance Criteria

- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `dist/engine.js` has correct path `../../claw-mem/dist/src/memory_manager.js`
- [ ] CHANGELOG.md entry added

---

## Project Location

`/Users/liantian/workspace/osprojects/claw-ctx/`
