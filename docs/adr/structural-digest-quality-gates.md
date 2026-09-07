# Architecture Decision Record: Structural Digest Quality Gates

**Title:** Three-class digest schema with mandatory provenance, confidence floor 0.75, and priority truncation (rejected > confirmed > pitfalls)
**Status:** Accepted（Peter 2026-09-07 批准，随 v6.9.0 发布转正）
**Date:** 2026-09-06
**Author:** Jarvis (CodeAgent)
**Project:** claw-ctx v6.9.0
**Deciders:** Friday (ArchitectAgent), Peter (Owner)
**Evidence:** plan §T3 已定截断序（已否决 > 已确认 > API 契约，防重复探索边际价值最高）；SessionStateExtractor confidenceScore 启发式先例（`session-state-extractor.ts` L360-367：base 0.5 + 长度/动词修正）；红线「保护区宁缺毋滥（误保过程细节比漏保结构更糟）」。

---

## Context

结构摘要区是**稀缺受信资源**：它先于一切过程细节被压缩而存活、跨轮单调累积，下游决策（含未来检索驱动）会信它。两个质量风险：

1. **稀释**：过程细节（试探句、未验证提议、情绪化表述）混入会误导后续决策——宁缺毋滥红线。
2. **失真**：条目无法回指原文 → 抽查/纠错无门（plan T3 要求 provenance 可抽查）。

## Decision

- **schema 强制**：三类条目（ConfirmedFact / RejectedApproach / ApiPitfall）字段必填 = `claim` 主体 + `confidence` + `provenance {msgId, snippet ≤ 200 chars, round}`；序列化时逐条 schema 校验，非法拒收并计数。缺 provenance/置信 = 不入区。
- **置信判定**：强信号 pattern 命中 base 0.85，弱信号 base 0.6；修正因子：原因链接词（because/due to/起因）+0.1、句长 > 50 chars +0.05、封顶 0.95；**压制词**（maybe/perhaps/虚拟/问句形态）命中的弱信号降级丢弃。入区线 `CONFIDENCE_FLOOR = 0.75`——低于一律不入区。
- **provenance 注入形态**：文本行尾 `[src <msgId>: <snippet 前 80 chars>]`；容量紧张时 snippet 先截、claim 本体后裁。
- **容量上限**：`DIGEST_MAX_TOKENS = 2048`（≈8-10KB，跨轮单调只此一条；常量标待校准）。溢出按 **rejected > confirmed > pitfalls** 截断（plan 已定序）；类内保 confidence 高者、再保新轮（round 大者）。截断静默 + logger 计数，不进事件载荷。
- **跨轮合并**：同 claim 判定 = 规范化（小写 + 空白折叠）字符串相等（保守，不模糊匹配——防过度去重吞真新结论）；同 claim 留高 confidence 版、provenance 指新源；历史否决单调累积（本版无撤销机制）。
- **常量集**：`STRUCTURAL_DIGEST_ENABLED=true`、`CONFIDENCE_FLOOR=0.75`、`DIGEST_MAX_TOKENS=2048`、强/弱 base、snippet 上限——集中于 `src/structural-digest/constants.ts`，均标「待校准」（对齐 claw-ctx 既有阈值标注惯例）。

## Consequences

- 正面：稀释风险被三重闸控（pattern 保守性 / 0.75 入区线 / 压制词）；失真可审计（每行可回指 msgId）；容量有界（2048 token 硬顶，压缩释放量 ~10% 内）；合并幂等可单测。
- 负面：含蓄结论（无显式动词）系统性漏保——「宁缺毋滥」的接受成本；模糊近似 claim 不去重可能造成同义条目占容量——有 2048 上限与类内截断兜底。
- 阈值（0.75 / 2048 / snippet 200）均为初值，经真实会话观察后校准（与 v6.8.0 前各版阈值标注惯例一致）。

## Alternatives Considered

1. **模糊相似去重（bigram 重叠等）**：跨项目引入相似度算法属功能膨胀；误去重吞真结论风险大于容量收益——保守相等判定。
2. **provenance 只留 msgId 不嵌 snippet**：抽查需回读文件定位，成本高且文件已被改写（原条目已不在新文件）——snippet 自包含快照必须存在。
3. **截断先裁整类再裁类内**：rejected > confirmed > pitfalls 整类级裁完，类内全保：实现简单但类内无质量差异表达——类内 confidence/round 排序增量成本极低。
