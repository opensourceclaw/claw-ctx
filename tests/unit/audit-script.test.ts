// CX-16 — tools/audit-stage-gate.sh: repo-mode branches + hook↔script rc parity.
// The 41 pre-push tests prove client-mode byte-equivalence through the hook;
// this file pins (a) repo-surface checks and (b) direct client invocation.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const SCRIPT = path.join(REPO_ROOT, "tools/audit-stage-gate.sh");
const HOOK = path.join(REPO_ROOT, ".githooks/pre-push");

function sh(cmd: string[], cwd: string, env: Record<string, string> = {}): void {
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: "utf-8", env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`cmd failed: ${cmd.join(" ")}\n${r.stdout}\n${r.stderr}`);
}

function makeFixtureRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-repo-"));
  sh(["git", "init", "-q"], dir);
  sh(["git", "config", "user.email", "t@t"], dir);
  sh(["git", "config", "user.name", "t"], dir);
  // versioned surface files the repo-mode audit checks
  fs.mkdirSync(path.join(dir, ".githooks"), { recursive: true });
  fs.mkdirSync(path.join(dir, "tests/golden"), { recursive: true });
  fs.mkdirSync(path.join(dir, "tests/unit"), { recursive: true });
  fs.copyFileSync(HOOK, path.join(dir, ".githooks/pre-push"));
  fs.writeFileSync(path.join(dir, "tests/golden/legacy-summary-v6104.txt"), "x\n");
  fs.writeFileSync(path.join(dir, "tests/unit/pre-push-hook.test.ts"), "// fixture\n");
  fs.writeFileSync(path.join(dir, "package.json"), '{\n  "name": "x",\n  "version": "9.9.9"\n}\n');
  fs.writeFileSync(path.join(dir, "package-lock.json"), '{\n  "name": "x",\n  "version": "9.9.9"\n}\n');
  fs.writeFileSync(path.join(dir, "openclaw.plugin.json"), '{\n  "version": "9.9.9"\n}\n');
  sh(["git", "add", "."], dir);
  sh(["git", "commit", "-qm", "init"], dir);
  return dir;
}

