# claw-ctx 版本规划

## 当前版本
v4.2.2

## 版本规划

### v4.3.0 - Token 精确计数
- 集成 tiktoken/js-tiktoken
- 实现 TiktokenCounter 类
- FallbackCounter 备用方案

### v4.4.0 - 上下文漂移检测
- 实现 TopicModel 主题提取
- 实现 DriftDetector 漂移检测
- 多级别告警机制

### v4.5.0 - 智能预算分配
- 基于任务类型动态调整
- 基于上下文质量调整
- 预算分配优化

---

## 开发任务（待分配）

| 版本 | 功能 | 优先级 |
|------|------|--------|
| v4.3.0 | TiktokenCounter | P0 |
| v4.4.0 | DriftDetector | P0 |
| v4.5.0 | 智能预算分配 | P1 |