# Task: claw-ctx 所有模型上下文窗口官方文档审计

**From**: Friday
**To**: Jarvis
**Date**: 2026-07-27
**Priority**: High
**Version**: v5.16.1

---

## 背景

需要验证 claw-ctx 中所有 35 个模型的上下文窗口配置是否与官方文档一致，并优化压缩阈值以达到最佳效果。

**已知问题**：
- GLM-5: 当前配置 128k，实际 200k ✅
- GLM-5.1: 当前配置 128k，实际 200k ✅
- GLM-5.2: 当前配置 256k，实际 1M ✅

---

## 审计范围

### 国内模型 (16 个)

#### 1. MiniMax
**官方文档**: https://www.minimaxi.com/document/guides/chat-model

| 模型 | 当前配置 | 官方文档 | 是否需要更新 |
|------|---------|---------|-------------|
| M2.5 | 128k | ? | ❓ |
| M3 | 256k | ? | ❓ |

**查询要点**：
- 搜索 "MiniMax M2.5 context window"
- 搜索 "MiniMax M3 context length"
- 验证是否支持多模态（影响策略）

---

#### 2. Kimi (Moonshot)
**官方文档**: https://platform.moonshot.cn/docs/intro

| 模型 | 当前配置 | 官方文档 | 是否需要更新 |
|------|---------|---------|-------------|
| k1.5 | 200k | ? | ❓ |
| k2 | 320k | ? | ❓ |

**查询要点**：
- 搜索 "Moonshot Kimi k1.5 context window"
- 搜索 "Kimi k2 context length"
- Kimi 以长上下文著称，需要确认最新数据

---

#### 3. DeepSeek
**官方文档**: https://api-docs.deepseek.com/

| 模型 | 当前配置 | 官方文档 | 是否需要更新 |
|------|---------|---------|-------------|
| V3 | 128k | ? | ❓ |
| R1 | 128k | ? | ❓ |
| V4 Flash | 128k | ? | ❓ |
| V4 Pro | 256k | ? | ❓ |

**查询要点**：
- DeepSeek V3: 官方文档应明确标注
- DeepSeek R1: 是否与 V3 相同？
- DeepSeek V4: 新版本可能有变化
- **重点**：V4 Pro 是否真的是 1M context（与 GLM-5.2 对齐）

---

#### 4. Qwen (通义千问)
**官方文档**: https://help.aliyun.com/document_detail/610227.html

| 模型 | 当前配置 | 官方文档 | 是否需要更新 |
|------|---------|---------|-------------|
| Qwen 3 | 128k | ? | ❓ |
| Qwen 3.5 | 128k | ? | ❓ |
| Qwen 3.6 | 128k | ? | ❓ |
| Qwen 3.7 | 128k | ? | ❓ |
| Qwen 3.8 | 256k | ? | ❓ |

**查询要点**：
- Qwen 系列版本命名可能有歧义（2.5, 3, 3.5 等）
- 确认每个版本的具体上下文长度
- 是否有 Turbo/Max 等变体

---

#### 5. GLM (智谱)
**官方文档**: https://bigmodel.cn/dev/api/normal-model/glm-4

| 模型 | 当前配置 | 官方文档 | 是否需要更新 |
|------|---------|---------|-------------|
| GLM-5 | 128k | **200k** ✅ | ⚠️ 是 |
| GLM-5.1 | 128k | **200k** ✅ | ⚠️ 是 |
| GLM-5.2 | 256k | **1M** ✅ | ⚠️ 是 |

**已确认数据**（用户提供）：
- GLM-5: 200k
- GLM-5.1: 200k
- GLM-5.2: 1M

---

### 国际模型 (19 个)

#### 6. Mistral
**官方文档**: https://docs.mistral.ai/getting_started/models/

| 模型 | 当前配置 | 官方文档 | 是否需要更新 |
|------|---------|---------|-------------|
| Large 2 | 128k | ? | ❓ |

**查询要点**：
- Mistral Large 2 是否有更新版本
- 是否支持中间上下文（影响缓存策略）

---

#### 7. OpenAI
**官方文档**: https://platform.openai.com/docs/models

| 模型 | 当前配置 | 官方文档 | 是否需要更新 |
|------|---------|---------|-------------|
| GPT-4o | 128k | ? | ❓ |
| GPT-4.5 | 128k | ? | ❓ |
| GPT-5 | 256k | ? | ❓ |
| GPT-5.5 | 256k | ? | ❓ |
| GPT-5.6 | 512k | ? | ❓ |
| o1 | 200k | ? | ❓ |
| o2 | 200k | ? | ❓ |
| o3 | 256k | ? | ❓ |

**查询要点**：
- GPT-4o: 确认是 128k
- GPT-5 系列：这些是未来模型还是已发布？
- o 系列：推理模型的上下文窗口
- **重要**：验证这些模型是否真实存在（可能是虚构的）

