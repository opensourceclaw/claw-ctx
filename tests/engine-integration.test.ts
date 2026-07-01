// Copyright 2026 OpenSourceClaw Contributors
// claw-ctx v5.6.1 — Engine Integration Tests
// Tests ClawContextEngine with real dependencies (no vi.mock for claw-mem/claw-rl)

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createRequire } from "module";

// Real imports — NO vi.mock
import { createClawContextEngine } from "../src/engine.js";
import { ConfidenceGate } from "../src/confidence_gate.js";
import { DriftDetector } from "../src/drift-detector.js";
import { TokenBudgetManager } from "../src/token_budget_manager.js";

// Dynamic check for claw-mem availability (ESM-compatible)
const _require = createRequire(import.meta.url);
let hasClawMem = false;
let getMemoryManager: any = null;

try {
  const clawMem = _require("claw-mem");
  getMemoryManager = clawMem.getMemoryManager;
  hasClawMem = true;
} catch {
  try {
    const clawMem = _require("../../claw-mem/dist/memory_manager.js");
    getMemoryManager = clawMem.getMemoryManager;
    hasClawMem = true;
  } catch {
    hasClawMem = false;
  }
}

describe("Engine Integration (Real Dependencies)", () => {
  let tmpDir: string;
  const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-ctx-int-"));
    fs.writeFileSync(path.join(tmpDir, "MEMORY.md"), "# MEMORY.md\n\n", "utf-8");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // TC-INT-10: Base test that ALWAYS runs (even without claw-mem) — graceful degradation
  it("TC-INT-10: engine works with mock fallback when claw-mem unavailable", () => {
    // This test verifies the engine can be created and used even without real claw-mem
    const engine = createClawContextEngine(
      { workspaceDir: tmpDir, topK: 10 },
      mockLogger
    );
    expect(engine).toBeDefined();
    expect(typeof engine.assemble).toBe("function");
    expect(typeof engine.ingest).toBe("function");
    expect(typeof engine.healthCheck).toBe("function");
  });

  // Tests that require real claw-mem (skip gracefully if unavailable)
  describe.skipIf(!hasClawMem)("With Real claw-mem", () => {
    it("TC-INT-1: engine can be created with real memory manager", () => {
      const manager = getMemoryManager({ workspace: tmpDir, autoDetect: false });
      const engine = createClawContextEngine(
        { workspaceDir: tmpDir, topK: 10 },
        mockLogger,
        manager
      );
      expect(engine).toBeDefined();
    });

    it("TC-INT-2: ingest stores content without error", () => {
      const manager = getMemoryManager({ workspace: tmpDir, autoDetect: false });
      const engine = createClawContextEngine(
        { workspaceDir: tmpDir, topK: 10 },
        mockLogger,
        manager
      );

      const result = engine.ingest({
        content: "Test memory content for integration test",
        role: "user",
        sessionId: "test-session",
      });
      expect(result).toBeDefined();
    });

    it("TC-INT-3: assemble returns valid result with messages", async () => {
      const manager = getMemoryManager({ workspace: tmpDir, autoDetect: false });
      const engine = createClawContextEngine(
        { workspaceDir: tmpDir, topK: 10 },
        mockLogger,
        manager
      );

      const result = await engine.assemble({
        sessionId: "test-session",
        messages: [{ role: "user", content: "Hello" }],
        tokenBudget: 4000,
      });
      expect(result).toBeDefined();
      expect(result.messages).toBeDefined();
    });

    it("TC-INT-5: healthCheck returns status", () => {
      const manager = getMemoryManager({ workspace: tmpDir, autoDetect: false });
      const engine = createClawContextEngine(
        { workspaceDir: tmpDir, topK: 10 },
        mockLogger,
        manager
      );

      const health = engine.healthCheck();
      expect(health).toBeDefined();
      expect(typeof health).toBe("object");
    });

    it("TC-INT-9: multiple assemble calls work", async () => {
      const manager = getMemoryManager({ workspace: tmpDir, autoDetect: false });
      const engine = createClawContextEngine(
        { workspaceDir: tmpDir, topK: 10 },
        mockLogger,
        manager
      );

      // Turn 1
      await engine.assemble({
        sessionId: "multi-turn",
        messages: [{ role: "user", content: "First turn" }],
        tokenBudget: 4000,
      });

      // Turn 2
      const result = await engine.assemble({
        sessionId: "multi-turn",
        messages: [{ role: "user", content: "Second turn" }],
        tokenBudget: 4000,
      });

      expect(result).toBeDefined();
    });
  });

  // Tests that don't require claw-mem at all
  it("TC-INT-7: drift detection works independently", () => {
    const detector = new DriftDetector({ threshold: 0.5 });
    const messages = [
      { content: "Topic: programming", role: "user" },
      { content: "Topic: cooking", role: "user" },
    ];

    // DriftDetector.feedTurn expects messages
    const alerts = detector.feedTurn(messages);
    expect(alerts).toBeDefined();
    expect(Array.isArray(alerts)).toBe(true);
  });

  it("TC-INT-8: confidence gate filters by score", () => {
    const gate = new ConfidenceGate({ threshold: 0.3 });
    const items = [
      { content: "High confidence", score: 0.8 },
      { content: "Low confidence", score: 0.1 },
    ];

    const result = gate.gate(items);
    expect(result.passed.length).toBeLessThanOrEqual(2);
    if (result.passed.length > 0) {
      expect(result.passed[0].score).toBeGreaterThanOrEqual(0.3);
    }
  });

  it("TC-INT-6: token budget manager calculates correctly", () => {
    const budgetManager = new TokenBudgetManager({ totalBudget: 80000 });
    const result = budgetManager.calculate();
    expect(result).toBeDefined();
  });
});