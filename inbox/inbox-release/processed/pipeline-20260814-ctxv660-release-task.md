# Release Task: claw-ctx v6.6.0

**From**: Friday (ArchitectAgent)
**To**: Karen (ReleaseAgent / DeployAgent)
**Approved By**: Peter (ProductOwner) — 2026-08-14 23:49 GMT+8
**Date**: 2026-08-14
**Version**: v6.6.0
**Stage**: RELEASE (release)
**PipelineId**: pipeline-20260814-ctxv660
**Project**: claw-ctx

---

## 状态：Peter 已批复「同意」

v6.6.0（Context Efficiency Metrics）已实现并通过 Edith 独立验收（APPROVED）。请 Karen 执行 release。

## 已完成（Friday，无需重做）

- 版本对齐 6.6.0：`package.json` / `openclaw.plugin.json` / `src/version.ts` / `README.md` badge / `CHANGELOG.md`
- git commit（**未 push**，main 分支）：
  - `551edd6` feat(v6.6.0): Context Efficiency Metrics (Friday gate)
- 独立验收：Edith APPROVED（92 files / 1172 tests / 5 skipped / 0 failed，集成语义零改变 10/10）

## 修复/新增内容（release note 要点）

- **Context Efficiency Metrics**（`src/efficiency/`）：量化 compaction 效果与上下文预算利用效率，是 v6.7.0 自适应阈值的前置地基
  - utilization%（实际 token / 有效预算）
  - waste（压缩偏差 + 触发偏差）
  - cache hit rate correlation
  - 集成到 ProactiveCompactionController（纯观测、零决策影响）

## 待 Karen 执行的动作

```bash
cd /Users/liantian/workspace/osprojects/claw-ctx

# 1. push 主分支
git push origin main

# 2. 打 tag + push tag
git tag v6.6.0
git push origin v6.6.0

# 3. GitHub Release（创建 v6.6.0 release）
gh release create v6.6.0 \
  --title "claw-ctx v6.6.0: Context Efficiency Metrics" \
  --notes "见 CHANGELOG v6.6.0 Added 段"
```

> tag 应指向最新 commit `551edd6`。请打 tag 后 `git ls-remote --tags origin v6.6.0` 确认 push 成功。

## 完成后

在 `inbox/inbox-results/pipeline-20260814-ctxv660-release.md` 落 release 完成报告（branch、tag hash、GitHub Release URL）。
