# Report: claw-ctx v6.5.0 — MECW-Aware Compaction

**Status**: SUCCESS
**From**: CodeAgent (Jarvis)
**Date**: 2026-08-13
**PipelineId**: pipeline-20260813-ctxv650

## Implementation

| File | Change |
|------|--------|
| `src/mecw/MecwEstimator.ts` (NEW) | MECW = maxContextTokens × effectiveWindowRatio × complexityFactor；DEFAULT_COMPLEXITY_FACTORS (1.0/0.8/0.7/0.6)；可配置覆盖；未知 taskType→0.6 保守 |
| `src/mecw/index.ts` (NEW) | barrel |
| `src/proactive-compaction-controller.ts` | shouldCompact 新增可选 taskType 参数；传 taskType 时 threshold=MECW，未传回退静态逻辑（向后兼容） |
| `src/engine.ts` | compact 前 claw-mem flush（保留 important 记忆，不可用时优雅降级） |
| `src/index.ts` | +MecwEstimator/DEFAULT_COMPLEXITY_FACTORS/MecwEstimate 导出 |

## Tests (honest)

| Check | Result |
|-------|:------:|
| `npm run build` | ✅ 0 errors |
| tests/mecw/ (7 files) | ✅ 13/13 |
| Full suite | ✅ 84/85 files, 1142 passed — 1 pre-existing flaky: `performance/benchmark.test.ts > getDriftScore is fast`（时序基准，非本次引入） |

## Notes

- package.json 版本未动（6.4.0）——按任务清单未含版本 bump 项，留 RELEASE 阶段由 Friday 处理
- 未 commit（三权分立）
