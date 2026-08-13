# Task: claw-ctx v6.4.0 — 修复 pre-existing 测试失败（Edith 验收发现的 gap）

**From**: Friday (A)
**To**: Jarvis (B)
**Date**: 2026-08-13
**Stage**: CODE → BUILD → TEST（修复回环）
**Priority**: P0（阻塞发布）
**PipelineId**: pipeline-20260805-ctxv640
**Project**: claw-ctx
**Version**: v6.4.0

---

## ⚠️ Inbox 绝对路径

```
Read:   /Users/liantian/workspace/osprojects/claw-ctx/inbox/inbox-code/
Write:  /Users/liantian/workspace/osprojects/claw-ctx/inbox/inbox-results/
Repo:   /Users/liantian/workspace/osprojects/claw-ctx/
```

## 背景

v6.4.0 Tool Registration 已实现并通过验收（Edith ✅ PASS），但全量测试仍有 **8 个 pre-existing 失败**（v6.3.0 已存在）。发布前需修复，确保 `npm test` 全绿。

Edith 验收报告：`inbox/inbox-results/pipeline-20260805-ctxv640-test-acceptance.md`

## 根因分析（Friday 已定位，直接修）

失败集中在 `src/proactive-compaction-controller.ts`，两处 bug：

### Bug 1：`recordCompaction` 不 get-or-create state（主根因）

当前实现（约 188-200 行）：
```typescript
recordCompaction(sessionId, tokensBefore, tokensAfter): void {
  const state = this.sessionStates.get(sessionId);
  if (state) {  // ← 问题：state 不存在时静默忽略
    state.lastCompactionTime = Date.now();
    state.compactionCount++;
    state.lastTokenCount = tokensAfter;
  }
}
```

导致 `recordCompaction` 组两个测试（未先调 `shouldCompact` 创建 state）的 `getSessionState` 返回 undefined、count 不递增。

**修法**：get-or-create，参照 `shouldCompact` 里已有的创建逻辑：
```typescript
recordCompaction(...): void {
  let state = this.sessionStates.get(sessionId);
  if (!state) {
    state = { lastCompactionTime: null, compactionCount: 0, lastTokenCount: 0 };
    this.sessionStates.set(sessionId, state);
  }
  state.lastCompactionTime = Date.now();
  state.compactionCount++;
  state.lastTokenCount = tokensAfter;
}
```

### Bug 2：`shouldCompact` 低于 minTokens 时 reason 为空（secondary）

测试 `should not recommend compaction for low token count` 用 30000 tokens，期望 reason 含 "below minimum"。

但当前逻辑 `threshold = max(threshold, minTokens)` 后，`currentTokens(30000) >= threshold(50000)` 为 false → `shouldCompact=false`、`reason=""`，永远走不到第 4 步的 "below minimum" 分支。该分支只在 `shouldCompact===true` 时才检查，语义错位。

**修法**（二选一，选更符合直觉的）：
- 方案 A：在阈值判断后、`shouldCompact` 仍为 false 时，若 `currentTokens < minTokens`，赋 `reason = "Token count below minimum (X < Y)"`。
- 方案 B：调整判断顺序，把 minTokens 检查前置到 threshold 判定处。

> 目标：让 `shouldCompact(sessionId, modelId, 30000)` 返回 `{ shouldCompact: false, reason: 含 "below minimum" }`。
> 注意别破坏 "respect session compaction limit" 测试（它期望 reason 含 "limit reached"）。

## 额外 Gap（Edith 提出，请一并在本任务处理）

1. **dist/ 重复测试产物参与测试**：`dist/proactive-compaction-controller.test.js` 等编译产物被 vitest 扫到，导致同一失败报两次（src + dist）。建议在 `vitest.config.ts` 排除 `dist/`（或确认测试 include 范围）。修完此 gap 后，8 个失败应降为 4 个（只剩 src）或 0 个（若 Bug1/2 已修）。

## 验收标准

- [ ] `npm run build` 零错误
- [ ] `npm test` 全绿（0 failed；1137+ 通过，无 regression）
- [ ] `recordCompaction` get-or-create 修复
- [ ] `shouldCompact` 低 token reason 正确
- [ ] vitest 排除 dist/ 产物（或等效，避免重复报错）
- [ ] 不引入新失败、不破坏现有 1137 通过用例
- [ ] 不要 git commit（Friday 统一提交）

## 输出文档

完成后在 `inbox/inbox-results/pipeline-20260805-ctxv640-fix-complete.md` 创建完成报告，说明根因修复 + 最终测试数字。

## ⚠️ 提醒

- ✅ 三权分立：不 commit / 不 push / 不 release
- ✅ TypeScript + ESM + Vitest
- ✅ 遵循 `docs/protocol/inbox-protocol.md`

---

**启动时间**: 2026-08-13 10:13 GMT+8
