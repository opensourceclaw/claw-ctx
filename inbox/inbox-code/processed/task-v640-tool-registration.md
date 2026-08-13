# Task: claw-ctx v6.4.0 — Tool Registration（实现 ctx_compact / ctx_build / ctx_inject）

**From**: Friday (A)
**To**: Jarvis (B)
**Date**: 2026-08-13
**Stage**: CODE → BUILD → TEST
**Priority**: P0
**PipelineId**: pipeline-20260805-ctxv640
**Project**: claw-ctx
**Version**: v6.4.0

---

## ⚠️ Inbox 绝对路径

```
Read:   /Users/liantian/workspace/osprojects/claw-ctx/inbox/inbox-code/
Write:  /Users/liantian/workspace/osprojects/claw-ctx/inbox/inbox-results/
Design: /Users/liantian/workspace/osprojects/claw-ctx/inbox/inbox-plan/v6.4.0-tool-registration-design.md
Repo:   /Users/liantian/workspace/osprojects/claw-ctx/
```

## 背景

claw-ctx 当前 API-only、0 工具，无法被 OpenClaw 直接调用（P0 gap）。详细设计见上 Design 路径。本任务把 `ContextCapability` 的三个能力包装成 OpenClaw 工具。

参考实现：`~/workspace/osprojects/claw-rl/claw_rl_plugin/index.ts`（`api.registerTool` 纯 TS 样例）。

## 实现任务

### 1. 新增 `ContextCapability.inject` 能力方法
- `src/capability/types.ts`：加 `InjectParams`（targetSessionId/content/position?）、`InjectResult`（injected/reason?）；`IContextCapability` 加 `inject(params): Promise<InjectResult>`。
- `src/capability/context-capability.ts`：实现 `inject`（复用现有消息写入路径；`replace` 无底层语义则降级 append 并在 reason 说明）。
- `src/capability/index.ts` + `src/index.ts`：导出 inject 类型。

### 2. 实现工具注册
- `openclaw_plugin/index.ts` 的 `register(api)`：实例化 `ContextCapability`，用 `api.registerTool(...)` 注册 3 个工具（name 严格为 `ctx_compact`/`ctx_build`/`ctx_inject`），schema 按设计文档。

### 3. 更新清单与版本
- `openclaw.plugin.json`：加 `"contracts": { "tools": ["ctx_compact","ctx_build","ctx_inject"] }`；version 对齐 6.4.0。
- `package.json`：`6.3.0` → `6.4.0`。
- `CHANGELOG.md`：加 `[6.4.0]` 条目。

### 4. 测试（+≥6 文件，见设计文档测试需求表）
- 新建 `tests/unit/tools/` 下 5 个测试 + `tests/unit/capability/inject.test.ts`，共 ≥6 文件。

## 验收标准

- [ ] `npm run build` 零错误
- [ ] `npm test` 全绿（71 → ≥77 files，零回归）
- [ ] `openclaw.plugin.json` 有 contracts.tools 含 3 工具
- [ ] 3 个 registerTool 的 name 正确、schema 有效
- [ ] `ContextCapability.inject` 实现并测试通过
- [ ] 版本 6.4.0 + CHANGELOG
- [ ] 不要 git commit / push / release（Friday 统一提交）

## 输出文档

完成后在 `inbox/inbox-results/pipeline-20260805-ctxv640-complete.md` 创建完成报告。

## ⚠️ 提醒

- ✅ 三权分立：Jarvis 不 commit
- ❌ 不要 push / 不要 GitHub Release
- ✅ TypeScript + ESM ("type":"module") + Vitest
- ✅ 遵循 `docs/protocol/inbox-protocol.md`

---

**启动时间**: 2026-08-13 09:29 GMT+8
