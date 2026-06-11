# claw-ctx v6.0.0 迭代计划 - 主动认知

**规划时间**: 2026-06-11
**版本**: v6.0.0
**Milestone**: M2 - Active Cognition
**Author**: Friday

---

## 概述

v6.0.0 是第二个里程碑版本，聚焦于主动记忆管理、元认知和预算感知。

## 核心特性

| 特性 | 说明 | 参考论文 |
|------|------|----------|
| 主动压缩 (Focus) | 自主决定何时压缩记忆 | 2601.07190v1 |
| 元上下文工程 (MCE) | CE skills 双层演化 | 2601.21557 |
| 预算感知 (BACM) | 上下文预算管理 | 2604.01664v1 |

---

## 功能清单

### 1. 主动压缩 (Active Compression)

| 模块 | 说明 | 依赖 |
|------|------|------|
| FocusAgent | 自主记忆管理代理 | claw-mem |
| CompressionTrigger | 压缩触发决策 | - |
| KnowledgeBlock | 持久知识块管理 | - |
| PruningEngine | 历史记录修剪 | - |

### 2. 元上下文工程 (MCE)

| 模块 | 说明 | 依赖 |
|------|------|------|
| MetaAgent | 元层代理，演化 CE skills | claw-rl |
| SkillCrossover | 技能交叉演化 | - |
| ContextArtifacts | 上下文工件优化 | claw-cog |
| EvolutionEngine | 演化引擎 | claw-rsi |

### 3. 预算感知上下文管理 (BACM)

| 模块 | 说明 | 依赖 |
|------|------|------|
| BudgetManager | 上下文预算管理 | - |
| CompressionDecider | 压缩时机决策 | claw-rl |
| TokenAllocator | Token 动态分配 | - |
| CostOptimizer | 成本优化 | - |

---

## 元认知协同

v6.0.0 的完整元认知协同架构：

```
                    ┌─────────────────────┐
                    │   Meta Context      │
                    │   Engineering (MCE) │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ↓                      ↓                      ↓
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  claw-rl     │     │  claw-cog    │     │  claw-rsi    │
│  (Strategy)  │     │  (Decision)  │     │  (Pattern)   │
├──────────────┤     ├──────────────┤     ├──────────────┤
│ Meta-Learning│     │ Reflection   │     │ Pattern      │
│ + BACM       │     │ + MCE        │     │ Evolution    │
└──────────────┘     └──────────────┘     └──────────────┘
        ↓                      ↓                      ↓
        └──────────────────────┼──────────────────────┘
                               ↓
                    ┌─────────────────────┐
                    │  Active Compression │
                    │  (Focus Agent)      │
                    └─────────────────────┘
```

---

##版本依赖

```
claw-ctx v6.0.0
├── claw-mem >= v7.0.0
├── claw-rl >= v6.0.0
├── claw-cog >= v6.0.0
├── claw-rsi >= v5.0.0
└── OpenClaw >= v6.5.0
```

---

## 验收标准

- [ ] Focus Agent 压缩响应延迟 < 100ms
- [ ] MCE 技能演化周期 < 1 分钟
- [ ] BACM 预算内任务完成率 > 95%
- [ ] 完整元认知协同测试通过

---

## 更新日志

- 2026-06-11: Initial v6.0.0 iteration plan