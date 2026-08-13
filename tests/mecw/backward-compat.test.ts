import { describe, it, expect } from "vitest";
import { ProactiveCompactionController } from "../../src/proactive-compaction-controller";

describe("backward compat", () => {
  it("no taskType → static threshold logic unchanged", () => {
    const controller = new ProactiveCompactionController();
    const r = controller.shouldCompact("s1", "deepseek-v3", 110000);
    expect(r.shouldCompact).toBe(true); // existing static threshold behavior
  });
  it("low token count still below minimum", () => {
    const controller = new ProactiveCompactionController();
    const r = controller.shouldCompact("s2", "deepseek-v3", 30000);
    expect(r.shouldCompact).toBe(false);
    expect(r.reason).toContain("below minimum");
  });
});
