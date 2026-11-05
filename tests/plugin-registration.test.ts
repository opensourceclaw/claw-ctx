// Copyright 2026 OpenSourceClaw Contributors
// claw-ctx v5.6.1 — Plugin Registration Smoke Test
// Tests plugin registration with mock OpenClaw API

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import plugin from "../src/index.js";

describe("Plugin Registration", () => {
  let mockApi: any;
  let registeredEngine: any;

  beforeEach(() => {
    registeredEngine = null;
    // v6.15.1: engineRef is process-global (split-brain fix); isolate tests.
    delete (globalThis as Record<symbol, unknown>)[
      Symbol.for("claw-ctx.shared-engine-state.v1")
    ];
    mockApi = {
      id: "test-api",
      config: {},
      pluginConfig: {},
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      registerContextEngine: vi.fn((id: string, factory: (ctx: any) => any) => {
        registeredEngine = factory({});
      }),
      on: vi.fn(),
    };
  });

  it("TC-PLUG-1: plugin.register() calls api.registerContextEngine", () => {
    plugin.register(mockApi);
    expect(mockApi.registerContextEngine).toHaveBeenCalledWith(
      "claw-ctx",
      expect.any(Function)
    );
  });

  it("TC-PLUG-2: plugin exports expected interface", () => {
    expect(plugin).toHaveProperty("id");
    expect(plugin).toHaveProperty("name");
    expect(plugin).toHaveProperty("configSchema");
    expect(plugin).toHaveProperty("register");
    expect(plugin.id).toBe("claw-ctx");
    expect(plugin.name).toBe("Claw Context Engine");
  });

  it("TC-PLUG-3: manifest version matches package version", () => {
    // Modern entry has no version field; manifest is authoritative
    const manifest = JSON.parse(
      fs.readFileSync(new URL("../openclaw.plugin.json", import.meta.url), "utf-8")
    ) as { version: string };
    const pkg = JSON.parse(
      fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8")
    ) as { version: string };
    expect(manifest.version).toBe(pkg.version);
  });

  it("TC-PLUG-4: engine factory returns valid engine", () => {
    plugin.register(mockApi);
    expect(registeredEngine).toBeDefined();
    // Engine should have core methods
    expect(typeof registeredEngine.assemble).toBe("function");
    expect(typeof registeredEngine.ingest).toBe("function");
    expect(typeof registeredEngine.healthCheck).toBe("function");
  });

  it("v6.14.0: registers before_reset and captures the continuity handoff", async () => {
    plugin.register(mockApi);
    const call = mockApi.on.mock.calls.find(([event]: [string]) => event === "before_reset");
    expect(call).toBeDefined();
    const handler = call![1] as (event: any, ctx: any) => Promise<void>;

    const spy = vi
      .spyOn(registeredEngine, "captureResetHandoff")
      .mockResolvedValue({ stored: true });
    try {
      await handler(
        { reason: "daily", messages: [{ role: "user", content: "需要" }] },
        { sessionId: "s-1", sessionKey: "agent:main:tui" }
      );
      expect(spy).toHaveBeenCalledWith({
        sessionId: "s-1",
        sessionKey: "agent:main:tui",
        reason: "daily",
        messages: [{ role: "user", content: "需要" }],
      });

      spy.mockClear();
      await handler({ reason: "daily" }, {});
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("v6.15.1: logs the no-engine skip at info level", async () => {
    // Registration succeeds but the host never instantiates an engine.
    mockApi.registerContextEngine = vi.fn();
    plugin.register(mockApi);
    const call = mockApi.on.mock.calls.find(([event]: [string]) => event === "before_reset");
    const handler = call![1] as (event: any, ctx: any) => Promise<void>;
    await handler({ reason: "daily", messages: [] }, { sessionId: "s-1" });
    expect(mockApi.logger.info).toHaveBeenCalledWith(
      expect.stringContaining("reset handoff skipped: no engine instance for this session")
    );
    expect(mockApi.logger.info).toHaveBeenCalledWith(expect.stringContaining("hook=ctx-"));
  });

  it("v6.15.1: logs capture() skip reasons at info level", async () => {
    plugin.register(mockApi);
    const call = mockApi.on.mock.calls.find(([event]: [string]) => event === "before_reset");
    const handler = call![1] as (event: any, ctx: any) => Promise<void>;
    const spy = vi
      .spyOn(registeredEngine, "captureResetHandoff")
      .mockResolvedValue({ stored: false, reason: "too few messages (2)" });
    try {
      await handler({ reason: "daily", messages: [] }, { sessionId: "s-1" });
      expect(mockApi.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("reset handoff skipped: too few messages (2)")
      );
      expect(mockApi.logger.info).toHaveBeenCalledWith(expect.stringContaining("owner=ctx-"));
    } finally {
      spy.mockRestore();
    }
  });

  it("v6.15.1: a second registration's before_reset sees the first instance's engine", async () => {
    // Instance A instantiates the engine (factory runs).
    plugin.register(mockApi);
    expect(registeredEngine).toBeDefined();
    const engineA = registeredEngine;
    const spy = vi
      .spyOn(engineA, "captureResetHandoff")
      .mockResolvedValue({ stored: true });

    // Instance B is registered but the host never instantiates its factory.
    const apiB: any = {
      ...mockApi,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      registerContextEngine: vi.fn(),
      on: vi.fn(),
    };
    plugin.register(apiB);
    const hookB = apiB.on.mock.calls.find(([event]: [string]) => event === "before_reset")![1] as (
      event: any,
      ctx: any,
    ) => Promise<void>;

    try {
      await hookB({ reason: "daily", messages: [] }, { sessionId: "s-shared" });
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: "s-shared", reason: "daily" }),
      );
      expect(apiB.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("reset handoff stored for session s-shared"),
      );
      expect(apiB.logger.info).toHaveBeenCalledWith(expect.stringContaining("owner=ctx-"));
      // Distinct register instances are observable in the logs.
      const ids = [...mockApi.logger.info.mock.calls, ...apiB.logger.info.mock.calls]
        .map(([line]: [string]) => String(line).match(/instance=(ctx-[\w]+)/)?.[1])
        .filter(Boolean);
      expect(new Set(ids).size).toBeGreaterThanOrEqual(2);
    } finally {
      spy.mockRestore();
    }
  });

  // Edge case: registerContextEngine throws
  it("EC-PLUG-1: handles registerContextEngine throwing error", () => {
    mockApi.registerContextEngine = vi.fn(() => {
      throw new Error("Registration failed");
    });
    plugin.register(mockApi);
    expect(mockApi.logger.warn).toHaveBeenCalled();
  });

  // Edge case: missing pluginConfig
  it("EC-PLUG-2: handles missing pluginConfig with defaults", () => {
    mockApi.pluginConfig = undefined;
    plugin.register(mockApi);
    expect(mockApi.registerContextEngine).toHaveBeenCalled();
  });
});