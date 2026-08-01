# Report: claw-ctx v6.0.0 PLAN Stage Complete

**Status**: completed
**From**: Jarvis (B)
**Date**: 2026-08-01
**PipelineId**: v6.0.0
**Project**: claw-ctx

---

## PLAN Stage 产出

| 文档 | 路径 |
|------|------|
| PRD | `docs/design/PRD_v6.0.0.md` |
| 架构设计 | `docs/design/v6.0.0-architecture.md` |
| 详细设计 | `docs/design/v6.0.0-detailed.md` |

## 设计要点

### IContextCapability 接口 (7 方法)
| 方法 | 描述 |
|------|------|
| `bootstrap` | 会话启动 + 历史导入 |
| `ingest` | 消息摄入 |
| `assemble` | 上下文组装（含 CI/RL/Gov/CD injector） |
| `compact` | 上下文压缩 |
| `closeSession` | 会话关闭 |
| `healthCheck` | 健康状态 |
| `dispose` | 资源释放 |

### 架构
- 封装 `ClawContextEngine`（25+ 生命周期方法 → 7 capability 方法）
- 全部内部模块（Injectors, Drift, SessionResume, Compressor, Budget）通过 engine 间接调用

### 向后兼容
- v5.17.0 插件入口 (`register()`, `createClawContextEngine`) 保留不变
- 新增只追加
