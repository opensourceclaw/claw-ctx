# Detailed Design: claw-ctx v6.3.0 压缩触发解耦

**Version**: 6.3.0
**Date**: 2026-08-02
**Author**: Jarvis (B)
**Pipeline**: pipeline-20260802-v630-compaction-decoupling

---

## 1. 概述

实现压缩触发解耦，将压缩控制权从 MemoryContextBridge 转移到 OpenClaw 统一调度。

## 2. 改动范围

### 2.1 CompactParams 增强

```typescript
interface CompactParams {
  sessionId: string;
  targetBudget?: number;     // 目标 token budget
  strategy?: 'aggressive' | 'balanced' | 'conservative';  // 压缩策略
  targetTokens?: number;
  force?: boolean;
}
```

### 2.2 CompactResult 增强

```typescript
interface CompactResult {
  ok: boolean;
  originalTokens?: number;   // 压缩前 token 数
  compressedTokens?: number;  // 压缩后 token 数
  removedMessages?: number;   // 移除消息数
  duration?: number;          // 执行时间 (ms)
}
```

### 2.3 文件修改

| 文件 | 修改内容 |
|------|----------|
| `src/capability/types.ts` | 新增 CompactParams 和 CompactResult 字段 |
| `src/capability/context-capability.ts` | compact() 映射新参数到 engine |

## 3. 实现细节

### 3.1 参数映射

```typescript
// context-capability.ts
async compact(p: CompactParams): Promise<CompactResult> {
  const result = await this._engine.compact({
    sessionId: p.sessionId,
    targetTokens: p.targetBudget,
    force: p.force,
    strategy: p.strategy
  });
  
  return {
    ok: result.ok,
    originalTokens: result.originalTokens,
    compressedTokens: result.compressedTokens,
    removedMessages: result.removedMessages,
    duration: result.duration
  };
}
```

## 4. 测试要点

- [ ] targetBudget 参数正确传递
- [ ] strategy 参数正确传递
- [ ] 返回结果包含所有新增字段

## 5. 验收标准

- [x] compress 方法支持外部触发
- [x] compress 方法返回压缩结果
- [x] compress 方法支持 targetBudget 参数
