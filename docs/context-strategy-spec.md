# Context Strategy Specification — v5.0.0

## 1. retrieval strategy

**Use case**: Factual question-answering, knowledge retrieval, memory search.

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Search query |
| `topK` | number | 10 | Max results |
| `minConfidence` | number | 0.5 | Minimum confidence threshold |
| `memoryTypes` | string[] | ["semantic","episodic"] | Memory layers to search |

**Algorithm**: BM25 + semantic similarity ranking → topK filtering.

**Example**:
```json
{
  "strategy": "retrieval",
  "query": "What was the decision on issue #15?",
  "budget": 2000,
  "options": { "topK": 5, "minConfidence": 0.6 }
}
```

---

## 2. recent strategy

**Use case**: Session continuity, conversation context, near-term memory.

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `window` | "session" \| "1h" \| "6h" \| "24h" | "session" | Time window |
| `maxItems` | number | 20 | Max context items |
| `decayRate` | number | 0.9 | Time decay factor |

**Algorithm**: Recency-weighted selection with exponential decay.

**Example**:
```json
{
  "strategy": "recent",
  "query": "current session context",
  "budget": 1500,
  "options": { "window": "session", "maxItems": 10 }
}
```

---

## 3. hybrid strategy

**Use case**: General purpose — combines retrieval relevance with recency.

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `retrievalWeight` | number | 0.6 | Retrieval vs recency balance |
| `topK` | number | 10 | Max results |
| `window` | string | "6h" | Recency window |

**Algorithm**: `score = retrievalWeight * semanticScore + (1-retrievalWeight) * recencyScore`.

**Example**:
```json
{
  "strategy": "hybrid",
  "query": "current task context",
  "budget": 3000,
  "options": { "retrievalWeight": 0.7 }
}
```

---

## 4. rl-enhanced strategy

**Use case**: Adaptive optimization using claw-rsi reinforcement learning feedback.

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | string | "default" | RL model identifier |
| `explorationRate` | number | 0.1 | Exploration vs exploitation |
| `feedbackWindow` | number | 100 | Feedback history size |

**Algorithm**: RL policy selects strategy weights based on historical success metrics.

**Example**:
```json
{
  "strategy": "rl-enhanced",
  "query": "task optimization",
  "budget": 2500,
  "options": { "explorationRate": 0.15 }
}
```
