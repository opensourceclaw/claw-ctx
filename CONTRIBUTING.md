# Contributing to claw-ctx

## Development Environment

### Prerequisites

- **Node.js**: 18 or higher
- **npm**: Latest version

### Setup

```bash
git clone https://github.com/opensourceclaw/claw-ctx.git
cd claw-ctx
npm install
```

## Code Style

- **Language**: TypeScript (strict mode)
- **Formatting**: Follow existing patterns in the codebase
- **Naming**:
  - Classes: PascalCase (`SessionResumeManager`)
  - Functions/variables: camelCase (`getTokenCount`)
  - Files: kebab-case (`session-resume/`, `quality-evaluator.ts`)
  - Types/interfaces: PascalCase with descriptive names (`QualityEvaluationResult`)
- **Imports**: Use ESM with `.js` extensions (`import { X } from "./mod.js"`)
- **Exports**: Named exports preferred; barrel exports via `mod.ts`

### Architecture Patterns

- **Error handling**: Wrap sub-module interactions in try/catch — failures must never bubble up to the engine
- **Configuration**: Default config objects + `Partial<Config>` constructor pattern
- **Testing**: No external LLM calls in tests; use deterministic mock data
- **Dependencies**: Minimize external dependencies; pure rule-based logic preferred

## PR Process

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/your-feature`)
3. **Make changes** following the code style above
4. **Write tests** for new functionality
5. **Run tests** — all tests must pass
6. **Commit** with conventional commit messages (see below)
7. **Push** to your fork
8. **Open** a Pull Request

### Commit Convention

```
<type>: <description>

- Bullet points for details

Co-Authored-By: ...
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

## Testing

```bash
# Run all tests
npm test

# Run tests for a specific module
npx vitest run tests/self-refinement/

# Type checking
npm run typecheck

# Build
npm run build
```

### Test Requirements

- All new features must include unit tests
- Integration tests for module interactions
- Performance benchmarks for latency-sensitive operations
- 567+ tests must pass before merging (growing over time)

### Running Tests

Tests use **vitest**. Test files mirror the source structure under `tests/`:

```
src/engine.ts              → tests/engine.test.ts
src/session-resume/        → tests/session-resume/
src/self-refinement/       → tests/self-refinement/
```

Mock external dependencies (e.g., claw-mem `MemoryManager`) using `vi.fn()`.

## Code Review

All PRs require at least one review. Reviewers will check:

- Correctness and edge case handling
- Test coverage
- Code style consistency
- Backward compatibility
- Performance implications

## Getting Help

- **Issues**: [github.com/opensourceclaw/claw-ctx/issues](https://github.com/opensourceclaw/claw-ctx/issues)
- **Discussions**: [github.com/opensourceclaw/claw-ctx/discussions](https://github.com/opensourceclaw/claw-ctx/discussions)
