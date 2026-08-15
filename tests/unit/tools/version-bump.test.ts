import { describe, it, expect } from "vitest";
import * as fs from "fs";

describe("version bump", () => {
  it("package.json is 6.5.1", () => {
    const p = JSON.parse(fs.readFileSync("package.json", "utf-8"));
    expect(p.version).toBe("6.6.0");
  });
});
