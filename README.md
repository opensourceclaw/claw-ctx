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

## 🎯 Project Overview

claw-ctx is the **Context Engine** for OpenClaw. It intelligently assembles context from multiple sources including memory, conversation history, and external signals to provide AI agents with the right information at the right time.

### Core Features

| Feature                   | Description                                                   |
| ------------------------- | ------------------------------------------------------------- |
| **Token Budget Control**  | Bisection-based selection with CJK-aware token estimation     |
| **Confidence Gating**     | Filters low-confidence memories (configurable min score 0.3)  |
| **Memory Integration**    | Uses claw-mem for semantic search and storage                 |
| **Subagent Lifecycle**    | Fork/isolate modes with memory merging on completion          |
| **RL Strategy Selection** | Dynamic context strategy selection via reinforcement learning |

### Why claw-ctx?

Effective AI agents need more than just memory—they need **intelligent context assembly**. claw-ctx provides:

- **Optimization**: Maximizes utility within token budget constraints
- **Quality**: Filters irrelevant information via confidence scoring
- **Flexibility**: Multiple context strategies for different scenarios
- **Integration**: Seamlessly works with claw-mem for memory capabilities

---

## 📈 Milestones & Progress

| Version     | Date    | Theme                             | Status       |
| ----------- | ------- | --------------------------------- | ------------ |
| **v4.26.0** | 2026-06 | Engineering Quality & Docs  | ✅ Current   |
| **v4.24.0** | 2026-06 | Self-Refinement Module            | ✅           |
| **v4.23.0** | 2026-06 | Session-Resume + CJK Support      | ✅           |
| **v4.22.0** | 2026-06 | Semantic Compression              | ✅           |
| **v4.14.0** | 2026-06 | RL Strategy Integration Complete  | ✅           |
| **v4.10.0** | 2026-05 | Performance & Health Optimization | ✅         |
| **v4.9.0**  | 2026-05 | C4 Long-Horizon Enhancement       | ✅         |
| **v4.7.0**  | 2026-04 | Phase 2 Complete                  | ✅         |
| **v4.0.0**  | 2026-03 | Context Engine Foundation         | ✅         |

### Key Capabilities Added

| Version | Capabilities                                                 |
| ------- | ------------------------------------------------------------ |
| v4.14.0 | RL-based memory strategy selection, enhanced benchmark tests |
| v4.10.0 | Performance optimization, health monitoring                  |
| v4.9.0  | Long-horizon conversation context                            |
| v4.7.0  | Subagent lifecycle management                                |

---

## 🚀 Installation

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

```bash
# Install via OpenClaw
npx clawhub@latest install opensourceclaw-claw-ctx
```

Or manually configure in your OpenClaw settings:

```json
{
  "plugins": {
    "load": {
      "paths": ["/path/to/claw-ctx/dist"]
    },
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

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       claw-ctx v4.26.0                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐ ┌────────────────┐  │
│  │  Token   │ │Confidence│ │   Drift     │ │     Smart      │  │
│  │ Budget   │ │  Gate    │ │  Detection  │ │Budget Allocator│  │
│  └────┬─────┘ └────┬─────┘ └──────┬──────┘ └───────┬────────┘  │
│       │            │              │                │            │
│       └────────────┴──────┬───────┴────────────────┘            │
│                           ↓                                     │
│                ┌──────────────────────┐                        │
│                │   Context Assembler   │                        │
│                │  (ClawContextEngine)  │                        │
│                └──────────┬───────────┘                        │
│                           ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Injectors / Enhancers                   │  │
│  │  ┌──────────┐ ┌─────────┐ ┌───────┐ ┌───────────────┐  │  │
│  │  │   RL     │ │Governance│ │ CI/CD │ │ Cross-Domain  │  │  │
│  │  └──────────┘ └─────────┘ └───────┘ └───────────────┘  │  │
│  │  ┌──────────┐ ┌─────────┐ ┌──────────────────────┐    │  │
│  │  │ Session  │ │  Self-  │ │ Long-Term Dependency │    │  │
│  │  │  Resume  │ │Refinement│ │      Tracker         │    │  │
│  │  └──────────┘ └─────────┘ └──────────────────────┘    │  │
│  │  ┌──────────┐ ┌─────────┐ ┌──────────────────────┐    │  │
│  │  │ Semantic │ │ Position│ │   Structured/Multimodal│   │  │
│  │  │Compressor│ │Optimizer│ │   Context Handler     │   │  │
│  │  └──────────┘ └─────────┘ └──────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                     │
│                    ┌──────────────┐                             │
│                    │  claw-mem    │                             │
│                    │  (Memory)    │                             │
│                    └──────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
                           ↓
              ┌─────────────────────────┐
              │   OpenClaw Agent        │
              │   (Prompt Injection)    │
              └─────────────────────────┘
```

### Context Flow

1. **Bootstrap**: Load session history from claw-mem (via SessionResumeManager)
2. **Request**: Agent requests context assembly
3. **Budget Check**: Calculate token budget with drift-aware allocation (SmartBudgetAllocator)
4. **Drift Detection**: Analyze topic drift from conversation history
5. **Gating**: Filter memories below confidence threshold (ConfidenceGate)
6. **Selection**: Prioritize and select context items within budget
7. **Injection**: Apply injectors (RL/Governance/CI/CD/Cross-Domain) + reasoning strategy (CoT/ToT/GoT)
8. **Assembly**: Combine into final context payload
9. **AfterTurn**: Store session summary, run self-refinement evaluation, detect auto-compact triggers

---

## 📖 Usage

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
| `retrieval`   | Memory-first    | Q&A, reference          |
| `recent`      | Latest messages | Follow-up conversations |
| `hybrid`      | Balanced mix    | General purpose         |
| `rl-enhanced` | ML-optimized    | Adaptive (v4.14.0+)     |

---

## 🧪 Testing

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

## 🤝 Contributing

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

## 📄 License

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

## 📞 Support

- **Issue Tracker**: [github.com/opensourceclaw/claw-ctx/issues](https://github.com/opensourceclaw/claw-ctx/issues)
- **Discussions**: [github.com/opensourceclaw/claw-ctx/discussions](https://github.com/opensourceclaw/claw-ctx/discussions)

---

<div align="center">

Made with ❤️ by the OpenSourceClaw Community

</div>
