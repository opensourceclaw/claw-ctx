import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const SCRIPT = path.resolve("scripts/postinstall-hooks.mjs");

function runScript(cwd: string) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" });
}

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function localHooksPath(dir: string): string | null {
  const r = git(dir, ["config", "--local", "--get", "core.hooksPath"]);
  return r.status === 0 ? r.stdout.trim() : null;
}

describe("postinstall-hooks script", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "clawctx-postinstall-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("does not touch a consumer repo's hooksPath during a dependency install", () => {
    const consumer = path.join(tmp, "consumer");
    fs.mkdirSync(consumer);
    expect(git(consumer, ["init"]).status).toBe(0);
    expect(
      git(consumer, ["config", "--local", "core.hooksPath", "scripts/git-hooks"]).status,
    ).toBe(0);

    // npm runs dependency postinstalls with cwd = node_modules/<pkg>.
    const pkgDir = path.join(consumer, "node_modules", "@opensourceclaw", "claw-ctx");
    fs.mkdirSync(pkgDir, { recursive: true });

    const r = runScript(pkgDir);
    expect(r.status).toBe(0);
    expect(localHooksPath(consumer)).toBe("scripts/git-hooks");
  });

  it("leaves an unset consumer hooksPath unset", () => {
    const consumer = path.join(tmp, "consumer-unset");
    fs.mkdirSync(consumer);
    expect(git(consumer, ["init"]).status).toBe(0);

    const pkgDir = path.join(consumer, "node_modules", "@opensourceclaw", "claw-ctx");
    fs.mkdirSync(pkgDir, { recursive: true });

    const r = runScript(pkgDir);
    expect(r.status).toBe(0);
    expect(localHooksPath(consumer)).toBeNull();
  });

  it("wires .githooks when cwd is the repository root (maintainer checkout)", () => {
    const repo = path.join(tmp, "self");
    fs.mkdirSync(repo);
    expect(git(repo, ["init"]).status).toBe(0);

    const r = runScript(repo);
    expect(r.status).toBe(0);
    expect(localHooksPath(repo)).toBe(".githooks");
  });

  it("is a silent no-op outside a git checkout", () => {
    const plain = path.join(tmp, "plain");
    fs.mkdirSync(plain);

    const r = runScript(plain);
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
    expect(fs.existsSync(path.join(plain, ".git"))).toBe(false);
  });
});
