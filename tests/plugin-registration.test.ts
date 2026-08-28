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