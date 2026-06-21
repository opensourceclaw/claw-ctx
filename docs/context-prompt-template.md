# Context Prompt Template — v5.0.0

## Input Format

```typescript
interface ContextRequest {
  /** Search or context query */
  query: string;
  /** Token budget for context assembly */
  budget: number;
  /** Context strategy */
  strategy: "retrieval" | "recent" | "hybrid" | "rl-enhanced";
  /** Optional configuration */
  options?: {
    minConfidence?: number;
    maxItems?: number;
    topK?: number;
    window?: "session" | "1h" | "6h" | "24h";
    retrievalWeight?: number;
    memoryTypes?: string[];
  };
}
```

## Output Format

```typescript
interface ContextResponse {
  /** Assembled context items */
  items: ContextItem[];
  /** Total token count */
  tokenCount: number;
  /** Strategy used */
  strategy: string;
  /** Metadata */
  metadata: {
    retrievalTime: number;
    cacheHit: boolean;
    confidenceAvg: number;
    strategyWeights?: Record<string, number>;
  };
}

interface ContextItem {
  /** Unique ID */
  id: string;
  /** Content text */
  content: string;
  /** Relevance score 0-1 */
  score: number;
  /** Source type */
  source: "memory" | "conversation" | "governance" | "ci" | "cross-domain";
  /** Metadata */
  metadata?: Record<string, unknown>;
}
```

## Example

**Request**:
```json
{
  "query": "security review for PR #42",
  "budget": 4000,
  "strategy": "hybrid",
  "options": { "topK": 8, "window": "24h" }
}
```

**Response**:
```json
{
  "items": [
    {
      "id": "mem-001",
      "content": "PR #42 introduces new auth middleware",
      "score": 0.92,
      "source": "memory"
    },
    {
      "id": "gov-001",
      "content": "Security policy: OWASP Top 10 compliance required",
      "score": 0.85,
      "source": "governance"
    }
  ],
  "tokenCount": 3200,
  "strategy": "hybrid",
  "metadata": {
    "retrievalTime": 45,
    "cacheHit": false,
    "confidenceAvg": 0.88
  }
}
```
