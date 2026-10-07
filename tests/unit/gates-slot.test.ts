// CX-20 — per-repo gates slot files: concurrency isolation, migration,
// legacy fallback, explicit override. Drives the REAL pre-push hook.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const HOOK = path.join(REPO_ROOT, ".githooks/pre-push");
const MIGRATE = path.join(REPO_ROOT, "scripts/migrate-gates.sh");
const ZERO = "0".repeat(40);

function sh(cmd: string[], cwd: string, env: Record<string, string> = {}): void {
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: "utf-8", env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`cmd failed: ${cmd.join(" ")}\n${r.stdout}\n${r.stderr}`);
}

function makeRepo(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  sh(["git", "init", "-q"], dir);
  sh(["git", "config", "user.email", "t@t"], dir);
  sh(["git", "config", "user.name", "t"], dir);
  fs.writeFileSync(path.join(dir, "f.txt"), "x");
  sh(["git", "add", "."], dir);
  sh(["git", "commit", "-qm", "init"], dir);
  return dir;
}

function slot(releaseVersion: string): string {
  return JSON.stringify(
    {
      gates: {
        "release-approval-gate": {
          gateId: "release-approval-gate",
          status: "passed",
          timestamp: 1791300000000,
          metadata: { version: releaseVersion, approvedBy: "peter" },
        },
      },
    },
    null,
    2,
  );
}

function runTagPush(cwd: string, tag: string, env: Record<string, string>): { code: number | null; out: string } {
  const sha = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf-8" }).stdout.trim();
  const r = spawnSync("sh", [HOOK], {
    cwd,
    input: `refs/tags/${tag} ${sha} refs/tags/${tag} ${ZERO}\n`,
    encoding: "utf-8",
    env: { ...process.env, OPENCLAW_GATE_BYPASS: "", ...env },
  });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

describe("CX-20 per-repo gates slots", () => {
  let base: string;
  let gatesDir: string;
  let repoA: string;
  let repoB: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "cx20-"));
    gatesDir = path.join(base, "gates");
    fs.mkdirSync(gatesDir, { recursive: true });
    repoA = makeRepo(path.join(base, "claw-ctx"));
    repoB = makeRepo(path.join(base, "devclaw"));
    // per-repo slots with DIFFERENT release versions
    fs.writeFileSync(path.join(gatesDir, "claw-ctx.json"), slot("6.12.0"));
    fs.writeFileSync(path.join(gatesDir, "devclaw.json"), slot("7.0.0-rc.15"));
  });

  afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

  it("concurrent repos read THEIR OWN slot — no cross-repo clobber (the 14:24 incident)", () => {
    const env = { OPENCLAW_GATES_DIR: gatesDir };
    const a = runTagPush(repoA, "v6.12.0", env);
    expect(a.code).toBe(0);
    expect(a.out).toContain("version matched");

    // same tag in repoB must consult devclaw.json → mismatch → reject
    const b = runTagPush(repoB, "v6.12.0", env);
    expect(b.code).not.toBe(0);
    expect(b.out).toContain("!= tag");

    // and devclaw's own tag passes
    const b2 = runTagPush(repoB, "v7.0.0-rc.15", env);
    expect(b2.code).toBe(0);
  });

  it("migrate-gates.sh: legacy shared file → per-repo slot, archive kept, md5 match, idempotent", () => {
    const legacy = path.join(gatesDir, "gates.json");
    fs.writeFileSync(legacy, slot("9.9.9"));
    fs.rmSync(path.join(gatesDir, "claw-ctx.json")); // migration pre-state: no slot yet
    const r = spawnSync("sh", [MIGRATE, "claw-ctx"], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      env: { ...process.env, OPENCLAW_GATES_DIR: gatesDir },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("migrate-gates: OK");
    expect(fs.existsSync(path.join(gatesDir, "claw-ctx.json"))).toBe(true);
    expect(fs.existsSync(legacy)).toBe(true); // source never deleted (records kept)
    const archives = fs.readdirSync(gatesDir).filter((f) => f.startsWith("gates.json.bak-migrated-"));
    expect(archives.length).toBe(1);
    // slot content is byte-identical to the source
    expect(fs.readFileSync(path.join(gatesDir, "claw-ctx.json"), "utf-8")).toBe(fs.readFileSync(legacy, "utf-8"));

    // idempotent second run: no new archive
    const r2 = spawnSync("sh", [MIGRATE, "claw-ctx"], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      env: { ...process.env, OPENCLAW_GATES_DIR: gatesDir },
    });
    expect(r2.status).toBe(0);
    expect(r2.stdout).toContain("idempotent");
    const archives2 = fs.readdirSync(gatesDir).filter((f) => f.startsWith("gates.json.bak-migrated-"));
    expect(archives2.length).toBe(1);
  });

  it("legacy fallback: missing slot + shared gates.json → NOTE + still validates", () => {
    const legacy = path.join(gatesDir, "gates.json");
    fs.writeFileSync(legacy, slot("6.12.0"));
    fs.rmSync(path.join(gatesDir, "claw-ctx.json")); // pre-migration state
    // no claw-ctx.json in this dir
    const r = runTagPush(repoA, "v6.12.0", { OPENCLAW_GATES_DIR: gatesDir });
    expect(r.code).toBe(0);
    expect(r.out).toContain("legacy shared");
    expect(r.out).toContain("migrate-gates.sh");
  });

  it("explicit OPENCLAW_GATES_FILE always wins over slot resolution", () => {
    const explicit = path.join(base, "explicit.json");
    fs.writeFileSync(explicit, slot("5.5.5"));
    const r = runTagPush(repoA, "v5.5.5", {
      OPENCLAW_GATES_FILE: explicit,
      OPENCLAW_GATES_DIR: gatesDir,
    });
    expect(r.code).toBe(0);
    // and a non-matching tag against the SAME explicit file is still rejected
    const r2 = runTagPush(repoA, "v6.12.0", {
      OPENCLAW_GATES_FILE: explicit,
      OPENCLAW_GATES_DIR: gatesDir,
    });
    expect(r2.code).not.toBe(0);
    expect(r2.out).not.toContain("legacy shared"); // no fallback when explicit
  });
});
