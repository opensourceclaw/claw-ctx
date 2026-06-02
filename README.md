# claw-ctx

Standalone Context Engine plugin for OpenClaw. Integrates with claw-mem for memory retrieval.

## Features

- **Token Budget Control** — Bisection-based selection with CJK-aware estimation
- **Confidence Gating** — Filters low-confidence memories (min score 0.3)
- **Memory Integration** — Uses claw-mem MemoryManager for search/store
- **Subagent Lifecycle** — Fork/isolate modes, memory merging on completion

## Installation

```bash
cd ~/workspace/osprojects/claw-ctx
npm install
npm run build
```

## Configuration

Add to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "load": { "paths": ["/path/to/claw-ctx/dist"] },
    "slots": {
      "contextEngine": "claw-ctx"
    }
  }
}
```

## Architecture

```
claw-mem (memory storage)  ←  claw-ctx (context assembly)
     ↓ search/store                  ↓ assemble/inject
  SQLite / filesystem            OpenClaw Agent prompt
```

## License

Apache-2.0
