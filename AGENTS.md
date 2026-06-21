# CLAUDE.md — claw-ctx v5.0.0

## Project Overview

claw-ctx is the Context Engine for OpenClaw — provides intelligent context assembly, confidence gating, prompt strategy optimization, and cross-domain signal injection.

- **Language**: TypeScript (ESM)
- **Runtime**: Node.js ≥ 22
- **Testing**: vitest
- **Package**: `claw-ctx` (v5.0.0-beta.1)

## Build & Test

```bash
npm install          # Install dependencies
npm run build        # TypeScript compilation (tsc)
npm test             # Run vitest tests
npm run lint         # ESLint check
```

## Project Structure

```
src/
├── engine.ts                       # Core context assembly engine
├── confidence_gate.ts              # C2 confidence gating (adaptive/strict/disabled)
├── prompt_strategy_controller.ts   # Strategy selection + execution
├── auto-compact.ts                 # Automatic context compaction
├── auto-session.ts                 # Session auto-detection
├── ci_injector.ts                  # CI/CD signal injection
├── cross_domain_injector.ts        # Cross-domain context injection
├── governance_injector.ts          # Governance compliance injection
├── rl_injector.ts                  # RL-enhanced context injection
├── drift-detector.ts               # Context drift detection
├── memory_strategy_selector.ts     # Memory retrieval strategy selector
├── position_optimizer.ts           # Context position optimization
├── long-term-dependency-tracker.ts # Long-term dependency tracking
├── multimodal_context_handler.ts   # Multi-modal context handling
└── index.ts                        # Public API exports
```

## Testing Strategy

- **Unit tests**: `tests/unit/` — isolated module tests
- **Integration tests**: `tests/integration/` — multi-module interaction
- **Benchmarks**: `tests/benchmark/` — context assembly performance

```bash
npm test                    # All tests
npx vitest run tests/unit/  # Unit only
```

## Context Strategy (4 strategies)

| Strategy | Use Case | Description |
|----------|----------|-------------|
| `retrieval` | Factual QA | Semantic search over memory |
| `recent` | Session continuity | Time-weighted recent context |
| `hybrid` | General purpose | Retrieval + recent combined |
| `rl-enhanced` | Adaptive optimization | RL-driven strategy weighting |

## Key Dependencies

- `claw-mem` (≥ 6.26.7) — Memory storage and retrieval
- `claw-rsi` (≥ 4.1.0) — Self-improvement signals
- `claw-gov` (≥ 6.3.1) — Governance rules

## Contributing

1. All changes must maintain backward compatibility with v4.x
2. New strategies must include tests + benchmark results
3. API changes require updating `docs/context-prompt-template.md`
4. See `CONTRIBUTING.md` for detailed process
