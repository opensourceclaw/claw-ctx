# Integration with claw-mem

claw-ctx depends on claw-mem's `MemoryManager` for memory operations.

## Setup

1. Install both plugins
2. Configure slots:
```json
{
  "plugins": {
    "slots": {
      "memory": "claw-mem",
      "contextEngine": "claw-ctx"
    }
  }
}
```

## Imports

claw-ctx imports from claw-mem's compiled dist:
```typescript
import { getMemoryManager } from "../../claw-mem/claw_mem_plugin/dist/src/memory_manager";
```
