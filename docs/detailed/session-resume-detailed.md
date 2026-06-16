# Detailed Design: claw-ctx session-resume Module

**Author**: Friday (Role A) → Jarvis (Role B)
**Date**: 2026-06-16
**Version**: 5.0.0
**Feature**: Session continuity — bootstrap → assemble → afterTurn

---

## 1. Background

### Current Implementation (v4.22.0)

claw-ctx 已有基础会话连续性，通过 `engine.ts` 中的两个私有方法实现：

- **`_loadPreviousSessionContext()`**: 搜索 claw-mem 中 `session_summary` 标签的条目，将最近 1 个注入为文本
- **`_storeSessionSummary()`**: 每次 afterTurn 提取最后 10 条消息的关键词，存储为一行摘要

### Limitations

| 问题 | 影响 |
|------|------|
| 只加载最近 1 个会话摘要 | 丢失更早的上下文 |
| 摘要只有关键词一行 | 无结构化实体/决策/待办 |
| 无独立可测试模块 | 难以维护和验证 |
| 不可配置 | 无法调整历史数量/时效 |

### Target

创建独立 `session-resume/` 子模块，实现真正的隔夜会话连续性：
- 多会话历史加载（可配置数量 + 时效过滤）
- 结构化摘要（主题、待办、关键点、实体）
- 三阶段编排（bootstrap → assemble → afterTurn）
- 纯规则匹配，无 LLM 调用

---

## 2. Architecture

### Module Layout

```
src/session-resume/
├── mod.ts                  # 入口，重导出
├── types.ts                # 类型定义
├── summary-generator.ts    # 纯规则匹配摘要生成
├── history-loader.ts       # 从 claw-mem 加载历史会话
└── bootstrap.ts            # SessionResumeManager 三阶段编排
```

### Data Flow

```
                    bootstrap()                    assemble()                   afterTurn()
                         │                            │                            │
                         ▼                            ▼                            ▼
┌─────────────────────────────────┐    ┌────────────────────────┐    ┌──────────────────────────┐
│  HistoryLoader                  │    │  SessionResumeManager  │    │  SummaryGenerator         │
│  1. manager.search("summary")  │    │  .assemble()           │    │  1. 关键词频率→theme      │
│  2. 按 tag 过滤                │───→│  返回格式化历史字符串  │───→│  2. 6种 regex→pendingTasks│
│  3. 按 sessionId 去重          │    │  注入 systemPrompt     │    │  3. 5种 regex→keyPoints   │
│  4. 按 maxAgeHours 过滤        │    │                        │    │  4. 提取 entities         │
│  5. 排序 + 格式化              │    │                        │    │  5. 存储到 claw-mem       │
└─────────────────────────────────┘    └────────────────────────┘    └──────────────────────────┘
```

---

## 3. Algorithm Design

### 3.1 SummaryGenerator — Theme Extraction

```
INPUT: messages[]
1. 拼接所有消息文本
2. tokenize：按非字母数字分割，转小写
3. 过滤停用词（~50 个英语常见词）
4. 过滤 < 3 字符的短词
5. 统计频率 Map<word, count>
6. 只保留出现次数 >= 2 的词（防噪声）
7. 取 top 5 关键词
8. 如果 SessionState 有 topics，合并 top 2 标签
9. 构建 theme 字符串（逗号分隔）
10. 空结果 → fallback "General discussion"
```

**关键词频率示例**:
```
输入: "deploy kubernetes cluster with helm" + "kubernetes deploy monitoring"
→ tokenize: ["deploy", "kubernetes", "cluster", "helm", "monitoring"]
→ 频率: {deploy: 2, kubernetes: 2, cluster: 1, helm: 1, monitoring: 1}
→ 过滤 >= 2: ["deploy", "kubernetes"]
→ theme: "deploy, kubernetes"
```

### 3.2 SummaryGenerator — Pending Tasks Extraction

6 种正则模式：

