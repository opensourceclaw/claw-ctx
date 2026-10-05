// v6.10.3 CX-1 — CLI positional-argument regression tests
// `model show/strategy <id>` must not crash (options.args was undefined),
// and the missing-arg path must print usage instead of throwing TypeError.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/** Simulates process.exit terminating the script. */
class ExitSignal extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
  }
}

describe("cli positional args (CX-1)", () => {
  const originalArgv = process.argv;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new ExitSignal(code ?? 0);
      }) as never);
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  /**
   * cli.ts runs main() at module top level — importing re-executes it with
   * the given argv. Returns the exit code; an uncaught TypeError (the CX-1
   * bug) propagates as a rejected promise and fails the test.
   */
  async function runCli(argv: string[]): Promise<number | null> {
    process.argv = ["node", "cli.ts", ...argv];
    try {
      await import("../../src/cli.js");
      return null; // ran to completion without exit()
    } catch (e) {
      if (e instanceof ExitSignal) return e.code;
      throw e;
    }
  }

  it("model show <id>: normal path prints profile, no uncaught error", async () => {
    const code = await runCli(["model", "show", "deepseek-v3"]);
    expect(code).toBeNull();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(logSpy.mock.calls.flat().join("\n")).toContain("DeepSeek V3");
  });

  it("model strategy <id>: normal path prints strategy, no uncaught error", async () => {
    const code = await runCli(["model", "strategy", "deepseek-v3"]);
    expect(code).toBeNull();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(logSpy.mock.calls.flat().join("\n")).toContain("static-prefix");
  });

  it("model show without id: usage hint + exit(1), no TypeError", async () => {
    const code = await runCli(["model", "show"]);
    expect(code).toBe(1);
    expect(errSpy.mock.calls.flat().join("\n")).toContain(
      "Usage: claw-ctx model show <model-id>"
    );
  });

  it("model strategy without id: usage hint + exit(1), no TypeError", async () => {
    const code = await runCli(["model", "strategy"]);
    expect(code).toBe(1);
    expect(errSpy.mock.calls.flat().join("\n")).toContain(
      "Usage: claw-ctx model strategy <model-id>"
    );
  });
});
