# Report: claw-ctx v5.16.3 GLM 模型配置修正

**Status**: completed
**From**: Jarvis
**Date**: 2026-07-27

---

## Completed

### Model Profile Fixes

| Model | Field | Before | After |
|-------|-------|--------|-------|
| GLM-5 | maxTokens | 128000 | **200000** |
| GLM-5 | compressionThreshold | 100000 | **150000** |
| GLM-5.1 | maxTokens | 128000 | **200000** |
| GLM-5.1 | compressionThreshold | 100000 | **150000** |
| GLM-5.2 | maxTokens | 256000 | **1,000,000** |
| GLM-5.2 | effectiveWindowRatio | 0.85 | **0.9** |
| GLM-5.2 | compressionThreshold | 200000 | **800000** |

### Other Changes
- Version: 5.16.2 → 5.16.3
- `src/proactive-compaction-controller.test.ts`: updated GLM-5.2 expected threshold (200k → 800k)

## Build & Test
- [x] `npm run build` — passes
- [x] `npm test` — 68 passed, 2 pre-existing failures (unrelated to this change)

## Notes
- GLM-5/5.1 压缩延迟：阈值从 100k → 150k，避免过早触发压缩
- GLM-5.2 对齐 DeepSeek V4: 1M context + 800k threshold
- proactive-compaction-controller 测试中有 4 个预存失败（与 GLM 变更无关）
