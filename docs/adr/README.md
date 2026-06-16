# ADR-001: Module Structure and Plugin Architecture

**Status**: Accepted
**Date**: 2026-06-02
**Deciders**: Peter Cheng

## Context

claw-ctx started as a standalone plugin for OpenClaw. The architecture needed to support multiple context sources (memory, CI/CD, cross-domain signals, RL experience) while maintaining backward compatibility and testability.

## Decision

- **Module pattern**: Each feature is a standalone file exporting a class + types + default config
- **Engine integration**: Constructor instantiates modules, lifecycle methods (bootstrap/assemble/afterTurn) delegate
- **Plugin wrapper**: `index.ts` exports a default plugin object with `register(api)` for OpenClaw
- **All sub-module failures**: Wrapped in try/catch — non-blocking

## Consequences

- Easy to add new features without modifying existing modules
- Modules are independently testable
- Plugin consumers can cherry-pick imports
- Some `any` types needed for duck-type compatibility with claw-mem

---

# ADR-002: Pure Rule-Based Evaluation (No LLM Calls)

**Status**: Accepted
**Date**: 2026-06-16
**Deciders**: Peter Cheng

## Context

The Self-Refinement module needed quality evaluation and reasoning strategies. The question was whether to use LLM-based evaluation (calling an external model) or rule-based heuristics.

## Decision

**No external LLM calls.** All quality evaluation (QualityEvaluator) and reasoning strategy application (CoT/ToT/GoT) are pure rule-based:

- QualityEvaluator uses regex patterns and weighted averages
- Reasoning strategies inject prompt templates (not multi-turn search)
- SelfRefiner uses text replacement for refinement

## Consequences

- Zero external dependencies for evaluation
- Deterministic, testable behavior
- Fast (<1ms per evaluation)
- Limited to heuristic detection (no semantic understanding)
- "CoT/ToT/GoT" are prompt templates, not true tree/graph search

---

# ADR-003: Session Continuity via claw-mem Integration

**Status**: Accepted
**Date**: 2026-06-16
**Deciders**: Peter Cheng

## Context

Claw-ctx needed cross-session continuity (the "overnight" use case). Options: file-based persistence, in-memory only, or claw-mem backed.

## Decision

**Use claw-mem as the persistence backend** for session summaries:

- SessionResumeManager stores summaries as `session_summary` tagged entries via `manager.store()`
- HistoryLoader retrieves via `manager.search()` with tag filtering
- Pure duck-type interface (no direct claw-mem dependency in types)

## Consequences

- Survives restarts and OpenClaw shutdown
- Leverages existing claw-mem infrastructure (no new storage)
- Tight coupling to claw-mem API shape
- Fallback: claw-mem import failure uses mock (for CI/testing)
