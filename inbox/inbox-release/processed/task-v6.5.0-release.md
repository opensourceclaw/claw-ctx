# Release Task: claw-ctx v6.5.0

**From**: Friday (ArchitectAgent)
**To**: Karen (ReleaseAgent / DeployAgent)
**Approved By**: Peter (ProductOwner) — 2026-08-14 07:37 GMT+8
**Date**: 2026-08-14
**Version**: v6.5.0
**Stage**: RELEASE (release)
**PipelineId**: pipeline-20260813-ctxv650
**Project**: claw-ctx

---

## 状态：Peter 已批复「同意」

v6.5.0（MECW-Aware Compaction）实质工作已 100% 完成，Peter 已批复。请 Karen 执行 release 动作。

## 已完成（Friday，无需重做）

- 版本对齐 6.5.0：`package.json` / `openclaw.plugin.json` / `src/version.ts` / `README.md` badge / `CHANGELOG.md`
- git commit（**未 push**，main 分支）：
  - `637ea84` feat(v6.5.0): MECW-aware compaction
  - `1432308` chore(v6.5.0): align version to 6.5.0
- 独立验收：Edith APPROVED（build 零错误，85 files / 1143 tests / 5 skipped / 0 failed）

## 待 Karen 执行的动作

```bash
cd /Users/liantian/workspace/osprojects/claw-ctx

# 1. push 主分支
git push origin main

# 2. 打 tag + push tag
git tag v6.5.0
git push origin v6.5.0

# 3. GitHub Release（如需要，创建 v6.5.0 release）
```

## Release Note 要点（供 GitHub Release）

- **MECW-Aware Compaction**：压缩阈值从静态比例 → 基于最大有效上下文窗口（MECW）的动态计算
- 新增 `MecwEstimator`（`src/mecw/`）+ `complexityFactor` 可配置表（SIMPLE 1.0 / MULTI 0.8 / SUMMARIZATION 0.7 / COMPLEX_REASONING 0.6）
- `ProactiveCompactionController.shouldCompact` 新增可选 `taskType` 参数（未传时向后兼容回退静态 `compressionThreshold`）
- `detectTaskType` 全链路接入
- 复杂任务 MECW < 简单任务（动态阈值核心语义）
- 测试：85 files / 1143 tests 全绿（独立验收 APPROVED）

---

## 完成后

在 `inbox/inbox-results/pipeline-20260813-ctxv650-release.md` 落 release 完成报告（推送到哪个 branch、tag hash、GitHub Release URL），供 Friday 归档。