function runAudit(cwd: string, args: string[]): { code: number | null; out: string } {
  const r = spawnSync("sh", [SCRIPT, ...args], { cwd, encoding: "utf-8" });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

describe("audit-stage-gate.sh --mode=repo (CX-16)", () => {
  let repo: string;
  beforeAll(() => (repo = makeFixtureRepo()));
  afterAll(() => fs.rmSync(repo, { recursive: true, force: true }));

  it("clean fixture repo passes", () => {
    const r = runAudit(repo, ["--mode=repo", "--local=abc123"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("OK: repo surface");
  });

  it("missing golden → rejected", () => {
    fs.rmSync(path.join(repo, "tests/golden/legacy-summary-v6104.txt"));
    const r = runAudit(repo, ["--mode=repo", "--local=abc123"]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("golden fixture");
    fs.writeFileSync(path.join(repo, "tests/golden/legacy-summary-v6104.txt"), "x\n"); // existence check, no commit needed
  });

  it("version mismatch → rejected", () => {
    const plug = path.join(repo, "openclaw.plugin.json");
    fs.writeFileSync(plug, '{\n  "version": "0.0.1"\n}\n');
    const r = runAudit(repo, ["--mode=repo", "--local=abc123"]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("version mismatch");
    fs.writeFileSync(plug, '{\n  "version": "9.9.9"\n}\n');
  });

  it("tracked .DS_Store → rejected", () => {
    fs.writeFileSync(path.join(repo, ".DS_Store"), "");
    sh(["git", "add", "-f", ".DS_Store"], repo);
    const r = runAudit(repo, ["--mode=repo", "--local=abc123"]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain(".DS_Store is tracked");
    sh(["git", "rm", "-q", "--cached", ".DS_Store"], repo);
    fs.rmSync(path.join(repo, ".DS_Store"));
  });

  it("hook syntax error → rejected", () => {
    const hookPath = path.join(repo, ".githooks/pre-push");
    const orig = fs.readFileSync(hookPath, "utf-8");
    fs.writeFileSync(hookPath, orig + "\nif [ broken\n");
    const r = runAudit(repo, ["--mode=repo", "--local=abc123"]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("syntax errors");
    fs.writeFileSync(hookPath, orig);
  });

  it("unknown mode → exit 2", () => {
    const r = runAudit(repo, ["--mode=bogus"]);
    expect(r.code).toBe(2);
  });
});

describe("audit-stage-gate.sh --mode=client rc parity with hook (CX-16)", () => {
  let repo = "";
  const ZERO = "0".repeat(40);

  function makeClientRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-client-"));
    sh(["git", "init", "-q"], dir);
    sh(["git", "config", "user.email", "t@t"], dir);
    sh(["git", "config", "user.name", "t"], dir);
    fs.writeFileSync(path.join(dir, "f.txt"), "x");
    sh(["git", "add", "."], dir);
    sh(["git", "commit", "-qm", "init"], dir);
    return dir;
  }

  function writeFixtures(withTest: boolean, withApproval: boolean): void {
    if (withTest) {
      fs.mkdirSync(path.join(repo, "inbox/inbox-results"), { recursive: true });
      fs.writeFileSync(
        path.join(repo, "inbox/inbox-results/r.md"),
        "**Status**: passed\n**Stage**: TEST\n",
      );
    }
    if (withApproval) {
      // v6.13.1: canonical approval dir = inbox/inbox-release/ only.
      fs.mkdirSync(path.join(repo, "inbox/inbox-release"), { recursive: true });
      fs.writeFileSync(
        path.join(repo, "inbox/inbox-release/peter-approval-x.md"),
        "# A\n- **Approver**: Peter\n- **Verdict**: APPROVED\n",
      );
      fs.mkdirSync(path.join(repo, "inbox/inbox-results"), { recursive: true });
      fs.writeFileSync(
        path.join(repo, "inbox/inbox-results/ack-a.md"),
        "**Stage**: release ｜ **Refs**: peter-approval-x.md\n",
      );
    }
  }

  function runBoth(): { hook: number | null; audit: number | null; out: string } {
    const sha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf-8" }).stdout.trim();
    const line = `refs/heads/main ${sha} refs/heads/main ${ZERO}\n`;
    const h = spawnSync("sh", [HOOK], { cwd: repo, input: line, encoding: "utf-8" });
    const a = spawnSync("sh", [SCRIPT, ["--mode=client", `--local=${sha}`, `--remote=${ZERO}`].join(" ")].length ? [SCRIPT, "--mode=client", `--local=${sha}`, `--remote=${ZERO}`] : [SCRIPT], { cwd: repo, encoding: "utf-8" });
    return { hook: h.status, audit: a.status, out: `${h.stderr}${a.stderr}` };
  }

  const cases: Array<[string, boolean, boolean]> = [
    ["compliant", true, true],
    ["missing TEST", false, true],
    ["missing approval", true, false],
    ["both missing", false, false],
  ];

  for (const [name, t, a] of cases) {
    it(`parity: ${name}`, () => {
      if (repo) fs.rmSync(repo, { recursive: true, force: true });
      repo = makeClientRepo();
      writeFixtures(t, a);
      const r = runBoth();
      expect(r.audit).toBe(r.hook); // same rc on both paths
      expect([0, 1]).toContain(r.hook);
    });
  }

  it("v6.13.1: approval in inbox-plan (drift dir) — both paths reject (parity)", () => {
    if (repo) fs.rmSync(repo, { recursive: true, force: true });
    repo = makeClientRepo();
    // TEST receipt present; approval placed in the DRIFT dir (inbox-plan)
    fs.mkdirSync(path.join(repo, "inbox/inbox-results"), { recursive: true });
    fs.writeFileSync(path.join(repo, "inbox/inbox-results/r.md"), "**Status**: passed\n**Stage**: TEST\n");
    fs.mkdirSync(path.join(repo, "inbox/inbox-plan"), { recursive: true });
    fs.writeFileSync(
      path.join(repo, "inbox/inbox-plan/peter-approval-drift.md"),
      "# A\n- **Approver**: Peter\n- **Verdict**: APPROVED\n",
    );
    const r = runBoth();
    expect(r.hook).not.toBe(0);
    expect(r.audit).toBe(r.hook);
    expect(r.out).toContain("Peter RELEASE APPROVED");
  });

  it("v6.13.1: client mode with local == remote is a no-op (EXIT 0)", () => {
    if (repo) fs.rmSync(repo, { recursive: true, force: true });
    repo = makeClientRepo();
    const sha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf-8" }).stdout.trim();
    const r = runAudit(repo, ["--mode=client", `--local=${sha}`, `--remote=${sha}`]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("no-op (nothing to push)");
  });
});
