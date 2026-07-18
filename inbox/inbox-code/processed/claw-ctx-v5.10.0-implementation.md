# Task: claw-ctx v5.10.0 — Implementation: Performance Optimization

**From**: Friday (A)
**To**: Jarvis (B)
**Date**: 2026-07-18
**Stage**: BUILD
**Priority**: P0
**PipelineId**: claw-ctx-v5.10.0-impl
**Project**: claw-ctx
**Version**: v5.10.0

---

## Background

**Design Approved**: `docs/design/v5.10.0-performance-optimization.md`

### Design Summary

1. **Token Counting Optimization**
   - TokenCountCache with LRU (max 5000 entries)
   - BatchTokenCounter for parallel processing
   - Target: 10x faster (50ms → 5ms for 100 msgs)

2. **Context Compression Optimization**
   - ImportanceScorer with parallel scoring
   - IncrementalCompressor for memory-efficient processing
   - StreamingCompressor using generators
   - Target: 4x faster (200ms → 50ms for 500 msgs)

---

## What to Implement

### 1. Token Counting Optimization

File: `src/token-count-cache.ts` (new)

```typescript
class TokenCountCache {
  // LRU cache with max 5000 entries
  // Methods: get, set, clear, stats
}

class BatchTokenCounter {
  // Parallel processing for multiple messages
  // Methods: countBatch, countSingle
}
```

### 2. Context Compression Optimization

File: `src/importance-scorer.ts` (new)

```typescript
class ImportanceScorer {
  // Parallel importance scoring
  // Methods: score, scoreBatch
}

class IncrementalCompressor {
  // Memory-efficient incremental compression
  // Methods: compress, compressStream
}
```

### 3. Integration

Update `src/index.ts` to export new classes.

---

## Test Requirements

Create tests in `tests/performance/`:
- token-count-cache.test.ts (10 tests)
- batch-token-counter.test.ts (8 tests)
- importance-scorer.test.ts (10 tests)
- incremental-compressor.test.ts (8 tests)

---

## Acceptance Criteria

- [ ] `src/token-count-cache.ts` created
- [ ] `src/importance-scorer.ts` created
- [ ] `src/index.ts` updated
- [ ] `npm run build` passes
- [ ] Performance tests created (36 tests)
- [ ] No regression (881+ tests pass)

---

## Important Notes

- ❌ **Do NOT create GitHub Release**
- ✅ Just commit code locally

---

## Project Location

`/Users/liantian/workspace/osprojects/claw-ctx`
