# claw-ctx v4.4.0 Spec - 上下文漂移检测

## Overview

- **Project**: claw-ctx
- **Version**: 4.4.0
- **Feature**: 上下文漂移检测
- **Priority**: P0

## Goals

实现上下文漂移检测，识别会话中的主题变化。

## Requirements

### 功能需求

1. **TopicModel.extractTopics()**: 提取主题
2. **TopicModel.computeSimilarity()**: 计算相似度
3. **DriftDetector.detectDrift()**: 检测漂移
4. **DriftDetector.suggestActions()**: 建议行动

### 配置

- `similarityThreshold`: 0.6
- `driftWindow`: 3
- `alertLevels`: low/medium/high

## Acceptance Criteria

- [ ] 漂移检测准确率 >= 80%
- [ ] 向后兼容现有 API
- [ ] 测试覆盖率 >= 80%
