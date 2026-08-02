# Report: claw-ctx v6.3.0 压缩触发解耦

**Status**: completed · **From**: Jarvis (B) · **Pipeline**: pipeline-20260802-v630-compaction-decoupling

---

## 修改

| File | Change |
|------|--------|
| `src/capability/types.ts` | `CompactParams` 新增 `targetBudget`, `strategy`; `CompactResult` 新增 `originalTokens`, `compressedTokens`, `removedMessages`, `duration` |
| `src/capability/context-capability.ts` | `compact()` 映射新参数到 engine，返回增强结果 |
| `package.json` | 6.2.0 → 6.3.0 |

## 增强后的接口

```typescript
interface CompactParams {
  sessionId: string;
  targetBudget?: number;     // NEW: 目标 token budget
  strategy?: 'aggressive' | 'balanced' | 'conservative';  // NEW
  targetTokens?: number;
  force?: boolean;
}

interface CompactResult {
  ok: boolean;
  originalTokens?: number;   // NEW: 压缩前 token 数
  compressedTokens?: number;  // NEW: 压缩后 token 数
  removedMessages?: number;   // NEW: 移除消息数
  duration?: number;          // NEW: 执行时间 (ms)
}
```

## 验证

- ✅ `npm run build` — 通过
- ✅ capability tests — 14/14 通过
