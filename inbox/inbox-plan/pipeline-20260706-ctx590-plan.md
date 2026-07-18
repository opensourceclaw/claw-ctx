# claw-ctx v5.9.0 概要设计 — Session Snapshot 强化

**版本**: v5.9.0
**日期**: 2026-07-06
**状态**: 设计中
**作者**: Friday (A)

---

## 1. 问题定义

### 1.1 症状

- 数据库中 `session_snapshot` 仅 8 条（应有数十条）
- Session 中断恢复后上下文丢失
- 无错误日志，无法排查失败原因

### 1.2 根因分析

```
checkpoint.ts:61 — checkpoint() 方法
┌──────────────────────────────────────────────┐
│  try {                                        │
│    const snapshot = this.buildSnapshot(state);│
│    this._manager.sessionSnapshot!({ snapshot });│
│    return true;                               │
│  } catch {                                    │
│    return false;  ← 静默吞掉所有错误           │
│  }                                            │
└──────────────────────────────────────────────┘
```

**两个问题**：
1. **错误不可见**：`sessionSnapshot()` 调用可能因参数不匹配、API 版本不兼容等原因失败，但 catch 块不输出任何日志
2. **无返回值检查**：即使调用"成功"，也不验证 `sessionSnapshot()` 的返回值是否确认存储成功

### 1.3 影响范围

| 受影响功能 | 严重程度 | 说明 |
|-----------|---------|------|
| Session 恢复 | 🔴 高 | 无 snapshot 则无法恢复中断上下文 |
| 调试排错 | 🟡 中 | 无法定位 snapshot 失败原因 |
| Recap 降级 | 🟡 中 | 无 snapshot 时 RecapLoader 可能返回空 |

---

## 2. 设计目标

### 2.1 功能目标

| 编号 | 目标 | 度量方式 |
|------|------|---------|
| G1 | Snapshot 存储成功可验证 | 日志输出 `stored: true/false` |
| G2 | 错误可追溯 | 异常输出到 error 日志，含堆栈 |
| G3 | RecapLoader 有降级策略 | 主搜索失败后尝试 fallback |

### 2.2 非目标

- ❌ 不改变 SessionSnapshot 数据结构
- ❌ 不改变 checkpoint() 的调用时机和频率
- ❌ 不引入新的外部依赖

---

## 3. 架构设计

### 3.1 组件关系

```
SessionStateExtractor
        │
        │ state
        ▼
  CheckpointManager ───sessionSnapshot()──► claw-mem
        │                                      │
        │ snapshot                              │ store/retrieve
        ▼                                      ▼
  [Session Snapshot]                    [claw-mem DB]
        │
        │ recovery context
        ▼
  Session Bootstrap
        │
        │ inject
        ▼
  Context Assembler
```

### 3.2 修改范围

```
src/session-resume/
├── checkpoint.ts        ← 主要修改：错误处理 + 日志
├── recap-loader.ts     ← 次要修改：fallback 逻辑
└── types.ts            ← 不变
```

---

## 4. 详细设计

### 4.1 CheckpointManager 强化

#### 4.1.1 当前问题

```typescript
// 现状: 静默失败
try {
  const snapshot: SessionSnapshot = this.buildSnapshot(state);
  this._manager.sessionSnapshot!({ snapshot });
  return true;
} catch {
  return false;  // 无日志, 无错误信息
}
```

#### 4.1.2 目标行为

```typescript
// 目标: 结构化日志 + 返回值验证
try {
  const snapshot: SessionSnapshot = this.buildSnapshot(state);
  const result = this._manager.sessionSnapshot!({ snapshot });
  
  // 检查返回值是否确认存储成功
  if (result && typeof result === 'object' && 'stored' in result) {
    if ((result as any).stored) {
      this._log("info", "Snapshot stored successfully");
    } else {
      this._log("warn", "Snapshot storage reported failure");
    }
  }
  return true;
} catch (error) {
  this._log("error", "Snapshot storage failed", error);
  return false;
}
```

