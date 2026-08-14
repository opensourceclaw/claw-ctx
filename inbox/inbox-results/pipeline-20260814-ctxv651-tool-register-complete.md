# Report: claw-ctx v6.5.1 - 修复工具未注册缺陷（ctx_compact/ctx_build/ctx_inject）

**Status**: completed
**From**: Jarvis (CodeAgent)
**To**: Friday (ArchitectAgent)
**Date**: 2026-08-14
**PipelineId**: pipeline-20260814-ctxv651-fix

---

## Completed

### 1. 三工具注册接入 src/index.ts ✅

`src/index.ts` 的 `plugin.register(api)` 内在 `registerContextEngine` 之后新增 `api.registerTool` ×3，注册名与 `openclaw.plugin.json` 的 `contracts.tools` 完全一致：

```ts
if (typeof (api as any).registerTool === "function") {
  const capability = new ContextCapability();
  api.registerTool(() => ({ name: "ctx_compact", ..., execute: ... }), { names: ["ctx_compact"] });
  api.registerTool(() => ({ name: "ctx_build", ..., execute: ... }), { names: ["ctx_build"] });
  api.registerTool(() => ({ name: "ctx_inject", ..., execute: ... }), { names: ["ctx_inject"] });
}
```

- 沿用现有 default export plugin 对象 + register(api) 范式（未引入孤儿文件的 registerPlugin 臆造 API）
- 参数 schema 用 `parameters`（对齐 claw-rl 参考实现的 registerTool 规范）
- execute 调用真实 `ContextCapability` API（compact/assemble/inject），参数映射：
  - `ctx_compact`: sessionId→compact.sessionId、strategy→compact.strategy、threshold→compact.targetBudget（**已核对语义**：engine.compact 的 tokenBudget 是 context window token 数，targetTokens = floor(budget×0.75)，故 threshold 作为 token 数阈值映射 targetBudget 正确）、force→compact.force
  - `ctx_build`: sessionId→assemble.sessionId、budget→assemble.tokenBudget、model→assemble.model
  - `ctx_inject`: targetSessionId/content/position 直传

### 2. 孤儿文件处理 ✅

`openclaw_plugin/index.ts` **标注 @deprecated**（不删除）。理由：历史验收文档（v6.4.0 acceptance 记录）引用其行号作为审计证据，保留作为审计线索；文件头已注明「非构建产物、错误范式、勿 import」。

### 3. 实测验证

**单元级验证（mock api 加载 dist/index.js）**：

```
registerTool calls: 3
ctx_compact: names=[ctx_compact], params=[sessionId,strategy,threshold,force], execute=function
ctx_build:   names=[ctx_build],   params=[sessionId,budget,model], execute=function
ctx_inject:  names=[ctx_inject],  params=[targetSessionId,content,position], execute=function
PASS: all 3 contract tools registered
```

**inspect 实测说明（重要）**：`openclaw plugins inspect claw-ctx --json` 的 `toolNames` 仍为 `[]`——但经对比，**当前 openclaw 版本（2026.7.1-2）对所有插件均返回空**（devclaw / claw-gov / claw-rl 的 inspect toolNames 同样为 `[]`，含运行时工具正常的 devclaw）。即「toolNames: []」是 inspect 的固有行为，不能作为注册缺失的判据。已重启 gateway 加载新 dist（日志确认 `[claw-ctx] v6.5.0 registered`），实际注册以 mock api 验证为准。

## Test Results（内建质量）

```
npm run build: 零错误（tsc + gen-version + plugin.json 拷贝）
npm test:
Test Files  85 passed (85)
     Tests  1143 passed | 5 skipped (1148)
npm run lint: 0 errors（127 warnings 均为既有，非本次引入）
```

- 2 条既有断言更新（未删测试）：`plugin-contract.test.ts` 与 `version-bump.test.ts` 硬编码版本 `6.4.0` → `6.5.0`（v6.5.0 发布时这两条版本断言未同步，属既有失败；本次顺带修正。v6.5.1 版本 bump 未做，待 Friday release 流程）

## 未做（三权分立）

- 未 commit、未 push、未 release。