| 模式 | 触发词 | 示例匹配 |
|------|--------|----------|
| Todo | `todo`, `TODO`, `to do` | "TODO: fix login bug" |
| Next | `next`, `next step`, `next action` | "Next step: update config" |
| Bug/Fix | `bug`, `fix`, `fixed` | "Need to fix the memory leak" |
| Need to | `need to`, `must`, `should` | "We need to update the API" |
| Remaining | `remaining`, `left to do`, `pending` | "Remaining: add tests" |
| Issues | `issue`, `blocker`, `problem` | "Blocker: database migration" |

**提取逻辑**:
1. 对每条消息应用 6 种模式
2. 对每个匹配提取完整句子边界（`.` `!` `?` `\n`）
3. 按小写内容去重
4. 限制最多 5 条，每条最长 120 字符
5. 补充 SessionState 中 `actor: "user"|"team"` 且 `confidence >= 0.6` 的决策

### 3.3 SummaryGenerator — Key Points Extraction

5 种正则模式：

| 模式 | 触发词 |
|------|--------|
| Decision | `decided`, `agreed`, `confirmed`, `finalized` |
| Important | `important`, `critical`, `key`, `crucial` |
| Note | `note`, `noted`, `noteworthy` |
| Learned | `learned`, `lesson`, `takeaway`, `insight` |
| Summary | `summary`, `recap`, `key point`, `highlight` |

**提取逻辑**: 同 pendingTasks，但补充 SessionState 中 `confidence >= 0.7` 的决策。

---

## 4. History Loading Algorithm

### 4.1 Load Pipeline

```
manager.search("session_summary", undefined, maxHistorySessions * 5)
    │
    ▼
Filter: tags.includes("session_summary")
    │
    ▼
Parse: JSON.parse(content) → SessionSummary
        (legacy 格式 fallback: "Working on: X. Last action: Y")
    │
    ▼
Filter: (now - timestamp) < maxAgeHours * 3600000
    │
    ▼
Dedup: Map<sessionId, entry> (保留最新)
    │
    ▼
Sort: 按 timestamp 降序（最新在前）
    │
    ▼
Limit: slice(0, maxHistorySessions)
    │
    ▼
Format: "full" 或 "compact" 模式
```

### 4.2 Format 模式

**full 模式**（默认）:
```
[Previous Session: session-abc]
Theme: deploy, kubernetes, helm
Pending Tasks: fix helm chart values; update config for production
Key Points: decided to use Redis for caching; important: API contract changed
Entities: k8s, helm, Redis, Docker
---
[Previous Session: session-def]
Theme: testing, vitest, coverage
Pending Tasks: add integration tests
Key Points: agreed on vitest as test runner
Entities: vitest, mocha
```

**compact 模式**:
```
[Previous Sessions]
Session session-abc: deploy, kubernetes, helm | tasks: fix helm chart values; update config
Session session-def: testing, vitest, coverage | tasks: add integration tests
```

### 4.3 Edge Cases

| 场景 | 处理方式 |
|------|----------|
| 无历史会话 | `formatted: ""`, `assemble()` 返回 null |
| 全部被时效过滤 | `filteredByAge > 0`，返回空 |
| 多个条目同一 session | 按 sessionId 去重，保留最新 |
| 旧格式摘要（纯文本） | `_parseLegacySummary()` fallback |
| injectMode = "disabled" | 不加载，不注入 |

---

## 5. Three-Phase Orchestration

### Phase 1: bootstrap(sessionId)

```
bootstrap(sessionId)
    │
    ├── 创建 HistoryLoader
    ├── loader.load(sessionId, config)
    ├── 存储结果到 this._history
    └── 返回 { historyLoaded, sessionCount }
```

**时机**: `engine.bootstrap()` 中调用，在会话启动时执行。

### Phase 2: assemble()

```
assemble()
    │
    ├── injectMode === "disabled" → return null
    ├── 无历史或无格式化内容 → return null
    └── 返回格式化的 [Session History] 段落
```

