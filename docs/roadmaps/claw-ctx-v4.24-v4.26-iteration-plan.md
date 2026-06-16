# claw-ctx v4.24.0 - v4.26.0 迭代计划

**规划时间**: 2026-06-16
**Author**: Friday
**基于**:
- v4.x 迭代计划未完成功能
- v4.23.0 测试问题修复
- v5.0.0 计划功能拆分

---

## 版本总览

| 版本 | 核心定位 | 重点 |
|------|----------|------|
| **v4.24.0** | 测试修复 + Self-Refinement | Bug修复 + 输出质量反馈 |
| **v4.25.0** | 仓库卫生 + 安全合规 | 构建产物清理 + SECURITY.md |
| **v4.26.0** | 工程质量 + 文档完善 | ESLint + TypeDoc + ADR |

---

## v4.24.0 — 测试修复 + Self-Refinement

**目标**: 修复 v4.23.0 遗留的 3 个测试问题，完成原计划中的 Self-Refinement 功能

### 功能清单

| 功能 | 说明 | 来源 |
|------|------|------|
| **测试修复** | version 断言 4.22.0 → 4.23.0 | v4.23.0 遗留 |
| **测试修复** | getKeyEntities 性能阈值调整 | v4.23.0 遗留 |
| **输出质量反馈** | 集成到 dreaming pipeline | v4.23.0 原计划 |
| **推理策略** | CoT/ToT/GoT 支持 | v4.23.0 原计划 |

### 验收标准

- [ ] 2 个 version 断言修复
- [ ] getKeyEntities 性能阈值调整或优化
- [ ] 输出质量反馈功能完成
- [ ] CoT/ToT/GoT 推理策略支持
- [ ] 测试 567/567 通过

### 依赖

- claw-mem >= v6.19.0

---

## v4.25.0 — 仓库卫生 + 安全合规

**目标**: 清理构建产物，添加安全政策，建立安全基线

### 功能清单

| 功能 | 说明 | 来源 |
|------|------|------|
| **仓库清理** | dist/, coverage/, .DS_Store 从 Git 移除 | v5.0.0-beta.1 |
| **.gitignore** | 更新排除构建产物 | v5.0.0-beta.1 |
| **SECURITY.md** | 安全漏洞报告流程 | v5.0.0-beta.1 |
| **CONTRIBUTING.md** | 贡献指南 | v5.0.0-beta.1 |
| **项目定位澄清** | HTML 94.9% 问题说明 | v5.0.0-beta.1 |

### 验收标准

- [ ] .gitignore 包含所有构建产物
- [ ] dist/ coverage/ 已从 Git 移除
- [ ] SECURITY.md 存在且完整
- [ ] CONTRIBUTING.md 存在且完整

---

## v4.26.0 — 工程质量 + 文档完善

**目标**: 提升代码质量，完善文档

### 功能清单

| 功能 | 说明 | 来源 |
|------|------|------|
| **ESLint 配置** | @typescript-eslint 集成 | v5.0.0-beta.2 |
| **tsconfig 修复** | moduleResolution 改为 NodeNext | v5.0.0-beta.2 |
| **package.json 完善** | 添加 engines/exports/files | v5.0.0-beta.2 |
| **License Header** | 所有 .ts 文件添加 Apache 2.0 header | v5.0.0-beta.2 |
| **TypeDoc** | API 文档自动生成 | v5.0.0-rc.1 |
| **ADR** | 架构决策记录 | v5.0.0-rc.1 |
| **README 更新** | 架构图更新为当前版本 | v5.0.0-rc.1 |

### 验收标准

- [ ] ESLint 检查通过
- [ ] TypeScript 编译通过
- [ ] TypeDoc 文档可生成
- [ ] ADR 文档存在
- [ ] README 架构图更新

---

## 版本依赖关系

```
v4.24.0 (测试修复 + Self-Refinement)
    ↓
v4.25.0 (仓库卫生 + 安全合规)
    ↓
v4.26.0 (工程质量 + 文档完善)
    ↓
v5.0.0 (生产发布)
```

---

## 任务分配

| Role | Responsibility |
|------|----------------|
| Friday | 规划 + 验收 |
| Jarvis | 开发实现 |
| Edith | 独立验收测试 |

---

## 待定功能

以下功能从 v4.x 迭代计划移至后续版本：

| 功能 | 原计划 | 移至 |
|------|--------|------|
| 图结构增强 + KnowledgeGraph 集成 | v4.24.0 | v5.x |
| 多跳推理支持 | v4.24.0 | v5.x |
| Long Sequence 优化 (位置编码) | v4.22.0 | v5.x |
| 滑动窗口增强 | v4.22.0 | v5.x |

**原因**: v5.0.0 前优先解决工程债务和质量基础问题

---

## 更新日志

- 2026-06-16: 合并 v4.x 迭代计划未完成功能 + v4.23.0 测试问题 + v5.0.0 计划到 v4.24.0-v4.26.0