#### 4.1.3 日志设计

| 级别 | 场景 | 消息示例 |
|------|------|---------|
| `info` | 存储成功 | `[checkpoint] Snapshot stored: session=abc123, turn=5` |
| `warn` | 返回 false / API 不可用 | `[checkpoint] Snapshot API unavailable or returned false` |
| `error` | 异常抛出 | `[checkpoint] Error storing snapshot: <message>` |

**日志接口**：CheckpointManager 接受可选的 `logger` 参数（`console` 兼容接口），不传则用 `console`。

#### 4.1.4 接口变更

```typescript
// 新增可选构造参数
interface CheckpointManagerOptions {
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

constructor(
  manager: MinimalMemoryManager,
  config?: Partial<CheckpointConfig>,
  getSessionState?: () => SessionState | null,
  options?: CheckpointManagerOptions,
)
```

**向后兼容**：`logger` 参数可选，不传则回退到 `console`，行为不变（仅多了 console 输出）。

### 4.2 RecapLoader Fallback

#### 4.2.1 当前问题

```typescript
// 主搜索返回空 → 直接返回 null
const results = await this._manager.search("session_summary", undefined, 10);
if (!results || results.length === 0) {
  return { recap: null, formatted: null, sessionId: sessionId || "" };
}
```

#### 4.2.2 目标行为

```typescript
// 主搜索失败 → 尝试 fallback
let results = await this._manager.search("session_summary", undefined, 10);

if (!results || results.length === 0) {
  // Fallback: 使用更宽泛的关键词搜索
  results = await this._manager.search("session", undefined, 5);
}

if (!results || results.length === 0) {
  return { recap: null, formatted: null, sessionId: sessionId || "" };
}
// ... 继续现有排序和格式化逻辑
```

#### 4.2.3 Fallback 策略

| 优先级 | 搜索词 | 限制 | 说明 |
|--------|--------|------|------|
| 1 (主) | `"session_summary"` | 10 条 | 现有逻辑，精确匹配 |
| 2 (降级) | `"session"` | 5 条 | 宽泛匹配，覆盖标签不一致的情况 |

**设计决策**：fallback 只在主搜索完全为空时触发，不替代主搜索。保持简单，不引入多层 fallback。

---

## 5. 非功能需求

### 5.1 性能

- 日志输出不影响热路径性能（仅字符串拼接）
- Fallback 搜索仅在主搜索为空时触发，额外开销可忽略

### 5.2 兼容性

| 兼容项 | 策略 |
|--------|------|
| API 签名 | 向后兼容，新增参数可选 |
| claw-mem 版本 | 不变（仍依赖 v6.27.0+） |
| TypeScript 类型 | 不变，仅新增可选接口 |

### 5.3 可测试性

- `logger` 可注入 mock，验证日志输出
- `sessionSnapshot` 可在测试中 mock，模拟成功/失败/异常
- Fallback 逻辑可通过 mock `search` 返回不同结果测试

---

## 6. 验收标准

| 编号 | 标准 | 验证方式 |
|------|------|---------|
| A1 | CheckpointManager 输出 info 日志当存储成功 | 单元测试 mock logger |
| A2 | CheckpointManager 输出 error 日志当异常发生 | 单元测试抛异常 |
| A3 | RecapLoader 主搜索为空时触发 fallback | 单元测试 mock search |
| A4 | npm run build 通过 | CI |
| A5 | npm test 通过（含新增测试） | CI |
| A6 | 现有测试不退化 | CI regression |
| A7 | CHANGELOG.md 添加条目 | 人工检查 |

---

## 7. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| console 日志过多 | 低 | 低 | 使用结构化日志，生产环境可过滤 |
| Fallback 搜索返回无关结果 | 中 | 低 | 限制 5 条，排序后取最新 |
| sessionSnapshot API 签名变化 | 低 | 中 | 保持 `supported` getter 守卫 |

---

## 8. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-07-06 | 初始版本 |
