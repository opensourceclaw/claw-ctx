import { describe, it, expect } from "vitest";
import * as fs from "fs";

describe("version consistency", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
  const plugin = JSON.parse(fs.readFileSync("openclaw.plugin.json", "utf-8"));
  const versionTs = fs.readFileSync("src/version.ts", "utf-8");

  it("package.json, openclaw.plugin.json and src/version.ts agree", () => {
    const v = versionTs.match(/VERSION = "([^"]+)"/)?.[1];
    expect(v).toBeTruthy();
    expect(pkg.version).toBe(v);
    expect(plugin.version).toBe(v);
  });

  it("package-lock.json root version matches package.json", () => {
    const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf-8"));
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[""].version).toBe(pkg.version);
  });
});
