// Copyright 2026 OpenSourceClaw Contributors
// claw-ctx v5.6.1 — Multi-Injector Coordination Tests
// Tests injector classes with real imports

import { describe, it, expect, beforeEach } from "vitest";

// Real imports — NO vi.mock
import { createClawContextEngine } from "../../src/engine.js";
import { MockRLProvider, RLInjector } from "../../src/rl_injector.js";
import { MockGovernanceProvider, GovernanceInjector } from "../../src/governance_injector.js";
import { MockCrossDomainProvider, CrossDomainInjector } from "../../src/cross_domain_injector.js";
import { MockCIProvider, CIInjector } from "../../src/ci_injector.js";

describe("Multi-Injector Coordination", () => {
  const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };

  it("TC-COORD-1: can create engine with real imports", () => {
    const engine = createClawContextEngine(
      { workspaceDir: "/tmp", topK: 10 },
      mockLogger
    );
    expect(engine).toBeDefined();
  });

  it("TC-COORD-2: MockRLProvider can be instantiated", () => {
    const provider = new MockRLProvider();
    expect(provider).toBeDefined();
  });

  it("TC-COORD-3: MockGovernanceProvider can be instantiated", () => {
    const provider = new MockGovernanceProvider();
    expect(provider).toBeDefined();
  });

  it("TC-COORD-4: MockCrossDomainProvider can be instantiated", () => {
    const provider = new MockCrossDomainProvider();
    expect(provider).toBeDefined();
  });

  it("TC-COORD-5: MockCIProvider can be instantiated", () => {
    const provider = new MockCIProvider();
    expect(provider).toBeDefined();
  });

  it("TC-COORD-6: RLInjector can be instantiated", () => {
    const injector = new RLInjector();
    expect(injector).toBeDefined();
  });

  it("TC-COORD-7: GovernanceInjector can be instantiated", () => {
    const injector = new GovernanceInjector();
    expect(injector).toBeDefined();
  });

  it("TC-COORD-8: CrossDomainInjector can be instantiated", () => {
    const injector = new CrossDomainInjector();
    expect(injector).toBeDefined();
  });

  it("TC-COORD-9: CIInjector can be instantiated", () => {
    const injector = new CIInjector();
    expect(injector).toBeDefined();
  });

  it("TC-COORD-10: MockRLProvider.getExperiences returns array", async () => {
    const provider = new MockRLProvider();
    const experiences = await provider.getExperiences([]);
    expect(Array.isArray(experiences)).toBe(true);
  });

  it("TC-COORD-11: MockGovernanceProvider.getSignals returns array", async () => {
    const provider = new MockGovernanceProvider();
    const signals = await provider.getSignals({});
    expect(Array.isArray(signals)).toBe(true);
  });

  it("TC-COORD-12: engine assemble works with messages", async () => {
    const engine = createClawContextEngine(
      { workspaceDir: "/tmp", topK: 10 },
      mockLogger
    );

    const result = await engine.assemble({
      sessionId: "coord-test",
      messages: [{ role: "user", content: "Test message" }],
      tokenBudget: 4000,
    });

    expect(result).toBeDefined();
    expect(result.messages).toBeDefined();
  });

  it("TC-COORD-13: engine healthCheck returns status", () => {
    const engine = createClawContextEngine(
      { workspaceDir: "/tmp", topK: 10 },
      mockLogger
    );

    const health = engine.healthCheck();
    expect(health).toBeDefined();
    expect(typeof health).toBe("object");
  });
});