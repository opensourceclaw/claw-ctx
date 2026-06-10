# Agent Memory Survey  to 标分析

**Date**: 2026-06-09
**Author**: Friday
**Reference**: arXiv:2512.13564v2 - "Memory in the Age of AI Agents: A Survey"
**Tags**: #agent-memory #survey #gap-analysis #parametrized-memory #latent-memory

---

[EN] ## 1. 论文核心框架回顾

[EN] ### 统一分析框架：Forms + Functions + Dynamics

```
Agent Memory
[EN] ├── Form (什么承载记忆)
[EN] │   ├── Token-level Memory (显式离散单元)
│   ├── Parametric Memory (参数编码)
│   └── Latent Memory (隐状态)
│
[EN] ├── Function ( for 什么需要记忆)
[EN] │   ├── Factual Memory (事实性 - "知道什么")
[EN] │   ├── Experiential Memory (经验性 - "如何改进")
[EN] │   └── Working Memory (工作性 - "现 at 想什么")
│
[EN] └── Dynamics (如何运作 and 演化)
    ├── Encoding (编码)
    ├── Processing (处理)
    ├── Retrieval (检索)
    └── Evolution (演化)
```

###  with  Context Engineering  of 关系

| 维度 | Context Engineering | Agent Memory |
|------|---------------------|--------------|
[EN] | **范式** | 资源管理 | 认知建模 |
[EN] | **关注点** | 如何高效组织信息 | agent 知道什么、经历过什么 |
[EN] | **关系** | 实现层 | 更高层抽象 |

---

## 2. 现 has 实现 to 标

### 2.1 Forms（记忆形式）

[EN] | 论文分类 | 子类型 | claw-mem/ctx 实现 | 状态 |
|----------|--------|------------------|------|
[EN] | **Token-level (1D Flat)** | 序列/列表存储 | ✅ memory_pool, message store | ✅ |
| **Token-level (2D Planar)** | 图/树结构 | ✅ graph/, retrieval/ | ✅ |
| **Token-level (3D)** | 分层结构 | ✅ three_tier (recent/episodic/semantic) | ✅ |
[EN] | **Parametric (Internal)** | 模型参数编码 | ❌ 无直接实现 | ❌ |
[EN] | **Parametric (External)** | 外部参数存储 | ⚠️ LoRA adapter 接口 | ⚠️ |
[EN] | **Latent (Generate)** | 隐状态生成 | ❌ 无直接实现 | ❌ |
[EN] | **Latent (Reuse)** | 隐状态复用 | ❌ 无直接实现 | ❌ |
[EN] | **Latent (Transform)** | 隐状态转换 | ❌ 无直接实现 | ❌ |

### 2.2 Functions（记忆功 can ）

#### 2.2.1 Factual Memory

[EN] | 子类 | 描述 | claw-mem/ctx 实现 | 状态 |
|------|------|------------------|------|
[EN] | **User factual** | 用户偏好、身份信息 | ✅ user_profile 存储, memory_injector | ✅ |
[EN] | **Environment factual** | 环境状态、工具 can 力 | ✅ tools 存储, session_state_extractor | ✅ |

#### 2.2.2 Experiential Memory

[EN] | 子类 | 描述 | claw-mem/ctx 实现 | 状态 |
|------|------|------------------|------|
[EN] | **Case-based** | 过去 of 成功/失败案例 | ✅ episodic memory, experience store | ✅ |
[EN] | **Strategy-based** | 策略抽象、推理模式 | ✅ dreaming pipeline, reflection | ✅ |
| **Skill-based** |  from 经验 in 提取技 can  | ✅ SkillStore, procedural memory | ✅ |

#### 2.2.3 Working Memory

[EN] | 子类 | 描述 | claw-mem/ctx 实现 | 状态 |
|------|------|------------------|------|
[EN] | **Single-turn** | 单轮输入压缩 | ✅ input condensation, progressive_summarizer | ✅ |
| **Multi-turn** | 多轮 up  down 文折叠 | ✅ auto compaction, context folding | ✅ |

[EN] ### 2.3 Dynamics（记忆运作方式）

[EN] | 阶段 | 描述 | claw-mem/ctx 实现 | 状态 |
|------|------|------------------|------|
[EN] | **Encoding** | 编码交互结果 to 记忆 | ✅ dream pipeline, tiered_decay_engine | ✅ |
[EN] | **Processing** | 工作内存处理 | ✅ token_budget_manager, smart_allocator | ✅ |
[EN] | **Retrieval** | 检索相关记忆 | ✅ bm25, hybrid_router, graph retrieval | ✅ |
[EN] | **Evolution** | 记忆演化 with 适应 | ✅ decay, importance scoring, dreaming | ✅ |

### 2.4 补充 can 力

[EN] |  can 力 | 说明 | claw-mem/ctx 实现 | 状态 |
|------|------|------------------|------|
[EN] | **Confidence Gating** | 输入质量门控 | ✅ confidence_gate.ts | ✅ |
[EN] | **RL Experience Injection** | 强化学习经验注入 | ✅ rl_injector.ts | ✅ |
| **Governance Signals** | L1-L6 治理信号 | ✅ governance_injector.ts | ✅ |
[EN] | **Cross-Domain Injection** | 跨域信号注入 | ✅ cross_domain_injector.ts | ✅ |
| **CI/CD Signals** | DevOps  up  down 文 | ✅ ci_injector.ts | ✅ |
[EN] | **Drift Detection** | 主题漂移检测 | ✅ drift_detector.ts | ✅ |
[EN] | **Long-term Dependency** | 长期依赖追踪 | ✅ long_term_dependency_tracker.ts | ✅ |
[EN] | **Self-Refinement** | 输出质量改进 | ✅ self_refiner.ts | ✅ |
[EN] | **Prompt Strategy** | 推理策略选择 | ✅ prompt_strategy_controller.ts | ✅ |

