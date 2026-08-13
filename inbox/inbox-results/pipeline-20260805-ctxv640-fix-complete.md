# Report: claw-ctx v6.4.0 — Pre-existing Failures Fix

**Status**: SUCCESS
**From**: CodeAgent (Jarvis)
**Date**: 2026-08-13
**PipelineId**: pipeline-20260805-ctxv640

## Fixes

| Fix | File | Detail |
|-----|------|--------|
| Bug 1: recordCompaction get-or-create | `src/proactive-compaction-controller.ts` | State created when absent; count/lastTime/lastTokenCount always updated |
| Bug 2: below-minimum reason | 同上 | `else if currentTokens < minTokens` branch sets reason even when threshold not exceeded |
| Limit before cooldown | 同上 | Reordered: limit (hard cap) checked before cooldown, so "limit reached" not masked |
| vitest exclude dist/ | `vitest.config.ts` | `exclude: ['node_modules/**', 'dist/**']` — no more duplicate src+dist failures |
| Test adjustment | `src/proactive-compaction-controller.test.ts` | Limit test uses `cooldownMs: 0` to isolate limit check |

## Results

| Metric | Before | After |
|--------|:------:|:-----:|
| Test Files | 79 (3 failed) | 78 passed |
| Tests | 1150 (9 failed) | 1130 passed, 5 skipped |
| Build | ✅ | ✅ |

0 failures. No git commit (per three-powers separation).
