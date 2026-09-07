# Architecture Decision Record: Structural Digest Protected-Zone Format

**Title:** Protected digest as a quasi-header message entry rewritten each compaction round (headers + digest + summary + kept)
**Status:** Accepted（Peter 2026-09-07 批准，随 v6.9.0 发布转正）
**Date:** 2026-09-06
**Author:** Jarvis (CodeAgent)
**Project:** claw-ctx v6.9.0
**Deciders:** Friday (ArchitectAgent), Peter (Owner)
**Evidence:** `engine.ts` L890-894（压缩输出形态 = headers + summary 一条 + keptMsgs）；headerTypes 豁免先例 L827-829（5 类 header 条目不计 token/不进 kept 计算）；summary 消息下轮被再压缩（L882 legacy oldMsgs 切片）——digest 需要独立生命周期；assemble() L426-499 不读 session 文件（ctx_build 零改动即可让 digest 自然在场）。

---

## Context

结构摘要必须跨压缩轮存活并被模型看到，否则失去「防重复探索」意义。三个约束：

1. **跨轮存活**：summary 是普通消息、每轮被再压缩——digest 若同构则每轮都丢，保护区名存实亡。
2. **单条不堆积**：digest 每轮更新。若旧 digest 当普通消息参与 kept 保留，压缩输出会出现双 digest 乃至 N digest 堆积，token 膨胀不可控。
3. **纯增量红线**：无结构信息时输出必须与现版逐字节一致；异常时回退现版。

## Decision

- **形态**：压缩输出 = `headers + [digest 消息条目] + [summary 消息条目] + keptMsgs`。digest 为普通 message 条目（role:user），content 首行固定前缀 `[STRUCTURAL-DIGEST v1]`，其后为文本序列化（§quality-gates ADR 定格式）——gateway 重读 sessionFile 时作为普通用户消息自然渲染进上下文，**ctx_build/assemble 零改动**。
- **准 header 消费豁免**：engine 识别前缀开头条目，从 `msgEntries` 消费剔除（不计 token 估算、不进 kept 计算、不被再压缩）——复用 headerTypes 同款豁免机制（F4），物理仍为 message。
- **每轮恰一条**：旧 digest 条目在每轮 compaction 中被解析为 `oldDigest` 并入提取输入（跨轮累积合并见 quality-gates ADR），输出重写为恰一条最新 digest。不会出现堆积。
- **纯增量落点**：提取为空 → 不写 digest 条目（输出逐字节同现版）；模块异常 → 整体 catch 回退现版路径并 log warn。机制有常量开关（`STRUCTURAL_DIGEST_ENABLED`），关闭即现版。
- **token 记账**：digest 文本计入 `newTokens`（L901 追加 estimateTokens(digestText)），避免文件实际规模偏离 target 预算。

## Consequences

- 正面：注入无需 assemble 管线配合（架构最简）；条目生命周期与摘要彻底解耦（摘要随轮再生、digest 随轮累积）；纯增量逐字节验证可测；降级/关闭路径单一。
- 负面：digest 条目物理在 kept 之前（最旧位置），消息顺序语义为「先结构段再近期过程」——与 Recuris WM 投影（任务状态置于保留最高优先级、上下文前部）一致，顺序即叙事；实现侧需在 `_executeCompaction` 汇合处识别/剔除旧条目（约 25 行改动，有单测锁定）。

## Alternatives Considered

1. **digest 文本前置进 summaryBlock content**：digest 与 summary 生命周期绑定——summary 下轮被压缩时 digest 文本会进 removedMsgs 参与 keyword 摘要，结构保真度随压缩轮数衰减；且 summary 文本可能被 resume/解析逻辑消费，格式耦合——拒绝。
2. **digest 作独立 header type（扩 headerTypes 第 6 类）**：语义最纯但 header 是否被 gateway 渲染进模型上下文未验证（session/custom 类为元数据），风险不可控；且语义分类上 digest 是内容非元数据——拒绝。
3. **digest 并入 `_sessionState`**：post-compact rebuild（L756）语义 = 保留消息的活跃状态，供 resume bootstrap 注入（`_injectSessionResume`）；并入会把已压缩历史结构当当前状态注入，语义污染——拒绝（两域分离）。
