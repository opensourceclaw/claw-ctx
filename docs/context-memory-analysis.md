# OpenClaw Context & Memory Management (C) 能力分析报告

**分析日期**: 2026-06-05  
**分析框架**: Agent Harness Engineering 能力框架  
**分析对象**: claw-mem v6.0.2, claw-ctx v4.1.0, OpenClaw Gateway  

---

## 📊 能力矩阵总览

| 能力维度              | claw-mem | claw-ctx | OpenClaw Gateway | 综合成熟度    |
| ----------------- | -------- | -------- | ---------------- | -------- |
| **C1. 短期活跃上下文窗口** | ★★★☆☆    | ★★★★☆    | ★★☆☆☆            | **部分成熟** |
| **C2. 中期会话状态**    | ★★★★☆    | ★★★★☆    | ★★★☆☆            | **成熟**   |
| **C3. 长期持久化记忆**   | ★★★★★    | ★★☆☆☆    | ★☆☆☆☆            | **成熟**   |
| **C4. 长视野上下文技术**  | ★★★★☆    | ★★★☆☆    | ★★☆☆☆            | **部分成熟** |
| **C5. 上下文漂移和限制**  | ★★★☆☆    | ★★★★☆    | ★★☆☆☆            | **部分成熟** |

---

## C1. 短期活跃上下文窗口 (Short-Term Active Context Window)

### 1.1 Token 预算控制

**claw-mem**:

- ❌ 无内置 token 计数
- ✅ Working memory 数组追踪当前会话消息 (`this._working`)

**claw-ctx**:

- ✅ `TokenBudgetManager` 类 (v4.0.0) 实现完整的 token 预算分配
- ✅ 支持动态百分比配置: baseContext(60%), crossDomain(10%), CI(10%), buffer(20%)
- ✅ 支持最小/最大约束配置

**OpenClaw Gateway**:

- ❌ 无 token 预算管理能力

**成熟度评估**: 部分成熟

---

### 1.2 上下文选择策略

**claw-mem**:

- ✅ 多层检索系统: `ThreeTierRetriever` (近期/高频/高重要性)
- ✅ `HybridRouter` 混合路由 (BM25 + 关键词 + 同义词)
- ✅ 简单基于分数的过滤 (score >= 0.3)

**claw-ctx**:

- ✅ 基于预算的选择: `selectByBudget()` 函数实现按分数排序和预算约束选择
- ✅ 置信度门控: `ConfidenceGate` 支持多种模式 (strict/balanced/permissive)
- ✅ 跨域信号注入: `CrossDomainInjector` 支持 Pillar/Intent 路由

**成熟度评估**: 成熟

---

### 1.3 实时上下文注入

**claw-mem**:

- ✅ `injectConstitution()` 宪法注入 (v5.1.0)
- ✅ 支持多种 memory types: episodic, semantic, procedural

**claw-ctx**:

- ✅ `assemble()` 方法返回 `systemPromptAddition` 字段
- ✅ 支持外部信号注入: RL experience, governance signals, CI/CD signals
- ✅ 会话连续性注入 (v4.1.0): `_loadPreviousSessionContext()`

**成熟度评估**: 成熟

---

## C2. 中期会话状态和跨运行持久化 (Mid-Term Session State)

### 2.1 会话状态管理

**claw-mem**:

- ✅ `sessionId` 追踪当前会话
- ✅ `ConstitutionStore` 3层持久化身份 (L1/L2/L3)
- ✅ Working memory 存储当前会话消息

**claw-ctx**:

- ✅ `bootstrap()` 方法初始化会话
- ✅ Session continuity: 注入前次会话摘要
- ✅ `afterTurn()` 存储会话摘要

**成熟度评估**: 成熟

---

### 2.2 跨运行持久化

**claw-mem**:

- ✅ `EpisodicStorage` 持久化短期记忆
- ✅ `SemanticStorage` 持久化语义记忆
- ✅ `ProceduralStorage` 持久化程序记忆
- ✅ JSON 文件存储架构

**claw-ctx**:

- ✅ 依赖 claw-mem 进行持久化
- ✅ Session summary 存储机制

**成熟度评估**: 成熟

---

### 2.3 Subagent 生命周期

**claw-ctx**:

- ✅ `prepareSubagentSpawn()` 支持 isolated/fork 模式
- ✅ `onSubagentEnded()` 处理 subagent 完成事件
- ✅ 支持 context fork 模式继承父会话上下文

**成熟度评估**: 成熟

---

## C3. 长期持久化记忆系统 (Long-Term Persistent Memory)

### 3.1 记忆存储架构

**claw-mem**:

- ✅ 4层存储架构:
  - **EpisodicStorage**: 事件序列存储
  - **SemanticStorage**: 语义知识存储
  - **ProceduralStorage**: 程序性知识存储
  - **GroundTruthStore**: 事实性知识存储
- ✅ **ConstitutionStore**: 3层宪法存储 (L1-核心/L2-重要/L3-补充)
- ✅ `InMemoryIndex` 内存索引 + BM25 支持

**成熟度评估**: 成熟

---

### 3.2 记忆检索机制

**claw-mem**:

