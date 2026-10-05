// v6.10.3+ — stage-gate pre-push hook unit tests
// Three mandated branches: allow / reject / bypass — plus tag gate and
// fail-closed behaviour. Each test drives the real hook (sh .githooks/pre-push)
// in a throwaway git repo with stdin ref lines, like git does.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const HOOK = path.resolve(import.meta.dirname, "../../.githooks/pre-push");
const ZERO = "0000000000000000000000000000000000000000";

const TEST_RECEIPT = [
  "# Report: TEST acceptance",
  "**Status**: passed（全链 PASS）",
  "**Stage**: TEST ｜ **PipelineId**: v9.9.9",
  "",
].join("\n");

const PETER_APPROVAL = [
  "# Peter Release Approval — claw-ctx v9.9.9",
  "- **Approver**: Peter",
  "- **Verdict**: ✅ APPROVED",
  "",
].join("\n");

function sh(cmd: string[], cwd: string): void {
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: "utf-8" });
  if (r.status !== 0) {
    throw new Error(`cmd failed: ${cmd.join(" ")}\n${r.stdout}\n${r.stderr}`);
  }
}

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prepush-"));
  sh(["git", "init", "-q"], dir);
  sh(["git", "config", "user.email", "hook@test"], dir);
  sh(["git", "config", "user.name", "hook"], dir);
  fs.writeFileSync(path.join(dir, "f.txt"), "x");
  sh(["git", "add", "."], dir);
  sh(["git", "commit", "-qm", "init"], dir);
  return dir;
}

function head(cwd: string): string {
  return spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf-8" })
    .stdout.trim();
}

