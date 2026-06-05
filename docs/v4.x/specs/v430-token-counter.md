# claw-ctx v4.3.0 Spec - Token 精确计数

## Overview

- **Project**: claw-ctx
- **Version**: 4.3.0
- **Feature**: Token 精确计数
- **Priority**: P0

## Goals

集成 tiktoken 实现精确的 token 计数。

## Requirements

### 功能需求

1. **TiktokenCounter.encode()**: 精确编码
2. **TiktokenCounter.encodeBatch()**: 批量编码
3. **TiktokenCounter.decode()**: 解码
4. **FallbackCounter**: 降级方案

### 支持模型

- cl100k_base
- p50k_base
- r50k_base

## Acceptance Criteria

- [ ] Token 计数精度 >= 95%
- [ ] 向后兼容现有 API
- [ ] 测试覆盖率 >= 80%
