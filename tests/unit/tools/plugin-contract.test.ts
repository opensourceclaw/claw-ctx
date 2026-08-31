import { describe, it, expect } from "vitest";
import * as fs from "fs";

describe("plugin contract", () => {
  it("openclaw.plugin.json declares 3 tools", () => {
    const p = JSON.parse(fs.readFileSync("openclaw.plugin.json", "utf-8"));
    expect(p.contracts.tools).toContain("ctx_compact");
    expect(p.contracts.tools).toContain("ctx_build");
    expect(p.contracts.tools).toContain("ctx_inject");
    expect(p.version).toBe("6.8.0");
  });
});
