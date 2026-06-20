# claw-ctx

<div align="center">

**Context Engine for OpenClaw**

*Intelligent Context Assembly for AI Agents*

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Version](https://img.shields.io/badge/Version-4.26.0-blue.svg)](https://github.com/opensourceclaw/claw-ctx/releases/tag/v4.26.0)
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

### Why claw-ctx?

Effective AI agents need more than just memory-they need **intelligent context assembly**. claw-ctx provides:

- **Optimization**: Maximizes utility within token budget constraints
- **Quality**: Filters irrelevant information via confidence scoring
- **Flexibility**: Multiple context strategies for different scenarios
- **Integration**: Seamlessly works with claw-mem for memory capabilities


---

## Competitive Analysis

We compare claw-ctx against the top 3 open-source AI agent context engineering systems in the global community: **LangGraph**, **CrewAI**, and **AutoGen**.

### Comprehensive Comparison

| Dimension | claw-ctx | LangGraph | CrewAI | AutoGen |
|----------|-----------|-----------|--------|---------|
| **Primary Focus** | Context Assembly | Workflow Orchestration | Role-based Agents | Conversational Agents |
| **Architecture** | DAG-based Context Engine | Graph-based State Machine | Role-based Crew | Multi-agent Chat |
| **Context Selection** | Token Budget + Confidence | User-defined | User-defined | User-defined |
| **Memory Integration** | Native (claw-mem) | Via LangChain | Limited | Via LangChain |
| **Gating Strategy** | Write-time + Confidence | User-defined | User-defined | User-defined |
| **Multi-agent** | Fork/Isolate Modes | Via LangChain Agents | Role-based Crews | Conversational |
| **Drift Detection** | Yes | No | No | No |
| **Strategy Selection** | RL-enhanced | Manual | Manual | Manual |
| **Self-Refinement** | Yes | No | No | No |
| **Semantic Compression** | Yes | No | No | No |
| **Startup Time** | <1ms | 2-5s | 3-10s | 2-8s |
| **Integration** | OpenClaw Native | LangChain | Standalone | Standalone |

### Feature-by-Feature Analysis

#### 1. Context Assembly

| Aspect | claw-ctx | LangGraph | CrewAI | AutoGen |
|--------|-----------|-----------|--------|---------|
| Token Budget Control | Bisection-based | Manual | Manual | Manual |
| Confidence Gating | Native | No | No | No |
| Drift Detection | Yes | No | No | No |
| Priority Selection | Automated | Manual | Manual | Manual |

**Analysis**: claw-ctx uniquely provides automated context selection with token budget bisection and confidence gating. Other frameworks require manual context management.

#### 2. Memory Integration

| Aspect | claw-ctx | LangGraph | CrewAI | AutoGen |
|--------|-----------|-----------|--------|---------|
| Native Memory | claw-mem | LangChain Memory | Limited | LangChain Memory |
| Subagent Lifecycle | Yes | Via LangChain | Yes | Limited |
| Memory Merge | Auto on completion | Manual | Manual | Manual |

**Analysis**: claw-ctx provides native subagent lifecycle management with automatic memory merging. LangGraph and AutoGen require manual implementation.

#### 3. Self-Improvement

| Aspect | claw-ctx | LangGraph | CrewAI | AutoGen |
|--------|-----------|-----------|--------|---------|
| Self-Refinement | Yes | No | No | No |
| Semantic Compression | Yes | No | No | No |
| RL Strategy | Yes | No | No | No |

**Analysis**: claw-ctx uniquely implements self-refinement and semantic compression for continuous context optimization.

#### 4. Performance

| Metric | claw-ctx | LangGraph | CrewAI | AutoGen |
|--------|-----------|-----------|--------|---------|
| Startup | <1ms | 2-5s | 3-10s | 2-8s |
| Context Assembly | <50ms | 100-500ms | 200-1000ms | 100-500ms |
| Memory Footprint | <1MB | 50-200MB | 100-300MB | 50-200MB |

**Analysis**: claw-ctx significantly outperforms competitors on startup and context assembly due to its lightweight architecture.

#### 5. Integration

| Aspect | claw-ctx | LangGraph | CrewAI | AutoGen |
|--------|-----------|-----------|--------|---------|
| OpenClaw Native | Yes | Via API | Via API | Via API |
| LangChain Compatible | No | Yes | Yes | Yes |
| Standalone | Yes | Yes | Yes | Yes |

**Analysis**: claw-ctx provides native OpenClaw integration while other frameworks require API integration.

### When to Choose Which

| Use Case | Recommended |
|----------|-------------|
| OpenClaw ecosystem | claw-ctx |
| Complex graph workflows | LangGraph |
| Role-based agent teams | CrewAI |
| Conversational agents | AutoGen |
| Token budget optimization | claw-ctx |
| Continuous self-improvement | claw-ctx |
| Minimal infrastructure | claw-ctx |
| LangChain integration | LangGraph / AutoGen |

### Summary

claw-ctx differentiates itself through:
1. **Token Budget Control** - Bisection-based selection with CJK-aware estimation
2. **Confidence Gating** - Filters low-confidence memories at retrieval time
3. **Drift Detection** - Automatically detects topic shifts
4. **RL Strategy Selection** - Dynamic context strategy via reinforcement learning
5. **Self-Refinement** - Continuous context quality improvement
6. **Semantic Compression** - Reduces context size without losing meaning
7. **Native OpenClaw Plugin** - Seamless ecosystem integration
8. **Subagent Lifecycle** - Automatic memory merge on completion

These characteristics make claw-ctx ideal for OpenClaw ecosystem users, token-constrained applications, and scenarios requiring continuous context optimization.


---

## Milestones and Progress

| Version     | Date    | Theme                             | Status       |
| ----------- | ------- | --------------------------------- | ------------ |
| **v4.26.0** | 2026-06 | Engineering Quality and Docs       | Current      |
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
| v4.14.0 | RL-based memory strategy selection, enhanced benchmark tests   |
| v4.10.0 | Performance optimization, health monitoring                   |
| v4.9.0  | Long-horizon conversation context                            |
| v4.7.0  | Subagent lifecycle management                                |

---

## Installation

### Prerequisites

- **Node.js**: 18 or higher
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
+-------------------------------------------------------------+
|                       claw-ctx v4.26.0                      |
+-------------------------------------------------------------+
|                                                                   |
|  +----------+ +----------+ +-------------+ +----------------+  |
|  |  Token   | |Confidence| |   Drift     | |     Smart      |  |
|  | Budget   | |  Gate    | |  Detection  | |Budget Allocator|  |
|  +----+-----+ +----+-----+ +------+------+ +-------+--------+  |
|       |            |              |                |            |
|       +------------+------+-------+----------------+            |
|                           +                                     |
|                +----------------------+                        |
|                |   Context Assembler   |                        |
|                |  (ClawContextEngine)  |                        |
|                +----------+-----------+                        |
|                           +                                     |
|  +----------------------------------------------------------+  |
|  |                    Injectors / Enhancers                   |  |
|  |  +----------+ +---------+ +-------+ +---------------+  |  |
|  |  |   RL     | |Governance| | CI/CD | | Cross-Domain  |  |  |
|  |  +----------+ +---------+ +-------+ +---------------+  |  |
|  |  +----------+ +---------+ +-----------------------+    |  |
|  |  | Session  | |  Self-  | | Long-Term Dependency |    |  |
|  |  |  Resume  | |Refinement| |      Tracker         |    |  |
|  |  +----------+ +---------+ +-----------------------+    |  |
|  |  +----------+ +---------+ +-----------------------+    |  |
|  |  | Semantic | | Position| |   Structured/Multimodal|   |  |
|  |  |Compressor| |Optimizer| |   Context Handler     |    |  |
|  |  +----------+ +---------+ +-----------------------+    |  |
|  +----------------------------------------------------------+  |
|                           +                                     |
|                    +--------------+                             |
|                    |  claw-mem    |                             |
|                    |  (Memory)    |                             |
|                    +--------------+                             |
+-------------------------------------------------------------+
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
