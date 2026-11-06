// push-dispatch gate (Peter ruling 2026-11-06): a main push must carry an
// inbox/inbox-release/ record with Peter APPROVED + "Dispatcher: Karen".

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const SCRIPT = path.join(REPO_ROOT, "tools/audit-stage-gate.sh");
const ZERO = "0".repeat(40);

describe("push-dispatch gate (audit-stage-gate --mode=client)", () => {
  let dir: string;
  let head: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-ctx-dispatch-"));
    env = {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    };
    const git = (args: string[]) =>
      spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
        cwd: dir,
        env,
        encoding: "utf-8",
      });
    git(["init", "-q"]);
    fs.writeFileSync(path.join(dir, "README.md"), "base\n");
    git(["add", "README.md"]);
    git(["commit", "-qm", "init"]);
    head = git(["rev-parse", "HEAD"]).stdout.trim();
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function writeReceipt() {
    fs.mkdirSync(path.join(dir, "inbox/inbox-results"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "inbox/inbox-results/test-receipt.md"),
      "# Report\n\n**Stage**: TEST\n**Status**: PASS\n**Project**: claw-ctx\n",
    );
  }

  function writeRelease(body: string) {
    fs.mkdirSync(path.join(dir, "inbox/inbox-release"), { recursive: true });
    fs.writeFileSync(path.join(dir, "inbox/inbox-release/peter-approval.md"), body);
  }

  function run() {
    const r = spawnSync(
      "sh",
      [SCRIPT, "--mode=client", `--local=${head}`, `--remote=${ZERO}`],
      { cwd: dir, env, encoding: "utf-8" },
    );
    return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
  }

  it("APPROVED + Dispatcher: Karen → push allowed", () => {
    writeReceipt();
    writeRelease(
      "# Release approval\n\n**Approver**: Peter\n**Decision**: APPROVED\n**Dispatcher**: Karen\n",
    );
    const r = run();
    expect(r.code).toBe(0);
    expect(r.out).toContain("stage-gate OK: main");
  });

  it("APPROVED without Karen → rejected, reports missing dispatch", () => {
    writeReceipt();
    writeRelease("# Release approval\n\n**Approver**: Peter\n**Decision**: APPROVED\n");
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain("missing: Karen push dispatch");
  });

  it("no release record → rejected", () => {
    writeReceipt();
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain("missing: Peter RELEASE APPROVED record");
    expect(r.out).toContain("missing: Karen push dispatch");
  });
});