function runHook(
  cwd: string,
  localSha: string,
  remoteRef: string,
  remoteSha: string,
  env: Record<string, string> = {},
): { code: number | null; out: string } {
  const r = spawnSync("sh", [HOOK], {
    cwd,
    input: `${remoteRef} ${localSha} ${remoteRef} ${remoteSha}\n`,
    encoding: "utf-8",
    env: { ...process.env, ...env },
  });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function writeResults(dir: string, withTest: boolean, withApproval: boolean): void {
  if (withTest) {
    fs.mkdirSync(path.join(dir, "inbox/inbox-results"), { recursive: true });
    fs.writeFileSync(path.join(dir, "inbox/inbox-results/receipt-test-pass.md"), TEST_RECEIPT);
  }
  if (withApproval) {
    fs.mkdirSync(path.join(dir, "inbox/inbox-plan"), { recursive: true });
    fs.writeFileSync(path.join(dir, "inbox/inbox-plan/peter-release-approval-x.md"), PETER_APPROVAL);
  }
}

const GATES_OK = JSON.stringify({
  gates: {
    "release-approval-gate": {
      gateId: "release-approval-gate",
      status: "passed",
      timestamp: 1790000000000,
      metadata: { version: "6.10.3", approvedBy: "peter", signature: "sig_v6103" },
    },
    "emergency-bypass:p-x:1": {
      gateId: "emergency-bypass:p-x:1",
      status: "passed",
      timestamp: 1790000000001,
      metadata: { type: "emergency_bypass", authorization: "valid-bypass-sig-42", authorizedBy: "peter" },
    },
  },
});

describe("pre-push stage-gate hook", () => {
  let repo: string;
  let gatesFile: string;

  beforeEach(() => {
    repo = makeRepo();
    gatesFile = path.join(repo, "gates.json");
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  // --- branch 1: allow -----------------------------------------------------
  it("allows main push when TEST receipt + Peter approval exist", () => {
    writeResults(repo, true, true);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).toBe(0);
    expect(r.out).toContain("stage-gate OK: main");
  });

  it("allows when local == remote (nothing to push)", () => {
    const h = head(repo);
    const r = runHook(repo, h, "refs/heads/main", h);
    expect(r.code).toBe(0);
  });

  it("ignores refs other than main and v* tags", () => {
    const r = runHook(repo, head(repo), "refs/heads/feature", ZERO);
    expect(r.code).toBe(0);
  });

  // --- branch 2: reject ----------------------------------------------------
  it("rejects main push when TEST receipt is missing, listing it", () => {
    writeResults(repo, false, true);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("PUSH REJECTED");
    expect(r.out).toContain("TEST acceptance receipt");
  });

  it("rejects main push when Peter approval is missing, listing it", () => {
    writeResults(repo, true, false);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("Peter RELEASE APPROVED");
  });

  it("rejects when both prerequisites are missing (both listed)", () => {
    writeResults(repo, false, false);
    fs.mkdirSync(path.join(repo, "inbox/inbox-results"), { recursive: true });
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("TEST acceptance receipt");
    expect(r.out).toContain("Peter RELEASE APPROVED");
  });

  it("batch window: receipt older than the oldest pushed commit is rejected", () => {
    writeResults(repo, true, true);
    // second commit = the batch under push
    fs.writeFileSync(path.join(repo, "f.txt"), "y");
    sh(["git", "add", "."], repo);
    sh(["git", "commit", "-qm", "batch"], repo);
    const first = spawnSync("git", ["rev-parse", "HEAD~1"], { cwd: repo, encoding: "utf-8" }).stdout.trim();

    // age the receipts before the batch commit's mtime window
    const old = new Date(Date.now() - 3600_000);
    for (const f of [
      "inbox/inbox-results/receipt-test-pass.md",
      "inbox/inbox-plan/peter-release-approval-x.md",
    ]) {
      fs.utimesSync(path.join(repo, f), old, old);
    }
    const r = runHook(repo, head(repo), "refs/heads/main", first);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("newer than batch start");

    // fresh receipts → allowed
    fs.utimesSync(path.join(repo, "inbox/inbox-results/receipt-test-pass.md"), new Date(), new Date());
    fs.utimesSync(path.join(repo, "inbox/inbox-plan/peter-release-approval-x.md"), new Date(), new Date());
    const ok = runHook(repo, head(repo), "refs/heads/main", first);
    expect(ok.code).toBe(0);
  });

  // --- branch 3: bypass ----------------------------------------------------
  it("bypass with valid sig allows push and appends to bypass-log", () => {
    fs.writeFileSync(gatesFile, GATES_OK);
    fs.mkdirSync(path.join(repo, "inbox/govern"), { recursive: true });
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO, {
      OPENCLAW_GATE_BYPASS: "valid-bypass-sig-42",
      OPENCLAW_GATES_FILE: gatesFile,
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain("BYPASS");
    const log = fs.readFileSync(path.join(repo, "inbox/govern/bypass-log.md"), "utf-8");
    expect(log).toContain("valid-bypass-sig-42");
    expect(log).toContain("refs/heads/main");
  });

  it("bypass with forged sig is rejected even when receipts are present", () => {
    writeResults(repo, true, true);
    fs.writeFileSync(gatesFile, GATES_OK);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO, {
      OPENCLAW_GATE_BYPASS: "forged-sig",
      OPENCLAW_GATES_FILE: gatesFile,
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("does not match any valid emergency-bypass");
  });

  // --- tag gate ------------------------------------------------------------
  it("allows v* tag push when gates release-approval matches the tag", () => {
    fs.writeFileSync(gatesFile, GATES_OK);
    const r = runHook(repo, head(repo), "refs/tags/v6.10.3", ZERO, {
      OPENCLAW_GATES_FILE: gatesFile,
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain("stage-gate OK: v6.10.3");
  });

  it("rejects v* tag push when gates version does not match the tag", () => {
    fs.writeFileSync(gatesFile, GATES_OK);
    const r = runHook(repo, head(repo), "refs/tags/v9.9.9", ZERO, {
      OPENCLAW_GATES_FILE: gatesFile,
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("!= tag");
  });

  it("fail-closed: unreadable gates.json rejects tag push", () => {
    const r = runHook(repo, head(repo), "refs/tags/v6.10.3", ZERO, {
      OPENCLAW_GATES_FILE: path.join(repo, "does-not-exist.json"),
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("fail-closed");
  });

  it("fail-closed: gates without release-approval-gate record rejects tag push", () => {
    fs.writeFileSync(gatesFile, JSON.stringify({ gates: {} }));
    const r = runHook(repo, head(repo), "refs/tags/v6.10.3", ZERO, {
      OPENCLAW_GATES_FILE: gatesFile,
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("no release-approval-gate record");
  });

  // --- CX-3: first-push window must not degrade to epoch 0 ------------------
  it("CX-3: first push (remote=ZERO) with a 2020-era receipt is rejected", () => {
    writeResults(repo, true, true);
    const old = new Date("2020-01-01T00:00:00Z");
    for (const f of [
      "inbox/inbox-results/receipt-test-pass.md",
      "inbox/inbox-plan/peter-release-approval-x.md",
    ]) {
      fs.utimesSync(path.join(repo, f), old, old);
    }
    // local branch first commit is "now" (2026) → receipts pre-date the repo era
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("newer than batch start");
    expect(r.out).not.toContain("stage-gate OK");
  });

  it("CX-3: first push still allows receipts dated within the repo era", () => {
    writeResults(repo, true, true);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).toBe(0);
    expect(r.out).toContain("stage-gate OK: main");
  });

  // --- CX-4: artifact separation (receipt vs approval) ----------------------
  const DUAL_CLAIM = [
    "# Batch record",
    "**Stage**: TEST ｜ **PipelineId**: v9.9.9",
    "**Status**: passed",
    "- **Approver**: Peter",
    "- **Verdict**: ✅ APPROVED",
    "",
  ].join("\n");

  it("CX-8: dual-claim file in inbox-results counts as receipt, approval still required", () => {
    fs.mkdirSync(path.join(repo, "inbox/inbox-results"), { recursive: true });
    fs.writeFileSync(path.join(repo, "inbox/inbox-results/dual.md"), DUAL_CLAIM);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    // CX-8: quoting 'Approver: Peter' inside a receipt no longer disqualifies
    // it (structural dual-claim prevention makes that check redundant and it
    // false-positived on receipts citing gate output). Security outcome is
    // unchanged: push is still rejected because a real Peter approval record
    // (in inbox-plan/ or inbox-release/) is still missing.
    expect(r.code).not.toBe(0);
    expect(r.out).not.toContain("TEST acceptance receipt");
    expect(r.out).toContain("Peter RELEASE APPROVED");
  });

  it("CX-4: single dual-claim file in inbox-plan satisfies neither requirement", () => {
    fs.mkdirSync(path.join(repo, "inbox/inbox-plan"), { recursive: true });
    fs.writeFileSync(path.join(repo, "inbox/inbox-plan/dual.md"), DUAL_CLAIM);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("TEST acceptance receipt");
    expect(r.out).toContain("Peter RELEASE APPROVED");
  });

  it("CX-4: approval file in inbox-results does not count (directory separation)", () => {
    fs.mkdirSync(path.join(repo, "inbox/inbox-results"), { recursive: true });
    fs.writeFileSync(path.join(repo, "inbox/inbox-results/approval-wrong-dir.md"), PETER_APPROVAL);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("Peter RELEASE APPROVED");
  });

  it("CX-4: TEST receipt in inbox-plan does not count (directory separation)", () => {
    fs.mkdirSync(path.join(repo, "inbox/inbox-plan"), { recursive: true });
    fs.writeFileSync(path.join(repo, "inbox/inbox-plan/test-wrong-dir.md"), TEST_RECEIPT);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("TEST acceptance receipt");
  });

  it("CX-4: separated artifacts across the right directories still allow", () => {
    writeResults(repo, true, true);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).toBe(0);
    expect(r.out).toContain("stage-gate OK: main");
  });
});