- ✅ **ThreeTierRetriever**: 三层检索 (近期/高频/高重要性)
- ✅ **HybridRouter**: BM25 + 关键词 + 同义词混合路由
- ✅ **QueryCache**: 查询缓存减少重复计算
- ✅ **SynonymExpander**: 同义词扩展
- ✅ 置信度评分 (score 0-1)

**成熟度评估**: 成熟

---

### 3.3 记忆管理功能

**claw-mem**:

- ✅ **TieredDecayEngine**: 三层衰减 (HOT/WARM/COLD)
- ✅ **MemoryCompressorV2**: 记忆压缩
- ✅ **CompressionSpectrum**: 压缩谱系管理
- ✅ **ImportanceScorer**: 重要性评分
- ✅ **ConceptGraph**: 概念图关系管理
- ✅ **Dreaming**: 记忆整合 (deep/light/promote/rem)

**成熟度评估**: 成熟

---

## C4. 长视野上下文技术 (Long-Horizon Context)

### 4.1 长周期记忆整合

**claw-mem**:

- ✅ **Dreaming** 模块:
  - `deep.ts`: 深度记忆整合
  - `light.ts`: 轻量记忆整合
  - `promote.ts`: 记忆提升
  - `rem.ts`: 记忆重塑
- ✅ **TieredDecayEngine**: 自动分层管理

**成熟度评估**: 部分成熟

---

### 4.2 记忆压缩和聚合

**claw-mem**:

- ✅ `MemoryCompressorV2`: 记忆压缩 v2
- ✅ `CompressionSpectrum`: 压缩谱系
- ✅ `f5_v2.ts`: F5 压缩算法
- ✅ `session_summary`: 会话摘要机制

**claw-ctx**:

- ✅ `compact()` 方法支持 token 预算压缩
- ✅ 可配置压缩阈值 (默认 100K)

**成熟度评估**: 部分成熟

---

### 4.3 跨会话上下文

**claw-ctx**:

- ✅ `_loadPreviousSessionContext()` 加载前次会话
- ✅ `_storeSessionSummary()` 存储会话摘要
- ✅ 跨域信号注入 (CrossDomainInjector)

**成熟度评估**: 部分成熟

---

## C5. 上下文漂移和限制 (Context Drift & Limits)

### 5.1 上下文质量控制

**claw-ctx**:

- ✅ **ConfidenceGate**: 置信度门控
  - strict 模式: 高阈值
  - balanced 模式: 平衡
  - permissive 模式: 低阈值
- ✅ 基于分数的过滤 (score >= 0.3)

**成熟度评估**: 部分成熟

---

### 5.2 上下文漂移检测

**claw-mem**:

- ✅ `IntegrityChecker`: 记忆完整性检查
- ✅ 监控模块 (monitor/)

**claw-ctx**:

- ⚠️ 无显式漂移检测机制

**成熟度评估**: 部分成熟

---

### 5.3 资源限制管理

**claw-ctx**:

- ✅ Token 预算管理器
- ✅ `compact()` 方法支持阈值触发压缩
- ✅ 预留空间管理 (crossDomainReserve, ciReserve)

**成熟度评估**: 成熟

---

## 📋 待改进点汇总

| 优先级    | 维度  | 改进项              | 当前状态          |
| ------ | --- | ---------------- | ------------- |
| **P0** | C1  | Token 精确计数       | 估算方式 (字符/3.5) |
| **P0** | C5  | 上下文漂移检测          | 缺失显式机制        |
| **P1** | C4  | 长期记忆压缩质量         | 基础压缩可用        |
| **P1** | C1  | Gateway token 预算 | 缺失            |
| **P2** | C4  | 跨会话语义关联          | 部分支持          |
| **P2** | C3  | 记忆遗忘机制           | 基础衰减可用        |

---

## 🗺️ 改进路线图

### Phase 1: 核心增强 (1-2个月)

1. **Token 精确计数**: 集成 tiktoken 或类似库
2. **上下文漂移检测**: 添加主题漂移检测算法
3. **Gateway 上下文桥接**: claw-ctx 与 Gateway 深度集成

### Phase 2: 能力扩展 (3-4个月)

1. **LLM 驱动的记忆摘要**: 使用 LLM 进行高质量压缩
2. **跨会话知识图谱**: 增强 ConceptGraph 跨会话能力
3. **自适应预算分配**: 基于任务类型动态调整预算

### Phase 3: 智能化 (6个月+)

1. **主动上下文预测**: 预测用户下一步需求
2. **记忆重要性自动评估**: LLM 驱动的动态评分
3. **个性化记忆分层**: 用户行为驱动的自适应衰减

---

## 📌 结论

OpenClaw 生态在 Context & Memory Management 方面已具备**较为成熟的体系**:

- **优势**: 
  
  - claw-mem 提供了完整的4层记忆存储架构
  - claw-ctx 提供了精细的上下文选择和预算管理
  - 宪法 (Constitution) 机制确保核心身份持久化

- **不足**:
  
  - Token 计数采用估算方式
  - 缺乏显式上下文漂移检测
  - Gateway 层面缺乏上下文管理能力

- **建议**: 优先实现精确 token 计数和漂移检测，进一步完善长期记忆压缩质量。
