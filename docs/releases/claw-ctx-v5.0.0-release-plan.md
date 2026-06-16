# claw-ctx v5.0.0 Release Plan

**Project**: claw-ctx (OpenClaw Context Engine)
**Current Version**: v4.22.0
**Target Version**: v5.0.0
**Release Timeline**: 4-6 weeks

---

## Release Schedule

| Version | Type | Focus Area | Target Date |
|---------|------|------------|-------------|
| v5.0.0-beta.1 | Beta | 仓库卫生 + 安全合规 | Week 1 |
| v5.0.0-beta.2 | Beta | 工程质量问题修复 | Week 2 |
| v5.0.0-beta.3 | Beta | CJK 支持 + 性能基准 | Week 3 |
| v5.0.0-rc.1 | RC | 稳定性 + 文档完善 | Week 4 |
| v5.0.0-rc.2 | RC | Bug 修复 + 测试补充 | Week 5 |
| v5.0.0-rc.3 | RC | 冻结 + 最终验证 | Week 6 |
| v5.0.0 | Stable | 生产发布 | Week 6-7 |

---

## v5.0.0-beta.1 — 仓库卫生 + 安全合规

**目标**: 解决最紧迫的 P0 问题，清理仓库，建立安全基线

### Issues Fixed

| # | Issue | Severity | Action |
|---|-------|----------|--------|
| 1 | dist/, coverage/, .DS_Store 提交到 Git | P0 | 更新 .gitignore，git rm --cached |
| 2 | 缺少 SECURITY.md | P0 | 创建安全漏洞报告流程 |
| 3 | 缺少 CONTRIBUTING.md | P0 | 创建贡献指南 |
| 4 | HTML 占 94.9% (实际代码仅 3%) | P0 | 澄清项目定位 |

### Changes

```bash
# .gitignore 更新
dist/
coverage/
cov-merged/
.DS_Store
*.log
devclaw.json
node_modules/
```

### Files Added

- `SECURITY.md`
- `CONTRIBUTING.md`

### Files Modified

- `.gitignore`

---

## v5.0.0-beta.2 — 工程质量问题修复

**目标**: 修复 P1 级别工程问题，提升代码质量

### Issues Fixed

| # | Issue | Severity | Action |
|---|-------|----------|--------|
| 1 | tsconfig moduleResolution 过时 | P1 | 改为 NodeNext |
| 2 | 缺少 ESLint 配置 | P1 | 添加 @typescript-eslint |
| 3 | package.json 缺 engines/exports | P1 | 完善 package.json |
| 4 | 源文件缺 License Header | P1 | 添加 Apache 2.0 header |
| 5 | SemVer 版本号混乱 | P0 | 统一为 v5.0.0 |

### Changes

**tsconfig.json**
```json
{
  "compilerOptions": {
    "moduleResolution": "NodeNext",
    "module": "NodeNext"
  }
}
```

**package.json**
```json
{
  "engines": { "node": ">=18.0.0" },
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "files": ["dist", "openclaw.plugin.json", "LICENSE", "README.md"]
}
```

### Files Added

- `eslint.config.js`

### Files Modified

- `tsconfig.json`
- `package.json`
- 所有 .ts 文件（添加 License Header）

---

## v5.0.0-beta.3 — CJK 支持 + 性能基准

**目标**: 提升国际化支持，建立性能基准测试体系

### Issues Fixed

| # | Issue | Severity | Action |
|---|-------|----------|--------|
| 1 | SummaryGenerator 不支持 CJK | P2 | 改进 Unicode 拆分规则 |
| 2 | 性能测试失败 (85ms/20ms) | P2 | 调整阈值或修复回归 |
| 3 | 无性能基准测试追踪 | P2 | 建立 benchmark 体系 |
| 4 | 测试覆盖率不透明 | P2 | 集成 Codecov |

### Changes

**CJK 支持改进** (`summary-generator.ts`)
```typescript
// 改进前
const words = text.toLowerCase().split(/[^a-zA-Z0-9]+/)

// 改进后
const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u)
```

**性能基准测试**
```bash
# 添加 benchmark 命令
npm run benchmark
```

### Files Modified

- `src/session-resume/summary-generator.ts`
- `tests/performance/benchmark.test.ts`
- `package.json` (添加 benchmark 脚本)
- `vitest.config.ts` (调整阈值)

---

## v5.0.0-rc.1 — 稳定性 + 文档完善