---

#### 8. Claude (Anthropic)
**官方文档**: https://docs.anthropic.com/en/docs/about-claude/models

| 模型 | 当前配置 | 官方文档 | 是否需要更新 |
|------|---------|---------|-------------|
| 3.5 Sonnet | 200k | ? | ❓ |
| 3.7 Sonnet | 200k | ? | ❓ |
| Opus 4 | 200k | ? | ❓ |
| 4.6 | 256k | ? | ❓ |
| 5 | 512k | ? | ❓ |

**查询要点**：
- Claude 3.5 Sonnet: 确认是 200k
- Claude 4.6, 5: 这些版本是否已发布？
- Claude 的缓存机制：staticPrefixBonus 是否应该为 true

---

#### 9. Gemini (Google)
**官方文档**: https://ai.google.dev/gemini-api/docs/models/gemini

| 模型 | 当前配置 | 官方文档 | 是否需要更新 |
|------|---------|---------|-------------|
| 2.0 Flash | 128k | ? | ❓ |
| 2.5 Pro | 256k | ? | ❓ |
| 3 | 256k | ? | ❓ |
| 3.5 | 512k | ? | ❓ |
| 1.5 Pro | 1M | ? | ❓ |

**查询要点**：
- Gemini 1.5 Pro: 确认是 1M（或 2M？）
- Gemini 2.x, 3.x: 这些版本是否存在？
- Gemini 的缓存特性

---

## 压缩阈值优化原则

### 主动压缩触发时机

**公式**：
```
compressionThreshold = maxTokens * ratio
```

**ratio 推荐**：
- 小上下文 (< 200k): 0.75（75%）
- 中等上下文 (200k-500k): 0.78（78%）
- 大上下文 (> 500k): 0.80（80%）

**理由**：
1. 避免频繁触发压缩
2. 留出足够的 response 空间
3. 大上下文模型利用率更高

### 具体阈值计算

| Context Window | ratio | Threshold | 示例模型 |
|:--------------:|:-----:|:---------:|---------|
| 128k | 0.75 | 96k | GPT-4o, Qwen 3.x |
| 200k | 0.75 | 150k | GLM-5/5.1, Claude 3.5 |
| 256k | 0.78 | 200k | Qwen 3.8, GLM-5.2 (old) |
| 500k | 0.78 | 390k | GPT-5.6 |
| 1M | 0.80 | 800k | GLM-5.2, Gemini 1.5 Pro |
| 2M | 0.80 | 1.6M | Gemini 1.5 Pro (if 2M) |

---

## 验收标准

### 必须完成

- [ ] 使用 Tavily/web_fetch 查询每个模型的官方文档
- [ ] 记录每个模型的官方上下文窗口数值
- [ ] 标记需要更新的模型（与当前配置不一致）
- [ ] 更新 `model-profile.ts` 中的所有错误配置
- [ ] 按照压缩阈值优化原则调整 threshold
- [ ] 更新审计报告文档
- [ ] npm run build 通过
- [ ] npm test 全部通过
- [ ] 版本号更新为 v5.16.1

### 加分项

- [ ] 删除不存在的模型（如虚构的 GPT-5.x）
- [ ] 添加缺失的主流模型
- [ ] 更新模型显示名称（name 字段）
- [ ] 优化 effectiveWindowRatio（根据实际测试）

---

## 输出要求

### 1. 审计报告

更新 `docs/audits/2026-07-27-model-context-window-audit.md`，包含：
- 每个模型的查询结果（URL + 引用）
- 当前配置 vs 官方文档对比表
- 需要更新的模型列表
- 压缩阈值调整建议

### 2. 代码更新

更新 `src/model-profile.ts`，包含：
- 所有错误的 maxTokens 修正
- 所有 threshold 按比例调整
- 删除不存在的模型
- 添加缺失的模型（如果有）

### 3. 测试更新

如果新增/删除模型，更新相关测试用例。

---

## 项目位置

`~/workspace/osprojects/claw-ctx/`

---

## 时间预算

预计 3-4 小时（35 个模型 × 每个模型 5-10 分钟查询验证）

---

## 备注

**已知需要更新的模型**：
- GLM-5: 128k → 200k
- GLM-5.1: 128k → 200k
- GLM-5.2: 256k → 1M

**需要特别验证的模型**（可能是虚构的）：
- GPT-5, GPT-5.5, GPT-5.6
- Claude 4.6, Claude 5
- Gemini 3, Gemini 3.5
- OpenAI o2, o3

**建议**：
- 如果某个模型无法找到官方文档，标记为 "unverified"
- 如果某个模型确认不存在，从配置中删除
- 优先更新已知问题的模型（GLM 系列）
