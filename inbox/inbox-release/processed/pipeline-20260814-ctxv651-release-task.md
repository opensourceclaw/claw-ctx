# Release Task: claw-ctx v6.5.1

**From**: Friday (ArchitectAgent)
**To**: Karen (ReleaseAgent / DeployAgent)
**Approved By**: Peter (ProductOwner) — 2026-08-14 22:52 GMT+8
**Date**: 2026-08-14
**Version**: v6.5.1
**Stage**: RELEASE (release)
**PipelineId**: pipeline-20260814-ctxv651-fix
**Project**: claw-ctx

---

## 状态：Peter 已批复「同意」

v6.5.1（工具注册修复）实质工作已 100% 完成，Peter 已批复。请 Karen 执行 release 动作。

## 已完成（Friday，无需重做）

- 版本对齐 6.5.1：`package.json` / `openclaw.plugin.json` / `src/version.ts` / `README.md` badge / `CHANGELOG.md`
- git commit（**未 push**，main 分支）：
  - `bb13db4` fix(v6.5.1): register ctx_compact/ctx_build/ctx_inject tools at runtime (Friday gate)
- 验收：工具注册修复已由 Friday 验收（mock api 实测 3 个 registerTool 调用 + 全量测试绿）

## 修复内容（release note 要点）

- **工具注册修复**：`ctx_compact` / `ctx_build` / `ctx_inject` 三个工具此前声明在 `contracts.tools` 但运行时从未注册（注册代码只在孤儿文件 `openclaw_plugin/index.ts`，错误范式、未进构建）。现已接入 `src/index.ts` 的 `plugin.register(api)` via `api.registerTool`，对齐真实 `ContextCapability` API。
- 孤儿文件 `openclaw_plugin/index.ts` 标记 `@deprecated`（保留作为审计线索）。
- 修复 2 条版本断言（6.4.0 → 6.5.0）未在 v6.5.0 同步的问题。

## 待 Karen 执行的动作

```bash
cd /Users/liantian/workspace/osprojects/claw-ctx

# 1. push 主分支
git push origin main

# 2. 打 tag + push tag
git tag v6.5.1
git push origin v6.5.1

# 3. GitHub Release（创建 v6.5.1 release）
gh release create v6.5.1 \
  --title "claw-ctx v6.5.1: Fix tool registration (ctx_compact/ctx_build/ctx_inject)" \
  --notes "见 CHANGELOG v6.5.1 Fixed 段"
```

> tag 应指向最新 commit `bb13db4`。请打 tag 后 `git ls-remote --tags origin v6.5.1` 确认 push 成功。

## 完成后

在 `inbox/inbox-results/pipeline-20260814-ctxv651-release.md` 落 release 完成报告（branch、tag hash、GitHub Release URL）。
