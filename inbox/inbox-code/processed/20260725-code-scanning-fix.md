# Task: claw-ctx Code Scanning 安全漏洞修复

**From**: Friday (A)
**To**: Jarvis (B)
**Date**: 2026-07-25
**Priority**: High
**Version**: v4.18.1

---

## 背景

GitHub Code Scanning 报告 4 个安全问题：

| 严重级别 | 数量 | 描述 |
|:--------:|:----:|------|
| **High** | 9 | ReDoS 正则表达式拒绝服务漏洞 |
| **Medium** | 4 | Workflow 未包含 permissions 配置 |

---

## 修复范围

### 1. ReDoS 漏洞 (High)

#### 1.1 `src/self-refinement/quality-evaluator.ts` (行 173)

**问题模式**:
```typescript
const CJK_UNCLOSED_BRACKETS = [
  /【[^】]*$/, /「[^」]*$/, /（[^）]*$/,
];
```

**问题**: `[^】]*` 在以 `【` 开头且包含大量重复字符的输入上可能引发灾难性回溯

**修复方案**: 使用长度限制
```typescript
const CJK_UNCLOSED_BRACKETS = [
  /【[^】]{0,500}$/, /「[^」]{0,500}$/, /（[^）]{0,500}$/,
];
```

#### 1.2 `src/multimodal_context_handler.ts` (行 84-130)

**问题模式**:
```typescript
const IMAGE_URL_PATTERN = /\.(png|jpg|jpeg|gif|webp|svg|bmp)(\?[^\s]*)?$/i;
const IMG_TAG_PATTERN = /!\[[^\]]*\]\(([^)]+)\)/g;
```

**问题**: `[\^\s]*` 和 `[^\]]*` 在特定输入上可能引发 ReDoS

**修复方案**:
1. 添加输入长度预检查（在 `extractMultimodalContent` 方法中已有，保留）
2. 限制正则匹配的贪婪程度：
```typescript
const IMAGE_URL_PATTERN = /\.(png|jpg|jpeg|gif|webp|svg|bmp)(\?[\s]{0,200})?$/i;
const IMG_TAG_PATTERN = /!\[[^\]]{0,200}\]\([^)]{0,500}\)/g;
```

### 2. Workflow 权限配置 (Medium)

**问题**: `.github/workflows/*.yml` 缺少 `permissions` 块

**修复方案**: 添加最小权限配置
```yaml
permissions:
  contents: read
  actions: read
  security-events: write
```

---

## 验收标准

- [ ] `npm run build` 通过
- [ ] `npm test` 全部通过
- [ ] Code Scanning 重新运行后无 High 级别漏洞
- [ ] 版本号更新至 v4.18.1

---

## 项目位置

`/Users/liantian/workspace/osprojects/claw-ctx`
