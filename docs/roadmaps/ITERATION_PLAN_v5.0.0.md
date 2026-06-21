# claw-ctx v5.0.0 迭代计划

**规划时间**: 2026-06-21
**版本**: v5.0.0
**Author**: Friday (融合三个 v5.x 计划)
**灵感来源**: MSR 2026 论文 "Context Engineering for AI Agents in Open-Source Software"

---

## 概述

v5.0.0 是 claw-ctx 的重大版本，融合了：
- 跨域智能（Cross-Domain Intelligence）
- 多域信号融合与自适应注入
- 项目标准化（AGENTS.md 参考实现）
- 多风格 Prompt 引擎
- Context 版本演化追踪

**版本发布节奏**: beta.1 → beta.2 → beta.3 → rc.1 → rc.2 → rc.3 → v5.0.0

---

## 版本依赖

```
claw-ctx v5.0.0
├── claw-mem >= v6.20.0
├── claw-gov >= v6.5.0
├── claw-cog >= v5.4.0
├── claw-rl >= v5.15.0
└── claw-rsi >= v4.1.0
```

---

## 发布计划

### v5.0.0-beta.1 — 项目标准化 + 基础架构

**目标**: 创建 AGENTS.md 参考实现 + 基础架构

**论文依据**: RQ1 (采用率仅 5%) + RQ2 (内容结构无标准)

| 功能 | 说明 | 状态 |
|------|------|------|
| 项目 AGENTS.md | 项目自身需要：项目结构、构建命令、测试策略、贡献指南 | ⬜ |
| Context 策略规范 | 文档化 4+ 种策略 (retrieval/recent/hybrid/rl-enhanced) 的使用场景 | ⬜ |
| 标准化 context prompt 模板 | 定义输入输出格式，使外部系统可复用 | ⬜ |

**验收标准**:
- [ ] 项目 AGENTS.md 存在且完整
- [ ] Context 策略规范文档完成
- [ ] Prompt 模板定义完成

---

### v5.0.0-beta.2 — 多域信号融合

**目标**: 实现多域信号聚合与融合

**来源**: v5.0.0-iteration-plan.md + v5.x-iteration-plan.md

| 功能 | 说明 | 依赖 |
|------|------|------|
| CrossDomainFusion | 聚合来自不同域的信号 | claw-gov |
| SignalAggregator | 多源信号加权融合 | - |
| DomainClassifier | 信号域分类 | - |

**验收标准**:
- [ ] 多域信号融合模块完成
- [ ] 测试通过

---

### v5.0.0-beta.3 — 自适应注入策略

**目标**: 基于任务类型动态调整注入策略

**来源**: v5.0.0-iteration-plan.md

| 功能 | 说明 | 依赖 |
|------|------|------|
| AdaptiveInjector | 基于任务类型动态调整注入 | claw-cog |
| TaskTypeDetector | 任务类型识别 | - |
| InjectionStrategy | 动态策略选择 | - |

**验收标准**:
- [ ] 自适应注入延迟 < 50ms
- [ ] 与 claw-cog 集成测试通过

---

### v5.0.0-rc.1 — 多风格 Prompt 引擎

**目标**: 支持 5 种写作风格的 context prompt

**论文依据**: RQ2 发现 5 种写作风格

| 风格 | 在 claw-ctx 中的应用 | 状态 |
|------|---------------------|------|
| **Descriptive** | 描述当前 context 状态 "Current context contains X memories..." | ⬜ |
| **Prescriptive** | 规定选择规则 "Use retrieval strategy when..." | ⬜ |
| **Prohibitive** | 排除规则 "Exclude memories with confidence < 0.3" | ⬜ |
| **Explanatory** | 解释选择原因 "Selected because relevance score > 0.7" | ⬜ |
| **Conditional** | 条件包含 "If task involves code, include coding conventions" | ⬜ |

**核心改动**:
```typescript
interface PromptStyle {
  type: 'descriptive' | 'prescriptive' | 'prohibitive' | 'explanatory' | 'conditional';
  template: string;
}
```

**验收标准**:
- [ ] 5 种风格全部实现
- [ ] 测试覆盖每种风格

---

### v5.0.0-rc.2 — 预测性上下文

**目标**: 基于历史预测未来上下文需求

**来源**: v5.0.0-iteration-plan.md + v5.x-iteration-plan.md

| 功能 | 说明 | 依赖 |
|------|------|------|
| ContextPredictor | 预测未来上下文需求 | claw-rl |
| PreloadManager | 上下文预加载 | claw-mem |
| PredictionEngine | 历史模式分析 | claw-rsi |

**验收标准**:
- [ ] 预测性上下文命中率 > 70%
- [ ] 与 claw-rl/cog-rsi 集成测试通过

---

### v5.0.0-rc.3 — Context 版本演化追踪

**目标**: 记录和分析 context 策略的演化

**论文依据**: RQ3 发现变更模式

| 功能 | 说明 | 状态 |
|------|------|------|
| Context 版本历史 | 记录每次 context 组装的输入输出 | ⬜ |
| 变更模式分析 | 自动识别添加/修改/删除 patterns | ⬜ |
| Diff 可视化 | 展示 context 策略的演化 | ⬜ |

**核心数据结构**:
```typescript
interface ContextSnapshot {
  id: string;
  timestamp: number;
  strategy: ContextStrategy;
  input: { query: string; budget: number };
  output: { selectedItems: ContextItem[]; tokenCount: number };
  outcome?: { effective: boolean; score?: number };
}
```

**验收标准**:
- [ ] 版本历史记录功能完成
- [ ] 变更模式分析可用

---

### v5.0.0 — 生产发布

**目标**: 稳定版发布

**验收标准**:
- [ ] 所有 beta/rc 功能稳定
- [ ] 集成测试通过
- [ ] 性能指标达标
- [ ] 文档完整

---

## 任务分配

| Role | Responsibility |
|------|----------------|
| Friday | 规划 + 验收 |
| Jarvis | 开发实现 |
| Edith | 独立验收测试 |

---

## 时间线（预估）

```
2026-06          2026-07          2026-08          2026-09
   │                │                │                │
   ▼                ▼                ▼                ▼
beta.1          beta.2          beta.3          rc.1
   │                │                │                │
 项目标准化       多域信号          自适应注入       多风格
   │                │                │              Prompt
   ▼                ▼                ▼                ▼
                                                         │
                                                   rc.2
                                                   │
                                              预测性上下文
                                                   │
                                                   ▼
                                                    │
                                              rc.3
                                                    │
                                              版本演化追踪
                                                    │
                                                    ▼
                                                    
                                                v5.0.0
                                                   │
                                              生产发布
```

---

## 附录: 论文引用

> Mohsenimofidi, S., Galster, M., Treude, C., & Baltes, S. (2026). Context Engineering for AI Agents in Open-Source Software. In 23rd International Conference on Mining Software Repositories (MSR '26).

---

## 更新日志

- 2026-06-21: 融合三个 v5.x 计划，创建完整迭代计划
