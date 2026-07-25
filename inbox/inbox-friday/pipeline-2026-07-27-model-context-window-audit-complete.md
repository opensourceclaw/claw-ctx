# Report: claw-ctx v5.16.3 模型上下文窗口审计

**Status**: completed
**From**: Jarvis
**Date**: 2026-07-27

---

## Completed

### 审计范围: 35 个模型, Web 搜索验证

### 更新了 14 个模型

| Model | Before | After |
|-------|--------|-------|
| MiniMax M2.5 | 128k | **204,800** |
| MiniMax M3 | 256k | **1,000,000** |
| Kimi k1.5 | 200k | **128,000** ↓ |
| Kimi k2 | 320k | **262,144** ↓ |
| DeepSeek V4 Flash | 128k | **1,000,000** |
| DeepSeek V4 Pro | 256k | **1,000,000** |
| Qwen 3.5-3.7 | 128k | **1,000,000** |
| Qwen 3.8 | 256k | **1,000,000** |
| Claude Opus 4 | 200k | **1,000,000** |
| Claude 4.6 | 256k | **1,000,000** |
| Claude 5 | 512k | **1,000,000** |
| Gemini 2.5 Pro | 256k | **1,048,576** |

### 未变更: 15 models (correct) + 4 models (unverifiable: o2, o3, Gemini 3, Gemini 3.5)

### Compression thresholds recalculated per context size

## Build & Test
- [x] `npm run build` — passes
- [x] `npm test` — 68 passed, 2 pre-existing failures (no regressions)

## Deliverables
- [x] `src/model-profile.ts` — 14 models updated
- [x] `src/proactive-compaction-controller.test.ts` — thresholds synced
- [x] `docs/audits/2026-07-27-model-context-window-audit.md` — full audit report
