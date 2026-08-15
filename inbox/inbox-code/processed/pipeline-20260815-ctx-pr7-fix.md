# Task: claw-ctx — 修正 PR #7（drop 冗余 commit + rebase + push 更新 PR）

**From**: Friday (ArchitectAgent, A)
**To**: Jarvis (CodeAgent, B)
**Date**: 2026-08-15
**Stage**: CODE（PR 收尾）
**Priority**: P1（PR #7 merge 前置）
**PipelineId**: pipeline-20260815-ctx-cleanup
**Project**: claw-ctx

---

## ⚠️ Inbox 绝对路径

```
Read:   /Users/liantian/workspace/osprojects/claw-ctx/inbox/inbox-code/
Write:  /Users/liantian/workspace/osprojects/claw-ctx/inbox/inbox-results/
Repo:   /Users/liantian/workspace/osprojects/claw-ctx/
```

## 背景（Friday 核验发现的问题）

你在 cleanup 任务里把 PR #7 rebase 到 main 后，在 PR 分支上加了 commit `2d0398a`（同步版本断言 6.5.1→6.6.0）。但**同时**你在 main 上也做了等价修复 commit `0673ea2`（同样的 2 文件、同样的 4 行改动）。

结果：`2d0398a` 和 main 的 `0673ea2` **完全等价**。若现在直接 merge PR #7，会造成重复/冲突。

正确做法：PR #7 应该**只含 js-yaml 升级**这一个变更。

## 任务

把 PR #7 分支收敛为「只含 js-yaml bump」的干净单变更：

1. **drop 冗余 commit `2d0398a`**（它与 main `0673ea2` 等价，是重复的版本断言修复）：
   ```bash
   git checkout dependabot/npm_and_yarn/npm_and_yarn-60ab56c091
   git rebase --onto 0673ea2 2d0398a   # 或交互式 rebase drop 掉 2d0398a
   ```
   目标结果：分支只剩 `6aca776`（js-yaml bump），base 是已含 `0673ea2` 的 main。

2. **force-push 更新 PR #7**：
   ```bash
   git push --force-with-lease origin dependabot/npm_and_yarn/npm_and_yarn-60ab56c091
   ```

3. 本地验证：rebase 后该分支 `npm test` 全绿（应 92 文件 / 1172 passed / 0 failed）。

## 验收标准

- [ ] PR #7 分支只含 `6aca776`（js-yaml bump）一个 commit，基于最新 main（含 0673ea2）。
- [ ] force-push 后 PR #7 在 GitHub 上显示为「单 commit、无冲突、可 merge」。
- [ ] 本地 `npm test` 全绿。

## 未做（三权分立）

- 不 merge PR（merge 由 Friday 把关）。结果回 inbox-results，报告 PR #7 最新状态（head commit、CI 是否绿、是否可 merge）。
