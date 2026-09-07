# Architecture Decision Record: Structural Digest Extraction Mechanism

**Title:** Rule-Based Structural Extraction (no LLM face), extending the SessionStateExtractor pattern family
**Status:** Accepted（Peter 2026-09-07 批准，随 v6.9.0 发布转正）
**Date:** 2026-09-06
**Author:** Jarvis (CodeAgent)
**Project:** claw-ctx v6.9.0
**Deciders:** Friday (ArchitectAgent), Peter (Owner)
**Evidence:** `engine.ts` 全文零 LLM 调用面（实测，ADR-002 架构意志 2026-06-16）；`SessionStateExtractor` 规则式提取先例（v4.7.0，`src/session-state-extractor.ts` L92-115 pattern 字典 + L360 confidenceScore 启发式）；提取 pass 延迟实测 ≤ 100ms @ 300K tokens（本设计 §7 基准表）。

---

## Context

Plan 原文（T3）假设「结构提取 pass 的输出本身是 LLM 产出，须防把过程细节误当结构结论稀释保护区」。实读揭示与现状冲突：

1. `engine.ts` 无任何 LLM 调用面——claw-ctx 架构意志（ADR-002: Pure Rule-Based Evaluation，2026-06-16）是「零外部依赖、确定性、可测」。
2. 现成提取能力 `SessionStateExtractor` 是规则式 regex 启发式（decisions/entities/topics/actions + confidence 0-1），已被 ingest（L399）、post-compact state rebuild（L756）、dependency tracker 等五处消费——它就是 plan 所指「ctx_build 既有能力」。
3. 其 decisions pattern 仅覆盖决定/同意词族；否决词族（rejected/abandoned）与 API 契约句零捕获（基准实测：循环含 rejected 句的文本，decisions 恒 2 条）——三类保护区不能原样复用旧提取器。

## Decision

v6.9.0 结构提取 pass 为**纯规则式**，不引入 LLM 面：

- 新建 `src/structural-digest/` 模块（patterns / extract / serialize / constants / types），三类保护区各配**保守 pattern 集 + 强/弱信号分级**（confirmed / rejected / pitfalls），风格与判定继承 SessionStateExtractor 启发式先例（base confidence + 修正因子）。
- **不改写** SessionStateExtractor（五处消费的旧模块零改动，回归面归零）；新模块只共享风格，不共享实现。
- 模块接口稳定：输入 `removedMsgs + oldDigest → StructuralDigest`；未来若上 LLM 提取，替换实现、接口不变（ADR 承诺）。

## Consequences

- 正面：确定性可单测（regex 命中断言锁定）；零新增依赖；延迟线性可测（实测 0.25ms/Ktok）；误判面 = 规则误配而非 LLM 漂移，可用 pattern 保守性 + 置信阈值 + 容量截断控制。
- 负面：无语义理解上限——含蓄结论（未用显式动词的决策）会漏保；「宁缺毋滥」语义下漏保被接受（漏保结构 = 回退现版行为，成本已知）。
- plan 风险表「LLM 提取误判」降格为「规则误配稀释保护区」，控制手段不变且更强（三类独立 pattern + 压制词 + 0.75 入区线 + 容量兜底）。

## Alternatives Considered

1. **引入 LLM 提取 pass**（plan 原假设）：违反 ADR-002 架构意志，需 LLM 密钥/调用面/降级策略全链路新增，确定性不可测，延迟与成本不可预测——v6.9.0 拒绝。
2. **原样调用 SessionStateExtractor 产出 decisions 当保护区**：三类缺失两类（F5），且旧 decisions 提取含大量弱信号噪声（should/let's 提议句），与「宁缺毋滥」冲突——拒绝。
