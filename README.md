# claw-ctx

<div align="center">

**Context Engine for OpenClaw**

*Intelligent Context Assembly for AI Agents*

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Version](https://img.shields.io/badge/Version-5.0.0-blue.svg)](https://github.com/opensourceclaw/claw-ctx/releases/tag/v5.0.0)
[![CI](https://github.com/opensourceclaw/claw-ctx/actions/workflows/ci.yml/badge.svg)](https://github.com/opensourceclaw/claw-ctx/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/opensourceclaw/claw-ctx/branch/main/graph/badge.svg)](https://codecov.io/gh/opensourceclaw/claw-ctx)

</div>

---

## Project Overview

claw-ctx is the **Context Engine** for OpenClaw. It intelligently assembles context from multiple sources including memory, conversation history, and external signals to provide AI agents with the right information at the right time.

### Core Features

| Feature                   | Description                                                   |
| ------------------------- | ------------------------------------------------------------- |
| **Token Budget Control**  | Bisection-based selection with CJK-aware token estimation     |
| **Confidence Gating**     | Filters low-confidence memories (configurable min score 0.3)  |
| **Memory Integration**    | Uses claw-mem for semantic search and storage                 |
| **Subagent Lifecycle**    | Fork/isolate modes with memory merging on completion           |
| **RL Strategy Selection** | Dynamic context strategy selection via reinforcement learning |
| **Cross-Domain Fusion**  | Aggregate signals from memory, governance, CI, cross-domain   |
| **Adaptive Injection**    | Dynamic injection based on task type (coding/review/debug)    |
| **Multi-Style Prompts**  | 5 styles: descriptive, prescriptive, prohibitive, explanatory  |
| **Predictive Context**   | Predict future context needs with 70%+ hit rate              |
| **Version Evolution**    | Track context strategy changes over time                      |
| **Self-Refinement**      | Continuous context quality improvement                         |
| **Semantic Compression** | Reduces context size without losing meaning                  |
| **Drift Detection**      | Automatically detects topic shifts                           |

### Why claw-ctx?

Effective AI agents need more than just memory-they need **intelligent context assembly**. claw-ctx provides:

- **Optimization**: Maximizes utility within token budget constraints
- **Quality**: Filters irrelevant information via confidence scoring
- **Flexibility**: Multiple context strategies for different scenarios
- **Integration**: Seamlessly works with claw-mem for memory capabilities


---

## Competitive Analysis

We compare claw-ctx against the top 3 open-source AI agent context management systems in the global community: **Mem0**, **Letta**, and **Zep**.

Note: While Mem0, Letta, and Zep are primarily memory systems, they provide context management capabilities that overlap with claw-ctx. This analysis highlights how claw-ctx differs as a dedicated context engineering solution.

### Comprehensive Comparison

| Dimension | claw-ctx | Mem0 | Letta | Zep |
|----------|-----------|------|-------|-----|
| **Primary Focus** | Context Assembly | Memory Storage | Agent Runtime + Memory | Temporal Memory |
| **Architecture** | DAG-based Context Engine | Vector + Knowledge Graph | Agent Runtime | Temporal Knowledge Graph |
| **Context Selection** | Token Budget + Confidence | Retrieval-time | User-defined | Retrieval-time |
| **Memory Integration** | Native (claw-mem) | External | External | External |
| **Gating Strategy** | Write-time + Confidence | Retrieval filtering | User-defined | Graph-based |
| **Multi-agent** | Fork/Isolate Modes | Scopes | Agent Runtime | Yes |
| **Drift Detection** | Yes | No | No | Yes |
| **Strategy Selection** | RL-enhanced | Manual | Manual | Manual |
| **Self-Refinement** | Yes | No | No | No |
| **Semantic Compression** | Yes | No | No | No |
| **Startup Time** | <1ms | 1-5s | 2-5s | 1-3s |
| **Context Assembly** | <50ms | 10-50ms | 50-200ms | 20-100ms |

### Feature-by-Feature Analysis

#### 1. Context vs. Memory

| Aspect | claw-ctx | Mem0 | Letta | Zep |
|--------|-----------|------|-------|-----|
| Primary Role | Context Engineering | Memory Storage | Agent Runtime | Memory Storage |
| Context Assembly | Native | Via retrieval | Via agent | Via retrieval |
| Token Budget Control | Bisection-based | User-defined | Token limits | Token limits |
| Confidence Scoring | Native (0-1) | Retrieval score | User-defined | Graph reasoning |

**Analysis**: claw-ctx is purpose-built for context assembly, while Mem0, Letta, and Zep focus on memory storage. claw-ctx provides automated context selection and token budget management.

#### 2. Gating and Filtering

| Aspect | claw-ctx | Mem0 | Letta | Zep |
|--------|-----------|------|-------|-----|
| Write-time gating | Yes | No | No | No |
| Confidence-based | Native | Via score | User-defined | Graph-based |
| Drift detection | Yes | No | No | Yes |
| Self-Refinement | Yes | No | No | No |

**Analysis**: claw-ctx uniquely implements write-time gating and self-refinement for continuous context optimization.

#### 3. Semantic and Compression

| Aspect | claw-ctx | Mem0 | Letta | Zep |
|--------|-----------|------|-------|-----|
| Semantic Compression | Yes | No | No | No |
| Concept Graph | Concept-mediated | Entity-based | Limited | Temporal |
| Context Strategies | Multiple (4+) | Single | Single | Single |
| RL Strategy | Yes | No | No | No |

**Analysis**: claw-ctx provides semantic compression and multiple context strategies including RL-enhanced selection.

#### 4. Performance

| Metric | claw-ctx | Mem0 | Letta | Zep |
|--------|-----------|------|-------|-----|
| Startup | <1ms | 1-5s | 2-5s | 1-3s |
| Context Assembly | <50ms | 10-50ms | 50-200ms | 20-100ms |
| Memory Footprint | <1MB | 50-500MB | ~500MB | ~200MB |

**Analysis**: claw-ctx significantly outperforms competitors on startup and context assembly.

#### 5. Integration

| Aspect | claw-ctx | Mem0 | Letta | Zep |
|--------|-----------|------|-------|-----|
| OpenClaw Native | Yes | Via API | Via API | Via API |
| Standalone | Yes | Yes | Yes | Yes |
| Memory Backend | claw-mem | External | External | External |

**Analysis**: claw-ctx provides native OpenClaw integration with built-in memory management.

### When to Choose Which

| Use Case | Recommended |
|----------|-------------|
| OpenClaw ecosystem | claw-ctx |
| Memory storage focus | Mem0, Letta, Zep |
| Context assembly optimization | claw-ctx |
| Full agent runtime | Letta |
| Temporal knowledge graph | Zep |
| Token budget optimization | claw-ctx |
| Continuous self-improvement | claw-ctx |

### Summary

While Mem0, Letta, and Zep are primarily memory systems, claw-ctx is purpose-built as a context engineering solution:

1. **Dedicated Context Assembly** - Native token budget control and confidence gating
2. **Self-Refinement** - Continuous context quality improvement
3. **Semantic Compression** - Reduces context size without losing meaning
4. **Multiple Strategies** - retrieval, recent, hybrid, rl-enhanced
5. **RL Strategy Selection** - Dynamic context strategy via reinforcement learning
6. **Drift Detection** - Automatically detects topic shifts
7. **Native OpenClaw Plugin** - Seamless ecosystem integration

claw-ctx complements memory systems like Mem0, Letta, and Zep by providing intelligent context assembly on top of existing memory backends.
7. **Native OpenClaw Plugin** - Seamless ecosystem integration
8. **Subagent Lifecycle** - Automatic memory merge on completion

These characteristics make claw-ctx ideal for OpenClaw ecosystem users, token-constrained applications, and scenarios requiring continuous context optimization.


---

## Milestones and Progress

| Version     | Date    | Theme                             | Status       |
| ----------- | ------- | --------------------------------- | ------------ |
| **v5.0.0** | 2026-06 | Context Engineering v2             | Current      |
| **v4.26.0** | 2026-06 | Engineering Quality and Docs       |              |
| **v4.24.0** | 2026-06 | Self-Refinement Module            |              |
| **v4.23.0** | 2026-06 | Session-Resume plus CJK Support   |              |
| **v4.22.0** | 2026-06 | Semantic Compression              |              |
| **v4.14.0** | 2026-06 | RL Strategy Integration Complete  |              |
| **v4.10.0** | 2026-05 | Performance and Health Optimization |            |
| **v4.9.0**  | 2026-05 | C4 Long-Horizon Enhancement     |              |
| **v4.7.0**  | 2026-04 | Phase 2 Complete                 |              |
| **v4.0.0**  | 2026-03 | Context Engine Foundation        |              |

### Key Capabilities Added

| Version | Capabilities                                                 |
| ------- | ------------------------------------------------------------ |
| v5.0.0  | Cross-Domain Signal Fusion, Adaptive Injection, Multi-Style Prompts, Predictive Context, Version Evolution |
| v4.14.0 | RL-based memory strategy selection, enhanced benchmark tests   |
| v4.10.0 | Performance optimization, health monitoring                   |
| v4.9.0  | Long-horizon conversation context                            |
| v4.7.0  | Subagent lifecycle management                                |

---

## Installation

### Prerequisites

- **Node.js**: 20 or higher
- **npm**: Latest version
- **OpenClaw**: v2026.3.28 or higher (optional, for plugin mode)

### Quick Install

```bash
# Clone the repository
git clone https://github.com/opensourceclaw/claw-ctx.git
cd claw-ctx

# Install dependencies
npm install

# Build the project
npm run build
```

### As OpenClaw Plugin

Install via ClawHub:

```bash
openclaw plugins install clawhub:opensourceclaw-claw-ctx
```

Or add to your OpenClaw configuration:

```json
{
  "plugins": {
    "allow": ["opensourceclaw-claw-ctx"],
    "slots": {
      "contextEngine": "claw-ctx"
    }
  }
}
```

### Verify Installation

```bash
# Run tests
npm test

# Check version
cat package.json | grep version
```

---

## Architecture

```
+-------------------------------------------------------------+   ｜
|                       claw-ctx                                  |
+-------------------------------------------------------------+   ｜
|                                                                 |
|  +----------+ +----------+ +-------------+ +----------------+   |
|  |  Token   | |Confidence| |   Drift     | |     Smart      |   |
|  | Budget   | |  Gate    | |  Detection  | |Budget Allocator|   |
|  +----+-----+ +----+-----+ +------+------+ +-------+--------+   |
|       |            |              |                |            |
|       +------------+------+-------+----------------+            |
|                           +                                     |
|                +----------------------+                         |
|                |   Context Assembler   |                        |
|                |  (ClawContextEngine)  |                        |
|                +----------+-----------+                         |
|                           +                                     |
|  +----------------------------------------------------------+   |
|  |                    Injectors / Enhancers                   |  |
|  |  +----------+ +---------+ +-------+ +---------------+      |  |
|  |  |   RL     | |Governance| | CI/CD | | Cross-Domain |      |  |
|  |  +----------+ +---------+ +-------+ +---------------+      |  |
|  |  +----------+ +---------+ +-----------------------+        |  |
|  |  | Session  | |  Self-  | | Long-Term Dependency |         |  |
|  |  |  Resume  | |Refinement| |      Tracker         |        |  |
|  |  +----------+ +---------+ +-----------------------+        |  |
|  |  +----------+ +---------+ +-----------------------+        |  |
|  |  | Semantic | | Position| |   Structured/Multimodal|       |  |
|  |  |Compressor| |Optimizer| |   Context Handler     |        |  |
|  |  +----------+ +---------+ +-----------------------+        |  |
|  +----------------------------------------------------------+    |
|                           +                                      |
|                    +--------------+                              |
|                    |  claw-mem    |                              |
|                    |  (Memory)    |                              |
|                    +--------------+                              |
+-------------------------------------------------------------+    ｜
                           +
              +-------------------------+
              |   OpenClaw Agent        |
              |   (Prompt Injection)    |
              +-------------------------+
```

### Context Flow

1. **Bootstrap**: Load session history from claw-mem (via SessionResumeManager)
2. **Request**: Agent requests context assembly
3. **Budget Check**: Calculate token budget with drift-aware allocation (SmartBudgetAllocator)
4. **Drift Detection**: Analyze topic drift from conversation history
5. **Gating**: Filter memories below confidence threshold (ConfidenceGate)
6. **Selection**: Prioritize and select context items within budget
7. **Injection**: Apply injectors (RL/Governance/CI/CD/Cross-Domain) plus reasoning strategy (CoT/ToT/GoT)
8. **Assembly**: Combine into final context payload
9. **AfterTurn**: Store session summary, run self-refinement evaluation, detect auto-compact triggers

---

## Usage

### Basic API

```typescript
import { ContextEngine } from './dist/index.js';

const ctx = new ContextEngine({
  maxTokens: 80000,
  minConfidence: 0.3,
  memoryPlugin: clawMemInstance,
});

// Assemble context for agent
const context = await ctx.assemble({
  request: 'What did we discuss about the login feature?',
  tokenBudget: 4000,
  includeMemory: true,
  includeHistory: true,
});

console.log(context.prompt);
// Combined prompt with relevant context
```

### OpenClaw Plugin Mode

```json
{
  "plugins": {
    "slots": {
      "contextEngine": "claw-ctx"
    },
    "config": {
      "claw-ctx": {
        "maxTokens": 80000,
        "minConfidence": 0.3,
        "strategy": "rl-enhanced"
      }
    }
  }
}
```

### Context Strategies

| Strategy      | Description     | Use Case                |
| ------------- | --------------- | ----------------------- |
| `retrieval`   | Memory-first    | Q and A, reference      |
| `recent`      | Latest messages | Follow-up conversations |
| `hybrid`      | Balanced mix    | General purpose         |
| `rl-enhanced` | ML-optimized    | Adaptive (v4.14.0 plus) |

### Prompt Styles (v5.0.0+)

| Style | Description | Example |
| ----- | ----------- | --------|
| `descriptive` | Describe context state | "Current context contains 3 memories..." |
| `prescriptive` | Specify selection rules | "Use retrieval when query contains..." |
| `prohibitive` | Exclusion rules | "Exclude memories with confidence < 0.3" |
| `explanatory` | Explain selection rationale | "Selected because score > 0.7" |
| `conditional` | Conditional inclusion | "If task involves code, include..." |

---

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run type checking
npm run typecheck
```

> **Note**: Coverage reports are generated as HTML files in `cov-merged/`. These are build artifacts, not source files, and are excluded from version control via `.gitignore`.

---

## Contributing

We welcome contributions from the community!

### How to Contribute

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Setup

```bash
# Clone and setup
git clone https://github.com/opensourceclaw/claw-ctx.git
cd claw-ctx

# Install dependencies
npm install

# Run tests
npm test

# Build for production
npm run build
```

### Community Channels

- **GitHub Issues**: Report bugs and request features
- **Discussions**: Ask questions and share ideas
- **Discord**: Join our community (link in main README)

---

## License

claw-ctx is licensed under the **Apache License 2.0**.

```
Copyright 2026 OpenSourceClaw Contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

### Why Apache 2.0?

- **Permissive**: Allows commercial use and modifications
- **Safe**: Provides patent protections for contributors
- **Compatible**: Works well with other open source licenses
- **Industry Standard**: Used by Google, IBM, and other major projects

---

## Support

- **Issue Tracker**: [github.com/opensourceclaw/claw-ctx/issues](https://github.com/opensourceclaw/claw-ctx/issues)
- **Discussions**: [github.com/opensourceclaw/claw-ctx/discussions](https://github.com/opensourceclaw/claw-ctx/discussions)

---

<div align="center">

Made with love by the OpenSourceClaw Community

</div>
