import { describe, it, expect, beforeEach } from "vitest";
import {
  CIInjector,
  MockCIProvider,
  type CISignal,
} from "../src/ci_injector";

function makeBuild(overrides: Partial<CISignal> = {}): CISignal {
  return {
    type: "build",
    status: overrides.status ?? "success",
    message: overrides.message ?? "Build completed successfully",
    timestamp: overrides.timestamp ?? new Date(),
    branch: overrides.branch ?? "main",
    commit: overrides.commit ?? "abc1234",
    tokenCount: 0,
  };
}

function makeTestResult(overrides: Partial<CISignal> = {}): CISignal {
  return {
    type: "test",
    status: overrides.status ?? "success",
    message: overrides.message ?? "All 42 tests passed",
    timestamp: overrides.timestamp ?? new Date(),
    branch: overrides.branch ?? "main",
    tokenCount: 0,
  };
}

describe("CIInjector", () => {
  let injector: CIInjector;
  let provider: MockCIProvider;

  beforeEach(() => {
    provider = new MockCIProvider();
    injector = new CIInjector(provider);
  });

  it("returns empty when provider has no signals", async () => {
    const result = await injector.inject({
      sessionId: "s1",
    });
    expect(result.signals).toHaveLength(0);
    expect(result.totalTokens).toBe(0);
  });

  it("injects build status", async () => {
    provider.addBuild(makeBuild({ status: "success" }));

    const result = await injector.inject({
      sessionId: "s1",
      includeBuildStatus: true,
    });
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].type).toBe("build");
    expect(result.signals[0].status).toBe("success");
  });

  it("injects test results", async () => {
    provider.addTestResult(makeTestResult({ status: "failure" }));

    const result = await injector.inject({
      sessionId: "s1",
      includeTestResults: true,
    });
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].type).toBe("test");
    expect(result.signals[0].status).toBe("failure");
  });

  it("injects deploy status when explicitly enabled", async () => {
    provider.addDeploy({
      type: "deploy",
      status: "running",
      message: "Deploying to staging",
      timestamp: new Date(),
      tokenCount: 0,
    });

    const result = await injector.inject({
      sessionId: "s1",
      includeDeployStatus: true,
    });
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].type).toBe("deploy");
  });

  it("does not include deploy by default", async () => {
    provider.addDeploy({
      type: "deploy",
      status: "success",
      message: "Deployed",
      timestamp: new Date(),
      tokenCount: 0,
    });

    const result = await injector.inject({
      sessionId: "s1",
    });
    expect(result.signals).toHaveLength(0);
  });

  it("sorts failures first", async () => {
    provider.addBuild(makeBuild({ status: "success", timestamp: new Date() }));
    provider.addTestResult(makeTestResult({ status: "failure", timestamp: new Date(Date.now() - 60000) }));
    provider.addBuild(makeBuild({ status: "running", timestamp: new Date(Date.now() - 120000) }));

    const result = await injector.inject({
      sessionId: "s1",
    });
    expect(result.signals[0].status).toBe("failure");
    expect(result.signals[0].type).toBe("test");
  });

  it("respects maxSignals limit", async () => {
    for (let i = 0; i < 10; i++) {
      provider.addBuild(makeBuild({
        message: `Build #${i}`,
        timestamp: new Date(Date.now() - i * 60000),
      }));
    }

    const result = await injector.inject({
      sessionId: "s1",
      maxSignals: 3,
    });
    expect(result.signals.length).toBeLessThanOrEqual(3);
  });

  it("calculates token counts", async () => {
    provider.addBuild(makeBuild({
      message: "Build completed successfully with all modules compiled",
      branch: "feature/add-auth",
    }));

    const result = await injector.inject({
      sessionId: "s1",
    });
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(result.signals[0].tokenCount).toBeGreaterThan(0);
  });

  describe("formatForContext", () => {
    it("formats successful build", () => {
      const signals = [makeBuild({
        status: "success",
        message: "Build #42 passed",
        branch: "main",
        commit: "abc1234def",
      })];

      const text = injector.formatForContext(signals);
      expect(text).toContain("[CI/CD Pipeline Status]");
      expect(text).toContain("🟢");
      expect(text).toContain("Build #42 passed");
      expect(text).toContain("main");
      expect(text).toContain("abc1234");
    });

    it("formats failed build with action hint", () => {
      const signals = [makeBuild({
        type: "build",
        status: "failure",
        message: "TypeScript compilation failed",
      })];

      const text = injector.formatForContext(signals);
      expect(text).toContain("🔴");
      expect(text).toContain("Action: Check build error");
    });

    it("formats failed test with action hint", () => {
      const signals = [makeTestResult({
        status: "failure",
        message: "3 of 42 tests failed",
      })];

      const text = injector.formatForContext(signals);
      expect(text).toContain("Action: Review failing tests");
    });

    it("includes CI URL when present", () => {
      const signals: CISignal[] = [{
        type: "build",
        status: "success",
        message: "Build completed",
        timestamp: new Date(),
        url: "https://github.com/org/repo/actions/runs/123",
        tokenCount: 0,
      }];

      const text = injector.formatForContext(signals);
      expect(text).toContain("github.com/org/repo/actions/runs/123");
    });

    it("returns empty string for empty list", () => {
      expect(injector.formatForContext([])).toBe("");
    });
  });

  it("setProvider replaces provider at runtime", async () => {
    provider.addBuild(makeBuild());
    const r1 = await injector.inject({ sessionId: "s1" });
    expect(r1.signals).toHaveLength(1);

    injector.setProvider(new MockCIProvider());
    const r2 = await injector.inject({ sessionId: "s1" });
    expect(r2.signals).toHaveLength(0);
  });

  it("default provider returns empty", async () => {
    const defaultInjector = new CIInjector();
    const result = await defaultInjector.inject({ sessionId: "s1" });
    expect(result.signals).toHaveLength(0);
  });
});
