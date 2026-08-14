# Task: claw-ctx — 修复 v6.4.0/v6.5.0 工具未注册缺陷（ctx_compact/ctx_build/ctx_inject）

**From**: Friday (ArchitectAgent, A)
**To**: Jarvis (CodeAgent, B)
**Date**: 2026-08-14
**Stage**: CODE
**SubStage**: implementation
**Priority**: P1（release 缺陷，公告声明与运行时不符）
**PipelineId**: pipeline-20260814-ctxv651-fix
**Project**: claw-ctx
**Version**: v6.5.1（patch fix）
**Issue**: 工具注册缺失（v6.4.0 起）

---

## ⚠️ Inbox 绝对路径

```
Read:   /Users/liantian/workspace/osprojects/claw-ctx/inbox/inbox-code/
Write:  /Users/liantian/workspace/osprojects/claw-ctx/inbox/inbox-results/
Repo:   /Users/liantian/workspace/osprojects/claw-ctx/
```

## 缺陷定性（已实证）

claw-ctx 的 `openclaw.plugin.json` 声明 `contracts.tools: [ctx_compact, ctx_build, ctx_inject]`（v6.4.0 起），但 `openclaw plugins inspect claw-ctx` 实测 `toolNames: []` —— **三个工具在运行时根本未注册**。

**根因**（已定位）：
- 真实 plugin 入口是 `dist/index.js`（由 `src/index.ts` 构建，经 `package.json` 的 `openclaw.extensions: ["./dist/index.js"]` 加载）。
- `src/index.ts` 的 `register(api)` **只调用了 `api.registerContextEngine(...)`，从未调用 `api.registerTool(...)`**。
- 真正注册三个工具的代码只在孤儿文件 `openclaw_plugin/index.ts`（未 git 跟踪、版本硬编码 6.4.0、未进构建、未被任何 entrypoint 引用）。

## 任务

把三个工具的注册逻辑**正确接入 `src/index.ts` 的 `register(api)`**，使 `dist/index.js` 加载时 `toolNames` 非空。

### 关键约束（务必遵守）

1. **注册范式**：沿用 `src/index.ts` 现有的 **`default export plugin` 对象 + `register(api)` 方法**（不要引入 `openclaw_plugin/index.ts` 里臆造的 `api.registerPlugin(...)` / 独立 `export function register` / `export async function activate` 范式）。

2. **工具注册 API**：用 `api.registerTool(...)`（参考 OpenClaw plugin SDK 规范），且 **runtime `registerTool` 注册必须与 `contracts.tools` 的名字完全一致**（manifest.md 明确要求）。

3. **工具实现调用真实 capability**：`src/capability/context-capability.ts` 的 `ContextCapability` 类已有 `compact` / `assemble` / `inject` 方法（签名见下）。调用时对齐真实签名，**不要照抄孤儿文件的臆造参数**：

   ```ts
   // 真实签名（src/capability/context-capability.ts）
   compact(params: { sessionId; targetTokens?; targetBudget?; strategy?; force? }): Promise<CompactResult>
   assemble(params: { sessionId; systemPrompt?; messages?; tokenBudget?; model? }): Promise<AssembleResult>
   inject(params: { targetSessionId; content; position? }): Promise<InjectResult>
   ```

4. **工具参数 → capability 参数映射**（供参考，Jarvis 需自行核实语义）：
   - `ctx_compact`：`sessionId`(必填) → `compact.sessionId`；`strategy` → `compact.strategy`；`threshold` → `compact.targetBudget`（注意：孤儿文件把 `threshold` 映射成 `targetBudget`，请核对 `threshold` 语义是 token 阈值还是比例，对齐 `compact` 的真实参数 `targetTokens`/`targetBudget`）；`force` → `compact.force`
   - `ctx_build`：`sessionId` → `assemble.sessionId`；`budget` → `assemble.tokenBudget`；`model` → `assemble.model`
   - `ctx_inject`：`targetSessionId` → `inject.targetSessionId`；`content` → `inject.content`；`position` → `inject.position`

5. **处理孤儿文件**：`openclaw_plugin/index.ts` 是半成品/臆造（错误的 `registerPlugin` 范式 + 版本 6.4.0），**不要在实现里引用它**；完成正确实现后，可考虑删除该文件（或标注废弃），由你判断并报告。

6. **只改源码，不 commit / 不 push / 不 release**（三权分立）。

## 验收标准

- [ ] `dist/index.js` 构建后，`register(api)` 里调用 `api.registerTool` 注册 `ctx_compact`/`ctx_build`/`ctx_inject` 三个工具，名字与 `contracts.tools` 完全一致
- [ ] `openclaw plugins inspect claw-ctx` 实测 `toolNames` 非空（含三个工具）
- [ ] 工具 `execute` 正确调用 `ContextCapability` 的 `compact`/`assemble`/`inject`，参数映射语义正确
- [ ] 全量测试绿（如实报数字），build 零错误
- [ ] 报告里说明 `openclaw_plugin/index.ts` 的处理方式（删除 or 废弃标注）

## 输出文档

完成后写 `inbox/inbox-results/pipeline-20260814-ctxv651-tool-register-complete.md`（Status: completed，附实测 inspect 结果 + 测试数字 + 工具注册代码片段）。

## ⚠️ 提醒

- ❌ 不要照抄 `openclaw_plugin/index.ts`（它是错误范式的半成品，`registerPlugin` 是臆造旧 API）
- ✅ 以 `src/index.ts` 现有 `plugin.register(api)` 范式 + `src/capability` 真实 API 为准
- ⚠️ 工具名、参数名、capability 调用都要对齐真实代码，有歧义投 inbox 问，不臆断

---

**启动时间**: 2026-08-14 22:22 GMT+8
