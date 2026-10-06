// CX-15 — release-idempotency.sh: mock gh covering the three branches
// (absent→create→1 / present→skip→1 / create-leaves-duplicate→FATAL).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const SCRIPT = path.join(REPO_ROOT, "scripts/release-idempotency.sh");

describe("release-idempotency.sh (CX-15)", () => {
  let dir: string;
  let stateDir: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rel-idem-"));
    stateDir = path.join(dir, "state");
    fs.mkdirSync(stateDir, { recursive: true });
    // mock gh on PATH
    const bin = path.join(dir, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(
      path.join(bin, "gh"),
      `#!/bin/sh
# mock gh: MOCK_PRE = releases already existing, MOCK_AFTER = count after create
if [ "$1" = "release" ] && [ "$2" = "list" ]; then
  if [ -f "$MOCK_STATE/created" ]; then
    echo "\${MOCK_AFTER:-1}"
  else
    echo "\${MOCK_PRE:-0}"
  fi
  exit 0
fi
if [ "$1" = "release" ] && [ "$2" = "create" ]; then
  touch "$MOCK_STATE/created"
  exit 0
fi
echo "mock gh: unexpected args $*" >&2
exit 1
`,
      { mode: 0o755 },
    );
    env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      MOCK_STATE: stateDir,
    };
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function run(args: string[], extra: Record<string, string> = {}) {
    const r = spawnSync("sh", [SCRIPT, ...args], {
      cwd: dir,
      encoding: "utf-8",
      env: { ...env, ...extra },
    });
    return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
  }

  it("branch A: absent → creates once → count=1 → exit 0", () => {
    const r = run(["v9.9.9"], { MOCK_PRE: "0", MOCK_AFTER: "1" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("release absent → create");
    expect(r.out).toContain("release ok: v9.9.9 (count=1)");
    expect(fs.existsSync(path.join(stateDir, "created"))).toBe(true);
  });

  it("branch B: already exists → skips create → exit 0", () => {
    const r = run(["v9.9.9"], { MOCK_PRE: "1", MOCK_AFTER: "1" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("release exists (count=1), skip create");
    expect(fs.existsSync(path.join(stateDir, "created"))).toBe(false);
  });

  it("branch C: create leaves duplicates → FATAL exit 1 (OBS-B caught in CI)", () => {
    const r = run(["v9.9.9"], { MOCK_PRE: "0", MOCK_AFTER: "2" });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("FATAL: 2 releases for tag v9.9.9");
  });

  it("notes two-state: docs/releases/<tag>.md present → --notes-file path taken", () => {
    fs.mkdirSync(path.join(dir, "docs/releases"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs/releases/v9.9.9.md"), "# release body\n");
    const r = run(["v9.9.9"], { MOCK_PRE: "0", MOCK_AFTER: "1" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("create with notes file docs/releases/v9.9.9.md");
  });

  it("missing tag arg → exit 2", () => {
    const r = run([]);
    expect(r.code).toBe(2);
  });
});
