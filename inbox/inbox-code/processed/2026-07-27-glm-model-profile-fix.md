# Task: claw-ctx GLM 模型配置修正

**From**: Friday
**To**: Jarvis
**Date**: 2026-07-27
**Priority**: High
**Version**: v5.16.1

---

## 背景

当前 `claw-ctx/src/model-profile.ts` 中 GLM 系列模型的上下文窗口配置错误，需要根据官方数据修正。

---

## 正确配置

| 模型 | 当前配置 | 正确配置 | 变更 |
|------|---------|---------|------|
| **GLM-5** | 128k | **200k** | +72k |
| **GLM-5.1** | 128k | **200k** | +72k |
| **GLM-5.2** | 256k | **1M (1,000,000)** | +744k |

**数据来源**: GLM 官方文档（用户确认）

---

## 开发范围

### 文件位置
`~/workspace/osprojects/claw-ctx/src/model-profile.ts`

### 需要修改的代码块

```typescript
// 当前配置（错误）
{
  id: "glm-5",
  name: "GLM 5",
  provider: "GLM",
  cache: { staticPrefixBonus: true, supported: true },
  context: { maxTokens: 128000, effectiveWindowRatio: 0.85, prefersSummary: false },
  optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code"], compressionThreshold: 100000 }
},
{
  id: "glm-5.1",
  name: "GLM 5.1",
  provider: "GLM",
  cache: { staticPrefixBonus: true, supported: true },
  context: { maxTokens: 128000, effectiveWindowRatio: 0.85, prefersSummary: false },
  optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code"], compressionThreshold: 100000 }
},
{
  id: "glm-5.2",
  name: "GLM 5.2",
  provider: "GLM",
  cache: { staticPrefixBonus: true, supported: true },
  context: { maxTokens: 256000, effectiveWindowRatio: 0.85, prefersSummary: false },
  optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code", "tests"], compressionThreshold: 200000 }
},

// 修正后配置
{
  id: "glm-5",
  name: "GLM 5",
  provider: "GLM",
  cache: { staticPrefixBonus: true, supported: true },
  context: { maxTokens: 200000, effectiveWindowRatio: 0.85, prefersSummary: false },
  optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code"], compressionThreshold: 150000 }
},
{
  id: "glm-5.1",
  name: "GLM 5.1",
  provider: "GLM",
  cache: { staticPrefixBonus: true, supported: true },
  context: { maxTokens: 200000, effectiveWindowRatio: 0.85, prefersSummary: false },
  optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code"], compressionThreshold: 150000 }
},
{
  id: "glm-5.2",
  name: "GLM 5.2",
  provider: "GLM",
  cache: { staticPrefixBonus: true, supported: true },
  context: { maxTokens: 1000000, effectiveWindowRatio: 0.9, prefersSummary: false },
  optimization: { strategy: "static-prefix", preloadPriority: ["docs", "code", "tests"], compressionThreshold: 800000 }
},
```

### 关键变更点

**GLM-5 和 GLM-5.1**:
- ✅ `maxTokens`: 128000 → **200000**
- ✅ `compressionThreshold`: 100000 → **150000**（75% of 200k）

**GLM-5.2**:
- ✅ `maxTokens`: 256000 → **1000000**
- ✅ `effectiveWindowRatio`: 0.85 → **0.9**（1M context 利用率更高）
- ✅ `compressionThreshold`: 200000 → **800000**（80% of 1M）

---

## 压缩阈值设计原则

**主动压缩触发时机**：
- GLM-5/5.1: 150k tokens（75% of 200k）
- GLM-5.2: 800k tokens（80% of 1M）

**理由**：
1. 避免在 70-80% 区间频繁触发
2. 留出足够的 response 空间（30-50k tokens）
3. 与 DeepSeek V4 (1M context, 800k threshold) 对齐

---

## 验收标准

- [ ] GLM-5 maxTokens 正确设置为 200000
- [ ] GLM-5.1 maxTokens 正确设置为 200000
- [ ] GLM-5.2 maxTokens 正确设置为 1000000
- [ ] 压缩阈值按比例调整
- [ ] npm run build 通过
- [ ] npm test 全部通过
- [ ] 版本号更新为 v5.16.1

---

## 项目位置

`~/workspace/osprojects/claw-ctx/`

---

## 影响范围

- ✅ 影响 ProactiveCompactionController 的触发阈值
- ✅ 影响 ModelAwareOptimizer 的优化策略
- ✅ 影响用户当前使用的 `joybuilder-plan/GLM-5`

**用户当前配置**：
```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "joybuilder-plan/GLM-5"
      }
    }
  }
}
```

修正后，GLM-5 的压缩阈值从 100k 提升到 150k，延迟触发时机，避免过早压缩。

---

## 备注

**其他需要同步检查的模型**：
- DeepSeek V4 Pro: 应该是 1M context（已在 v4 配置中）
- 其他模型建议验证官方文档

**参考**：
- Gemini 1.5 Pro: 1M context, threshold 800k
- DeepSeek V4 Pro: 1M context, threshold 800k（建议统一）