**时机**: `engine.assemble()` 中，在 drift 信号之后、返回之前，注入到 `systemPromptAddition`。

### Phase 3: afterTurn(sessionId, messages, sessionState?)

```
afterTurn(sessionId, messages, sessionState?)
    │
    ├── storeOnEveryTurn === false → skip
    ├── messages.length < 3 → skip
    ├── SummaryGenerator.generate(messages, sessionId, sessionState)
    ├── manager.store(JSON.stringify(summary), "episodic", ["session_summary", "continuity"])
    └── 返回 { stored, summary }
```

**时机**: `engine.afterTurn()` 中调用，每次对话回合后执行。

### 三阶段交互图

```
Session Start
    │
    ▼
bootstrap() ──────────────────────→ 加载历史会话摘要
    │
    ▼
assemble()  ─── [Session History] ─→ 注入到 systemPromptAddition
    │
    ▼
    <--- 用户对话进行中 --->
    │
    ▼
afterTurn()  ─────────────────────→ 生成并存储当前会话摘要
    │
    ▼
    <--- 重复 assemble → afterTurn --->
    │
    ▼
Session End
```

---

## 6. Config Reference

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `maxHistorySessions` | 3 | 加载的最大历史会话数 |
| `maxAgeHours` | 48 | 历史会话最大时效（小时） |
| `minRelevance` | 0.3 | 最小相关性阈值（预留） |
| `injectMode` | `"full"` | 注入模式：`full` / `compact` / `disabled` |
| `storeOnEveryTurn` | `true` | 每次 afterTurn 是否存储摘要 |

---

## 7. File Changes

| File | Action |
|------|--------|
| `src/session-resume/types.ts` | CREATE |
| `src/session-resume/summary-generator.ts` | CREATE |
| `src/session-resume/history-loader.ts` | CREATE |
| `src/session-resume/bootstrap.ts` | CREATE |
| `src/session-resume/mod.ts` | CREATE |
| `src/engine.ts` | MODIFY — 集成 SessionResumeManager，删除两个私有方法 |
| `src/index.ts` | MODIFY — 添加 session-resume 导出 |
| `tests/session-resume/summary-generator.test.ts` | CREATE — 11 tests |
| `tests/session-resume/history-loader.test.ts` | CREATE — 10 tests |
| `tests/session-resume/bootstrap.test.ts` | CREATE — 9 tests |
| `docs/detailed/session-resume-detailed.md` | CREATE — 本文档 |

---

## 8. Backward Compatibility

- **配置兼容**: `config.sessionResume` 默认为 `undefined` → 启用默认配置
- **`config.sessionResume: false`** → 完全禁用
- **旧摘要兼容**: HistoryLoader 能解析旧格式 `"Working on: X. Last action: Y"`
- **engine.ts 接口**: 新增方法不影响现有调用方，删除了私有方法（外部不可见）

---

## 9. Test Plan

| 测试文件 | 测试数 | 覆盖 |
|----------|--------|------|
| `summary-generator.test.ts` | 11 | 主题提取、待办提取、关键点提取、SessionState 增强、空消息、去重、maxKeywords 限制 |
| `history-loader.test.ts` | 10 | 空结果、tag 过滤、sessionId 去重、排序、maxHistorySessions、时效过滤、format full/compact、disabled 模式 |
| `bootstrap.test.ts` | 9 | bootstrap 加载、assemble 注入、afterTurn 存储、<3 消息跳过、storeOnEveryTurn 控制、reset、updateConfig |

---

## 10. Risks & Mitigation

| 风险 | 缓解措施 |
|------|----------|
| 正则假阳性 | 要求句子 ≥ 15 字符，去重，限制数量 |
| 关键词噪声 | 停用词列表 + 最低频率 2 |
| 旧摘要格式不兼容 | `_parseLegacySummary()` fallback |
| SessionState 不可用 | `generate()` 无 state 也能工作 |
| 性能 | 只处理最后 10-20 条消息，正则一次编译 |
