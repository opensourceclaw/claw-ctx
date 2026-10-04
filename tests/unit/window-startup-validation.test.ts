// v6.10.1 — window/reserve startup validation (warn-only, never hard-fails)

import { describe, it, expect } from "vitest";
import { validateWindowStartup } from "../../src/model-profile.js";

describe("validateWindowStartup (v6.10.1)", () => {
  it("warns when configured contextWindow differs from the model profile", () => {
    // deepseek-v3 profile maxTokens = 128000
    const warnings = validateWindowStartup({
      modelId: "deepseek-v3",
      contextWindow: 204800,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("differs from model profile");
    expect(warnings[0]).toContain("128000");
  });

  it("no warning when contextWindow matches the profile", () => {
    const warnings = validateWindowStartup({
      modelId: "deepseek-v3",
      contextWindow: 128000,
    });
    expect(warnings).toEqual([]);
  });

  it("warns when reserve is 0", () => {
    const warnings = validateWindowStartup({ reserve: 0 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("reserve is 0");
  });

  it("no warning for non-zero or absent reserve", () => {
    expect(validateWindowStartup({ reserve: 0.1 })).toEqual([]);
    expect(validateWindowStartup({})).toEqual([]);
    expect(validateWindowStartup({ reserve: undefined })).toEqual([]);
  });

  it("unknown model → only reserve check applies (no crash)", () => {
    const warnings = validateWindowStartup({
      modelId: "nonexistent-model-xyz",
      contextWindow: 42,
      reserve: 0.2,
    });
    expect(warnings).toEqual([]);
  });
});
