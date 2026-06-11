# claw-ctx Master Plan

**规划时间**: 2026-06-11
**Version Range**: v4.21.0 - v7.0.0
**Author**: Friday
**Status**: [Draft](https://github.com/opensourceclaw/claw-ctx/issues)

---

## 📌 现状分析

| Project | Current Version | Phase |
|---------|-----------------|-------|
| **neoclaw** | v6.20.0 | Phase 3 (Governance) |
| **devclaw** | v5.19.0 | v5.x Final, v6.0.0 Enterprise Planning |
| **claw-mem** | v6.19.0 | Federation + Emergence |
| **claw-ctx** | v4.20.0 | Context Engine Core Complete |
| **claw-cog** | v5.3.1 | E/V/G Layers + ConsciousAgent |
| **claw-rsi** | v4.0.6 | Pattern Evolution |
| **claw-rl** | v5.14.1 | Meta-Learning + Self-Evolution |

---

## 🏗️ 元认知协同架构

### 分层设计 (方案 B)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Metacognition Architecture                   │
├─────────────────────────────────────────────────────────────────┤
│  Layer               Project           Capability               │
├─────────────────────────────────────────────────────────────────┤
│  Decision-Level   claw-cog         Self-Reflection             │
│  (What should I do?)                 (metacognitive_reflect)   │
├─────────────────────────────────────────────────────────────────┤
│  Strategy-Level   claw-rl           Meta-Learning              │
│  (How should I learn?)               (Meta-Learning, MAML)     │
├─────────────────────────────────────────────────────────────────┤
│  Context-Level    claw-ctx          Meta Context Engineering   │
│  (How to organize context?)          (MCE - planned)           │
├─────────────────────────────────────────────────────────────────┤
│  Pattern-Level    claw-rsi          Pattern Evolution          │
│  (What patterns work?)               (PatternMiner, Library)   │
└─────────────────────────────────────────────────────────────────┘
```

### 协同接口

```typescript
interface MetacognitionSystem {
  // claw-ctx: Context-level metacognition
  optimizeContext(ctx: Context): Promise<OptimizedContext>;
  
  // claw-rl: Strategy-level metacognition
  suggestStrategy(task: Task): Promise<LearningStrategy>;
  
  // claw-cog: Decision-level metacognition
  reflect(result: ExecutionResult): Promise<Reflection>;
  
  // claw-rsi: Pattern-level metacognition
  queryPatterns(experience: Experience): Promise<Pattern[]>;
}
```

---

## 📋 子计划

### v4.x.x 迭代计划
→ [claw-ctx-v4.x-iteration-plan.md](./claw-ctx-v4.x-iteration-plan.md)

### v5.0.0 迭代计划 (Cross-Domain Intelligence)
→ [claw-ctx-v5.0.0-iteration-plan.md](./claw-ctx-v5.0.0-iteration-plan.md)

### v6.0.0 迭代计划 (Active Cognition)
→ [claw-ctx-v6.0.0-iteration-plan.md](./claw-ctx-v6.0.0-iteration-plan.md)

### v7.0.0 迭代计划 (Enterprise Architecture)
→ [claw-ctx-v7.0.0-iteration-plan.md](./claw-ctx-v7.0.0-iteration-plan.md)

---

## 📚 已读论文参考

| arXiv ID | 标题 | 应用于 |
|----------|------|--------|
| 2507.13334v2 | Survey of Context Engineering | v5.0.0 |
| 2510.26493 | Context Engineering 2.0 | Overall Architecture |
| 2510.04618v3 | ACE: Agentic Context Engineering | v5.0.0 |
| 2601.07190v1 | Active Context Compression (Focus) | v6.0.0 |
| 2604.01664v1 | ContextBudget (BACM) | v6.0.0 |
| 2601.21557 | Meta Context Engineering (MCE) | v6.0.0 |
| 2512.05470v1 | Everything is Context | v7.0.0 |
| 2603.09619v2 | Context Engineering: Corporate | v7.0.0 |
| 2503.17407v2 | Long Context Language Modeling | v4.22.0 |

---

## 更新日志

- 2026-06-11: Initial master plan with metacognition coordination