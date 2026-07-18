# claw-ctx v5.9.2 概要设计 — 修复 claw-mem fallback 路径

**版本**: v5.9.2
**日期**: 2026-07-06
**状态**: 设计中
**作者**: Friday (A)

---

## 1. 问题定义

### 1.1 根因

claw-ctx `src/engine.ts` 中 claw-mem fallback require 路径错误：

```typescript
// 当前 (错误)
_require("../../claw-mem/dist/memory_manager.js");

// 实际 claw-mem 输出结构
// dist/src/memory_manager.js  ← 有 src/ 层级
```

导致两个 require 都失败，降级为 mock（无 `sessionSnapshot`），CheckpointManager 永久 `supported = false`。

### 1.2 影响

- Session Snapshot 从未工作
- 会话中断后无法恢复上下文
- v5.9.0 的日志强化虽然能输出诊断信息，但无法修复根本问题

---

## 2. 设计方案

**修改 claw-ctx `src/engine.ts`**：将 fallback 路径从 `../../claw-mem/dist/memory_manager.js` 改为 `../../claw-mem/dist/src/memory_manager.js`。

```typescript
// Before
_require("../../claw-mem/dist/memory_manager.js");

// After  
_require("../../claw-mem/dist/src/memory_manager.js");
```

### 2.1 为什么这是最简方案

| 因素 | 分析 |
|------|------|
| 改动量 | 1 行 |
| 风险 | 零（路径更精确） |
| 侵入性 | 零 |
| 向后兼容 | ✅（不影响 npm 包路径） |

---

## 3. 修改范围

```
修改:
  src/engine.ts          # 1 行路径修正
  package.json           # 5.9.1 → 5.9.2
  openclaw.plugin.json   # 5.9.1 → 5.9.2
  CHANGELOG.md           # 条目
```

---

## 4. 验收标准

- [ ] `npm run build` 通过
- [ ] `npm test` 通过
- [ ] 重启后日志显示 `checkpoint stored` 而非 `checkpoint skipped - not supported`
- [ ] CHANGELOG 条目

---

## 5. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-07-06 | 初始版本 |
