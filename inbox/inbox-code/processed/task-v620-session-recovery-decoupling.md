# Task: claw-ctx v6.2.0 会话恢复解耦

**From**: Friday (A)
**To**: Jarvis (B)
**Date**: 2026-08-02
**Priority**: High
**Pipeline**: pipeline-20260802-v620-session-recovery
**Project**: claw-ctx
**Version**: v6.2.0

---

## 背景

实现会话恢复解耦，采用方案 A (串行恢复 + 容忍部分失败)。

**当前问题**：
```
当前: 协作式恢复
session_start → claw-mem.bootstrap() → 恢复记忆
           → claw-ctx.bootstrap() → 恢复上下文

问题: 两个组件独立恢复，缺乏协调，可能出现时序问题
```

**目标**：
- OpenClaw 统一协调会话恢复流程
- 实现串行恢复（记忆 → 上下文）
- 添加错误容忍机制

---

## 开发范围

### Phase 1: OpenClaw 协调

**文件**: OpenClaw Runtime (不在 claw-ctx 内)

**说明**: session_start 事件协调由 OpenClaw 统一处理，claw-ctx 只需确保 bootstrap 方法支持：
```typescript
async bootstrap({ 
  sessionId, 
  sessionFile,
  memoryReady?: boolean  // 标记记忆已就绪
}): Promise<void>
```

### Phase 2: claw-ctx 适配

**文件**: `src/bootstrap.ts` 或 `src/index.ts`

**修改**:
1. 添加 `memoryReady` 参数支持
2. 实现串行恢复逻辑
3. 添加错误容忍机制

---

## 版本更新

更新 `package.json` 版本: `5.16.5` → `6.2.0`

---

## 验收标准

- [ ] bootstrap 方法支持 memoryReady 参数
- [ ] 串行恢复执行（记忆 → 上下文）
- [ ] memory 不可用时优雅降级
- [ ] context 不可用时优雅降级
- [ ] npm run typecheck 通过
- [ ] npm run build 通过
- [ ] CHANGELOG.md 添加条目

---

## 项目位置

`/Users/liantian/workspace/osprojects/claw-ctx/`

---

## 重要提醒

- 这是一个跨组件的改动，部分协调逻辑在 OpenClaw Runtime
- 详细设计文档写到 `.devclaw/substage/code/detailed-design-v6.2.0.md`
