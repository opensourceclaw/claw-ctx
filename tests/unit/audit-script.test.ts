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

function runAudit(
  cwd: string,
  args: string[],
  env: Record<string, string> = {},
): { code: number | null; out: string } {
  const r = spawnSync("sh", [SCRIPT, ...args], {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, ...env },
  });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

// v6.13.2 — GNU-portability probe for mtime_of(). A shim `stat` placed first on
// PATH simulates the GNU semantics that break the old BSD-first mtime_of():
//   faithful: `-c %Y` → real mtime (numeric); `-f %m` → non-numeric + exit 0
//             (GNU `stat -f` is filesystem status — exit 0 with a garbage value,
//              so a BSD-first `||` fallback never fires).
//   nonnumeric: BOTH forms emit non-numeric + exit 0 (probes the numeric guard).
// The real-mtime branch is host-portable (GNU `-c %Y` or BSD `-f %m`).
function makeGnuStatShim(dir: string, mode: "faithful" | "nonnumeric"): string {
  const shimDir = path.join(dir, "gnu-stat-shim");
  fs.mkdirSync(shimDir, { recursive: true });
  const lines =
    mode === "faithful"
      ? [
          "#!/bin/sh",
          "# faithful GNU stat shim: -c %Y -> real mtime; -f %m -> non-numeric + exit 0",
          'if [ "$1" = "-c" ] && [ "$2" = "%Y" ]; then',
          '  m=$(/usr/bin/stat -c %Y "$3" 2>/dev/null)',
          '  case "$m" in ""|*[!0-9]*) m=$(/usr/bin/stat -f %m "$3" 2>/dev/null) ;; esac',
          '  case "$m" in ""|*[!0-9]*) m=0 ;; esac',
          "  printf '%s\\n' \"$m\"; exit 0",
          "fi",
          'if [ "$1" = "-f" ]; then printf "?\\n"; exit 0; fi',
          'exec /usr/bin/stat "$@"',
        ]
      : [
          "#!/bin/sh",
          "# broken GNU stat shim: BOTH forms emit non-numeric + exit 0 (guard probe)",
          'printf "?\\n"; exit 0',
        ];
  const p = path.join(shimDir, "stat");
  fs.writeFileSync(p, lines.join("\n") + "\n");
  fs.chmodSync(p, 0o755);
  return shimDir;
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

  // --- v6.13.2: mtime_of GNU-portability (same bug class as devclaw v10.3.2) --
  // The window assertion `[ "$(mtime_of f)" -ge "$wstart" ]` must resolve a
  // real epoch under GNU stat semantics. The old BSD-first mtime_of() let GNU's
  // `stat -f %m` garbage ("?" exit 0) reach the integer comparison → error/false
  // reject. Fix = GNU-first + numeric guard; only the value side changed.
  it("v6.13.2: faithful GNU shim — fresh compliant push is allowed (real mtime, window intact)", () => {
    if (repo) fs.rmSync(repo, { recursive: true, force: true });
    repo = makeClientRepo();
    writeFixtures(true, true);
    const shim = makeGnuStatShim(repo, "faithful");
    const sha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf-8" }).stdout.trim();
    const r = runAudit(repo, ["--mode=client", `--local=${sha}`, `--remote=${ZERO}`], {
      PATH: `${shim}:${process.env.PATH}`,
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain("stage-gate OK: main");
    expect(r.out).not.toContain("integer expression expected");
  });

  it("v6.13.2: numeric guard — non-numeric stat output → fail-closed, no integer error", () => {
    if (repo) fs.rmSync(repo, { recursive: true, force: true });
    repo = makeClientRepo();
    writeFixtures(true, true);
    const shim = makeGnuStatShim(repo, "nonnumeric");
    const sha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf-8" }).stdout.trim();
    const r = runAudit(repo, ["--mode=client", `--local=${sha}`, `--remote=${ZERO}`], {
      PATH: `${shim}:${process.env.PATH}`,
    });
    // guard maps garbage → 0 → receipt appears older than the window → reject,
    // but without the old "integer expression expected" shell error.
    expect(r.code).not.toBe(0);
    expect(r.out).not.toContain("integer expression expected");
    expect(r.out).toContain("PUSH REJECTED");
  });
});
