<!--
Vendored snapshot of the claw-mem × claw-ctx error-card injection contract.

Source: claw-mem/docs/contracts/error-card-injection-contract.md
Captured: 2026-09-14 (claw-mem v7.8.0 / commit c0eeab08; the source lives under
claw-mem's gitignored docs/, so it is not reachable in CI's single-repo checkout —
this snapshot is the only cross-repo copy available at test time).

Sync responsibility: when the contract changes in claw-mem, re-vendor this
snapshot (content below must stay verbatim); tests/error-card-injection.test.ts
(#12) asserts against this file only.
-->

# Error Card Injection Contract (claw-mem × claw-ctx)

**Status**: **Active** (v7.8.0 additive extension §6 — mem-side implemented
2026-09-14; v7.7.0 / v6.10.0 base — design APPROVED 2026-09-13, mem-side
adapter implemented; design authority:
`claw-mem/docs/design/joint-v7.7.0-ctx-v6.10.0-injection-design.md` §4)
**Parties**: claw-mem (card store, query/format/hit-writeback), claw-ctx (status-driven
retrieval, reminder-block injection), host (task-status signals + reoccurrence verdicts)
**Frozen**: claw-rsi interfaces — untouched; enum alignment is test-locked (§4)

## 1. Query parameters (ctx → mem)

```
mem.findCardsForInjection({
  triggerQuery?: string,       // host task context, similarity-matched vs card.errorSignature.trigger
  triggerThreshold?: number,   // default = SIMILARITY_THRESHOLD (same "similar" as ADR-006 V3a)
  category?: RootCauseCategory // exact match; mem owns the enum (source of truth)
  limit?: number               // default 3 (待校准)
}) → ErrorPatternCard[]        // active cards only; sorted similarity ↓ then lastHitAt ↓; no hits = [] (honest empty)
```

No synthesis, no guessing: an absent field never participates; mem never
ranks inactive cards into the injection face.

## 2. Card → reminder format (mem produces, ctx injects verbatim)

```
[Error Pattern Cards]
- ⚠️ [epc:<cardId> | root: <category> | from: <provenance.source>] <trigger> → <resolution first sentence>
(+N more suppressed)
```

- One line per card; whole-card drop on truncation (a half warning is noise),
  `(+N more suppressed)` trailer only when truncation occurred.
- Empty hit set → no block at all (no empty header).
- ctx passes the block through into its protected-region additions, ahead of
  the memory block, under the truncation priority:
  `rejected > error-cards > confirmed > pitfalls` (whole-block drop at domain budget).

## 3. hit / avoided writeback (host-driven, at run settlement)

| Step | Actor | Call / action |
|------|-------|---------------|
| run start | ctx/host | retrieve cards via §1; inject block via §2 |
| run end | host (or host-delegated ctx) | for **each card actually injected this run**: `mem.recordErrorPatternHit(cardId, { avoided, at })` |

**Verdict semantics (explicit — "再犯" definition):**

- **hit** (always): the card was injected — `hitCount+1`, `lastHitAt` set.
  This is "the card was recalled", frequency evidence only.
- **avoided = true**: run completed normally **and** no error event in the run
  matched the card's `errorSignature.symptom` → the card worked (reuse value).
  Avoided hits auto-revive an inactive card (v7.6.0 mechanism).
- **avoided = false ("再犯")**: an in-run error matched the card's symptom
  (literal/agreed symptom matching), or the run failed with a cause consistent
  with the card's `rootCauseCategory`/trigger. A run of HIT_WINDOW consecutive
  non-avoided hits demotes the card (mem-existing, never deleted).

**Verdict authority = the host.** mem and ctx never interpret error semantics
(same discipline as "the graph never judges run success"). The contract locks
fields and timing only. If the host never writes back, statistics simply stop
updating (v7.6.0 status quo) — there is no fabricated-data path.

## 4. Enum alignment (three-repo)

- claw-mem `RootCauseCategory` = `skill-defect | state-defect | invocation-timing |
  transition-judgment` (+ tolerant extension slot) — **source of truth**.
- claw-rsi `RootCauseCategoryLiteral` = same 4 literals (analyzer.ts, not exported).
- claw-ctx: **no local copy** — passes category through as an opaque string.
- Drift guard: mem-side source-lock test extracts rsi literals and asserts
  set-equality; ctx-side source-lock asserts no literal hardcoding in ctx src/.
- Verified aligned 2026-09-13 (joint design §1.3); no cross-repo defect.

## 5. Frozen surfaces

- claw-mem: card schema, version chain, ADR-006 write gate (V1/V2/V3a/V3b/V3c +
  rejection trail), existing query/match/hit APIs, T4 write filter.
- claw-ctx: `ctx_compact` / `ctx_build` / `ctx_inject` tool signatures;
  structural-digest behavior (existing truncation order preserved, error-cards
  inserted as a new tier only).
- claw-rsi: everything (zero touch this iteration).

## 6. v7.8.0 additive extension（双侧卡存储 + 策略组合框架）

**Authority**: `claw-mem/docs/design/v7.8.0-strategy-cards-design.md`（APPROVED
2026-09-14）。全部为 **additive**：缺省路径（v7.7.0 调用方）行为逐字不变。

### 6.1 cardType 维度（schema + 查询）

- `ErrorPatternCard.cardType?: "error-pattern" | "success-strategy"`——缺省 =
  `"error-pattern"`（v7.6.0 卡零迁移；旧卡 metadata 不写 `card_type` 键，字节不变）。
- 成功侧载荷 `successStrategy: { subtype: "procedural" | "strategic" | "tool-usage";
  applicableWhen: string; steps: string[≥1] }`——cardType = `"success-strategy"`
  时必填（写入门 **V1'** 双向校验：成功卡缺载荷拒 / 非成功卡带载荷拒）。
  语义复用：`errorSignature.trigger` = applicableWhen 镜像槽（调用方显式传），
  `resolution` = 策略一句话摘要。
- 查询：`findCardsForInjection({ cardType? })`——缺省 `"error-pattern"`
  （v7.7.0 行为逐字不变）；`queryErrorPatternCards({ cardType? })`——缺省
  `undefined` = 双侧全出（审计面语义）。
- V3a 跨 type 查重仍 warn 不拒（错误卡 + 策略卡并存 = 合法且有价值状态）。

### 6.2 注入格式（✅ 行 + 双侧头）

```
[Experience Cards]                       ← 含策略卡时的块头；纯错误卡仍 [Error Pattern Cards]（逐字不变）
- ⚠️ [<cardId> | root: <category> | from: <source>] <trigger> → <resolution first sentence>
- ✅ [<cardId> | strategy: <subtype> | from: <source>] <applicableWhen> → <steps[0]>…
```

- ✅ 行 sub-type 段与 ⚠️ 行结构平行（cardId 锚 + from 溯源保留，供回写引用）；
  `steps[0]` 后 `…` 仅当还有更多步骤（单步骤不带省略号）。
- 块头双态按内容自适应；纯错误卡列表块头与行**逐字不变**（v7.7.0 兼容锁）。
  截断（whole-card drop / `(+N more suppressed)`）双侧共用。

### 6.3 回写扩展（lifecycle，§3 扩展字段）

`CardEffectiveness.lifecycle?: { stableRuns?: number; backwardRetention?: number;
pathAttribution?: string }`——宿主回写（时机同 §3），本版**只建字段 + 持久化 +
报告透出，不造数**（v7.6.0 T3 诚实边界延续）。

### 6.4 T2 占位

`findCardsForInjection({ statusKey? })`——收下不加权（排序不变；加权待 ctx
消费实测数据后启用，design §3）。
