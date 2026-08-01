# Task: claw-ctx v6.0.0 PLAN Stage

**From**: Friday (A)
**To**: Jarvis (B)
**Date**: 2026-08-01
**Priority**: High
**PipelineId**: v6.0.0
**Project**: claw-ctx
**Version**: v6.0.0
**Stage**: PLAN

---

## Background

claw-ctx v6.0.0 目标：Capability Layer 迁移，将上下文管理模块封装为统一的 IContextCapability 接口。

现有 v5.17.0 功能模块：
- engine (上下文引擎)
- adaptive (自适应压缩)
- detection (漂移检测)
- importance-scorer (重要性评分)
- semantic-compressor (语义压缩)
- proactive-compaction-controller (主动压缩控制)
- token-counter (Token 计数)
- session-resume (会话恢复)

---

## Task

请创建以下设计文档：

### 1. PRD (Product Requirements Document)

**路径**: `docs/design/PRD_v6.0.0.md`

**内容**:
- 问题陈述：为什么需要 Capability Layer
- 用户故事
- 功能需求
- 非功能需求

### 2. 架构设计

**路径**: `docs/design/v6.0.0-architecture.md`

**内容**:
- 系统架构图
- 模块分层
- IContextCapability 接口设计
- 与 OpenClaw 集成方式
- 向后兼容方案

### 3. 详细设计

**路径**: `docs/design/v6.0.0-detailed.md`

**内容**:
- 接口定义 (TypeScript)
- 类实现
- 文件结构
- API 兼容性方案

---

## 迭代范围 (来自计划文档)

### Phase 1: 准备阶段 (v6.0.0)
- 定义 IContextCapability 接口
- 创建 Capability 适配层
- 实现向后兼容包装

### Phase 2: 迁移阶段 (v6.1.0)
- 注册 ContextCapability 到 OpenClaw
- 添加 Capability 缓存机制

### Phase 3: 验证阶段 (v6.2.0)
- Contract Tests
- 回归测试

---

## Acceptance Criteria

- [ ] PRD 文档完成
- [ ] 架构设计文档完成
- [ ] 详细设计文档完成

---

## Output

完成后请在 `inbox/inbox-results/` 创建回复文档。

---

## Project Location

`~/workspace/osprojects/claw-ctx/`