**目标**: 冻结功能，开始完善文档

### Issues Fixed

| # | Issue | Severity | Action |
|---|-------|----------|--------|
| 1 | README 架构图不准确 | P2 | 更新为 v5.0.0 架构 |
| 2 | 缺少 API 完整文档 | P2 | 添加 TypeDoc |
| 3 | 无 ADR 文档 | P3 | 添加关键架构决策记录 |
| 4 | 无 Timeout/Circuit Breaker | P2 | 添加韧性机制 |

### Changes

- 更新 README.md 架构图
- 添加 TypeDoc 生成的 API 文档
- 添加 `docs/adr/` 目录
- 添加超时控制到外部调用

### Files Added

- `docs/adr/`
- TypeDoc 输出

### Files Modified

- `README.md`
- `src/engine.ts` (添加超时控制)

---

## v5.0.0-rc.2 — Bug 修复 + 测试补充

**目标**: 修复所有已知问题，补充测试

### Issues Fixed

| # | Issue | Severity | Action |
|---|-------|----------|--------|
| 1 | engine.ts await 缺失 (Edith #1) | P0 | 修复 |
| 2 | early return 跳过 session resume (Edith #2) | P0 | 修复 |
| 3 | 测试覆盖率不足 | P2 | 补充测试 |
| 4 | 无集成测试 | P2 | 添加 e2e 测试 |

### Changes

- 修复 `src/engine.ts:302` 和 `src/engine.ts:768` await 缺失
- 修复 early return 路径 session resume 注入
- 补充单元测试和集成测试

### Files Modified

- `src/engine.ts`
- `tests/` (补充测试)

---

## v5.0.0-rc.3 — 冻结 + 最终验证

**目标**: 代码冻结，进行全面验证

### Verification

| Check | Status |
|-------|--------|
| 563/563 测试通过 | ⏳ |
| TypeScript 编译 | ⏳ |
| ESLint 检查 | ⏳ |
| 类型检查 | ⏳ |
| 性能基准测试 | ⏳ |
| 手动探索测试 | ⏳ |

### Changes

- 版本号更新为 v5.0.0-rc.3
- 冻结代码变更
- 全面验证

---

## v5.0.0 — 生产发布

**目标**: 正式发布生产版本

### Release Checklist

- [ ] 所有测试通过
- [ ] CHANGELOG.md 更新
- [ ] 版本号更新
- [ ] Git tag 推送
- [ ] GitHub Release 创建
- [ ] npm publish (如适用)

### Version Bump

```
v4.22.0 → v5.0.0
```

### CHANGELOG.md 更新示例

```markdown
## v5.0.0 (2026-XX-XX)

### Breaking Changes
- 版本号语义统一为 Semantic Versioning
- Node.js 最低版本要求 18.0.0

### Features
- Session Resume 模块：实现隔夜会话连续性
- CJK 支持增强：Unicode 感知分词
- 性能基准测试体系

### Bug Fixes
- 修复 engine.ts await 缺失问题
- 修复 early return 路径 session resume 注入问题

### Improvements
- 添加 ESLint 代码检查
- 添加 SECURITY.md / CONTRIBUTING.md
- 完善 package.json 配置
- 改进 tsconfig 配置

### Docs
- 更新 README 架构图
- 添加 API 文档
- 添加 ADR 文档
```

---

## 任务分配

| Role | Responsibility |
|------|----------------|
| Friday | 规划 + 验收 |
| Jarvis | 开发实现 |
| Edith | 独立验收测试 |

---

## 验收标准

| Version | Criteria |
|---------|----------|
| beta.1 | 仓库清理完成，SECURITY.md + CONTRIBUTING.md 存在 |
| beta.2 | ESLint 通过，TypeScript 编译通过，License Header 添加 |
| beta.3 | CJK 测试通过，性能基准测试建立 |
| rc.1 | 文档完善，超时控制添加 |
| rc.2 | Edith 验收通过 |
| rc.3 | 代码冻结，全面验证 |
| v5.0.0 | 发布完成 |

---

## 风险与 mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| 迭代过快导致质量下降 | 高 | 严格遵循验收流程 |
| CJK 支持复杂度 | 中 | 分阶段实现，先覆盖常用场景 |
| 性能测试不稳定 | 中 | 调整阈值，添加环境适配 |
| 社区反馈不足 | 低 | 积极收集反馈，持续改进 |