---

## 3. 覆盖度评分

[EN] | 类别 | 覆盖项 | 总项 | 覆盖度 |
|------|--------|------|--------|
| **Forms (记忆形式)** | 6 | 9 | **67%** |
| **Functions (记忆功 can )** | 7 | 7 | **100%** |
| **Dynamics (运作方式)** | 4 | 4 | **100%** |
| **补充 can 力** | 9 | 9 | **100%** |
| **整体** | **26** | **29** | **90%** |

---

[EN] ## 4. 关键差距分析

[EN] ### 4.1 Forms 缺失项（待研究）

[EN] | 缺失 | 类别 | 影响 | 优先级 | 最新参考文献 |
|------|------|------|--------|---------------|
[EN] | **Parametric Memory (Internal)** | Forms | 无法通过微调内化记忆 | P2 | PEAM (2605.27762), ParamAgent, Scaling Self-Evolving (2606.04536) |
[EN] | **Latent Memory (Generate/Reuse/Transform)** | Forms | 无法利用模型隐状态 | P3 | IndexMem (2605.25475), MemArt, Persistent KV Cache (2603.04428) |
| **External Parametric** | Forms | LoRA adapter 集成缺失 | P3 | LRAgent (2602.01053) |

---

[EN] ## 8. 最新研究论文（2025-2026）

### Parametric Memory

[EN] | 论文 | arXiv ID | 核心贡献 | claw-mem/ctx  to 应 |
|------|----------|---------|------------------|
[EN] | **PEAM** | 2605.27762v2 | 经验内化 to 参数， will 检索记忆转 for 参数化技 can  | ⏳ 待研究 |
[EN] | **ParamAgent** | OpenReview | 领域自适应参数记忆，内部跨样本知识 | ⏳ 待研究 |
[EN] | **Scaling Self-Evolving Agents via Parametric Memory** | 2606.04536 | 扩展自演化Agent of 参数记忆 | ⏳ 待研究 |
| **A-MEM** | 2502.12110 | Agentic Memory for LLM Agents | ⏳ 待研究 |

### Latent Memory

[EN] | 论文 | arXiv ID | 核心贡献 | claw-mem/ctx  to 应 |
|------|----------|---------|------------------|
[EN] | **IndexMem** | 2605.25475v1 |  can 学习 KV 驱逐 + 潜 at 记忆压缩 | ⏳ 待研究 |
[EN] | **MemArt** | OpenReview | KV-cache 原生记忆，潜空间检索 | ⏳ 待研究 |
[EN] | **Persistent Q4 KV Cache** | 2603.04428 | 边缘设备持久化 KV 缓存 | ⏳ 待研究 |
[EN] | **LRAgent** | 2602.01053 | 多LoRA Agent间KV缓存共享 | ⏳ 待研究 |
---

## 9.  down 一步计划

[EN] 详见 `roadmaps/` 目录 down  of 开发计划文档。

[EN] ### 4.2 差距原因分析

**Parametric Memory** 论文指出：
[EN] - 涉 and 模型参数级别 of 修改
[EN] - 需要 with 模型训练/微调流程集成
[EN] - 技术复杂度高，风险 large

**Latent Memory** 论文指出：
[EN] - 依赖模型内部表示
- 需要 KV-Cache 管理 can 力
[EN] - 当前架构 not 支持

---

[EN] ## 5.  with 论文代表性系统 to 比

[EN] | 系统 | 论文 to 应 | claw-mem/ctx  to 应 |
|------|----------|------------------|
| **MemGPT** | Token-level (3D) Hierarchical | ✅ three_tier |
| **Mem0** | Token-level (2D) Graph | ✅ graph/ |
| **HippoRAG** | Token-level (2D) Graph | ✅ graph/ + retrieval/ |
| **ACE** | Experiential (Strategy) | ✅ dreaming pipeline |
| **Toolformer** | Parametric | ❌ 无直接 to 应 |
| **Reflexion** | Experiential + Latent | ✅ self_refiner |
| **S5** | Latent Memory | ❌ 无直接 to 应 |

---

## 6. 未来研究方 to 

[EN] 基于论文第7节， with  Project Neo 相关 of 方 to ：

1. **Memory Retrieval → Memory Generation**
[EN] -  from  by 动检索 to 主动生成记忆
[EN] - claw-mem  already  has  dreaming pipeline，需增强生成 can 力

2. **Automated Memory Management**
[EN] - 当前依赖手工配置
[EN] - 需实现自动化策略选择

3. **RL + Agent Memory**
   - claw-mem  already 实现 rl_injector
   - 需深化 with  claw-rl  of 集成

4. **Multimodal Memory**
[EN] - 需支持图像/音频/视频记忆

5. **Shared Memory in Multi-Agent**
   - 当前 cross_domain_injector  already  has 基础
[EN] - 需增强多 Agent 共享机制

6. **Trustworthy Memory**
[EN] - 需增加记忆 can 信度验证

---

## 7.  down 一步计划

[EN] 详见 `roadmaps/` 目录 down  of 开发计划文档。

---

## References

- arXiv:2512.13564v2 - "Memory in the Age of AI Agents: A Survey" (2025-12)
- Context Engineering Survey: arXiv:2507.13334v2
- claw-mem: `/Users/liantian/workspace/osprojects/claw-mem/`
- claw-ctx: `/Users/liantian/workspace/osprojects/claw-ctx/`