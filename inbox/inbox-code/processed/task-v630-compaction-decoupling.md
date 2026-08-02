# Task: claw-ctx v6.3.0 压缩触发解耦

**From**: Friday (A)
**To**: Jarvis (B)
**Date**: 2026-08-02
**Priority**: High
**Pipeline**: pipeline-20260802-v630-compaction-decoupling
**Project**: claw-ctx
**Version**: v6.3.0

---

## 背景

实现压缩触发解耦，采用方案 A (OpenClaw 统一检测和触发)。

**当前问题**：
```
当前: MemoryContextBridge 控制压缩
内存增长 → MemoryContextBridge 检测阈值 → 触发 compress()

问题: 职责越权，MemoryContextBridge (属于 claw-mem) 在控制压缩
```

**目标**：
- OpenClaw 统一检测压缩时机
- Context Engine 执行压缩操作
- 移除 MemoryContextBridge 中的压缩控制

---

## 开发范围

### Phase 1: compress 方法增强

**文件**: `src/engine.ts` 或 `src/capability/*.ts`

**修改**:
1. 确保 compress 方法支持外部触发
2. 添加返回压缩结果（token 数量、效果等）
3. 支持配置目标 token budget

```typescript
interface CompactParams {
  sessionId: string;
  targetBudget?: number;  // 目标 token budget
  strategy?: 'aggressive' | 'balanced' | 'conservative';
}

interface CompactResult {
  originalTokens: number;
  compressedTokens: number;
  removedMessages: number;
  duration: number;
}
```

### Phase 2: 检测机制支持

**修改**: 确保 OpenClaw 可以调用 compress 方法

---

## 版本更新

更新 `package.json` 版本: `6.2.0` → `6.3.0`

---

## 验收标准

- [ ] compress 方法支持外部触发
- [ ] compress 方法返回压缩结果
- [ ] compress 方法支持 targetBudget 参数
- [ ] npm run typecheck 通过
- [ ] npm run build 通过
- [ ] CHANGELOG.md 添加条目

---

## 项目位置

`/Users/liantian/workspace/osprojects/claw-ctx/`

---

## 重要提醒

- 压缩触发解耦需要 OpenClaw 统一协调 (不在 claw-ctx 内)
- claw-ctx 只负责 compress 方法实现
- 详细设计文档写到 `.devclaw/substage/code/detailed-design-v6.3.0.md`
