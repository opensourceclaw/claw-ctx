# Architecture

claw-ctx is a standalone Context Engine plugin for OpenClaw.

## Components

- `src/engine.ts` — ClawContextEngine class implementing ContextEngine interface
- `src/index.ts` — Plugin registration entry point

## Dependencies

- **claw-mem**: MemoryManager for search/store operations
- **OpenClaw SDK**: ContextEngine interface types

## Data Flow

```
Agent Prompt → assemble() → search claw-mem → filter + budget → inject → Model
                   ↑                              ↓
              cache (30s TTL)              systemPromptAddition
```
