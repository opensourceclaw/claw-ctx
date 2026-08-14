# MEMORY.md

<!-- Core Memory - Permanent Storage -->

## claw-ctx 工具注册缺陷（2026-08-14 定位，投 Jarvis 修复中）

- **缺陷**：claw-ctx v6.4.0/v6.5.0 声明 `contracts.tools: [ctx_compact, ctx_build, ctx_inject]`，但 `openclaw plugins inspect claw-ctx` 实测 `toolNames: []` —— 三工具从未真正注册。
- **根因**：真实入口 `src/index.ts` 的 `register(api)` 只调 `registerContextEngine`，没调 `registerTool`。真正注册三工具的代码只在孤儿文件 `openclaw_plugin/index.ts`（未 git 跟踪、硬编码 6.4.0、未进构建）。
- **定性**：`openclaw_plugin/index.ts` 是半成品/臆造（用了错误的 `registerPlugin` 范式 + 独立 `register/activate` 导出，而非规范的 `default export plugin` + `register(api)`）。
- **修复方向**：把三工具注册接入 `src/index.ts` 的 `register(api)`，用 `api.registerTool`，对齐 `src/capability/context-capability.ts` 的真实 `compact/assemble/inject` 签名。
- **任务已投**：`inbox/inbox-code/implement/pipeline-20260814-ctxv651-tool-register.md`，目标 v6.5.1 patch。
