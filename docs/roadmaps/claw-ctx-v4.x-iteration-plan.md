# claw-ctx v4.x.x 迭代计划

**规划时间**: 2026-06-11
**版本范围**: v4.21.0 - v4.24.0
**Author**: Friday

---

## 概述

v4.x.x 是当前稳定版本的迭代阶段，聚焦于 Gateway 深度集成和能力补全。

---

## v4.21.0 - Gateway 深度集成

**目标**: 让 claw-ctx 成为真正可用的 Context Engine

### 功能清单

| 功能 | 说明 | 状态 |
|------|------|------|
| Gateway 实际调用 | 验证 assemble/ingest/maintain 生效 | ⏳ |
| Hook 共存测试 | 与现有 Hook 机制无冲突 | ⏳ |
| 日志确认 | 确认方法被调用 | ⏳ |

### 验收标准

- [ ] Gateway 日志确认 claw-ctx 方法被调用
- [ ] Hook 注入 + claw-ctx 注入同时存在不冲突

### 依赖

- claw-mem >= v6.19.0

---

## v4.22.0 - Long Sequence 优化

**目标**: 缓解 lost-in-the-middle 问题，提升长上下文处理能力

### 功能清单

| 功能 | 说明 | 状态 |
|------|------|------|
| 位置编码优化 | 缓解 lost-in-the-middle | ⏳ |
| 滑动窗口增强 | 更智能的 context 裁剪 | ⏳ |

### 参考论文

- 2503.17407v2 - Long Context Language Modeling Survey

### 依赖

- claw-mem >= v6.19.0

---

## v4.23.0 - Self-Refinement 完善

**目标**: 增强输出质量反馈和推理策略

### 功能清单

| 功能 | 说明 | 状态 |
|------|------|------|
| 输出质量反馈 | 集成到 dreaming pipeline | ⏳ |
| 推理策略 | CoT/ToT/GoT 支持 | ⏳ |

### 依赖

- claw-mem >= v6.19.0

---

## v4.24.0 - Structured Context 增强

**目标**: 增强图结构和复杂查询能力

### 功能清单

| 功能 | 说明 | 状态 |
|------|------|------|
| 图结构增强 | 与 KnowledgeGraph 深度集成 | ⏳ |
| 复杂查询 | 多跳推理支持 | ⏳ |

### 依赖

- claw-mem >= v6.20.0

---

## 版本依赖

```
v4.21.0 → v4.22.0 → v4.23.0 → v4.24.0 → v5.0.0
                      ↓
                 claw-mem >= v6.19.0
```

---

## 更新日志

- 2026-06-11: Initial v4.x.x iteration plan