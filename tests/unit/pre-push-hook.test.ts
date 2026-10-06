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

function makeRepo(commitDate?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prepush-"));
  sh(["git", "init", "-q"], dir);
  sh(["git", "config", "user.email", "hook@test"], dir);
  sh(["git", "config", "user.name", "hook"], dir);
  fs.writeFileSync(path.join(dir, "f.txt"), "x");
  sh(["git", "add", "."], dir);
  if (commitDate) {
    // pin committer/author date so first-push window predates the policy
    const r = spawnSync(
      "git",
      ["commit", "-qm", "init"],
      {
        cwd: dir,
        encoding: "utf-8",
        env: {
          ...process.env,
          GIT_COMMITTER_DATE: commitDate,
          GIT_AUTHOR_DATE: commitDate,
        },
      },
    );
    if (r.status !== 0) throw new Error(`commit failed: ${r.stderr}`);
  } else {
    sh(["git", "commit", "-qm", "init"], dir);
  }
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
    const approvalName = "peter-release-approval-x.md";
    fs.writeFileSync(path.join(dir, "inbox/inbox-plan", approvalName), PETER_APPROVAL);
    // CX-9: approval docs are adjudication docs too — their own Refs
    // receipt is a policy obligation (clause 1: every stage response)
    fs.mkdirSync(path.join(dir, "inbox/inbox-results"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "inbox/inbox-results", `ack-${approvalName}`),
      `**Stage**: release-approval ｜ **From**: CodeAgent (Jarvis) ｜ **Status**: ack ｜ **Refs**: ${approvalName} ｜ **Date**: 2026-10-06\n`,
    );
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

  // --- CX-7: production gates.json is pretty-printed multi-line --------------
  // (the old single-line-only grep never matched it → tag pushes were
  // falsely rejected; fixtures must mirror the production format)
  const GATES_PRETTY = JSON.stringify(JSON.parse(GATES_OK), null, 2);

  it("CX-7: pretty-printed multi-line gates.json allows a matching tag push", () => {
    expect(GATES_PRETTY).toContain("\n"); // fixture really is multi-line
    fs.writeFileSync(gatesFile, GATES_PRETTY);
    const r = runHook(repo, head(repo), "refs/tags/v6.10.3", ZERO, {
      OPENCLAW_GATES_FILE: gatesFile,
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain("stage-gate OK: v6.10.3");
  });

  it("CX-7: pretty-printed multi-line gates.json still rejects version mismatch", () => {
    fs.writeFileSync(gatesFile, GATES_PRETTY);
    const r = runHook(repo, head(repo), "refs/tags/v9.9.9", ZERO, {
      OPENCLAW_GATES_FILE: gatesFile,
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("!= tag");
  });

  it("CX-7: pretty-printed multi-line gates.json without the record fails closed", () => {
    fs.writeFileSync(gatesFile, JSON.stringify({ gates: {} }, null, 2));
    const r = runHook(repo, head(repo), "refs/tags/v6.10.3", ZERO, {
      OPENCLAW_GATES_FILE: gatesFile,
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("no release-approval-gate record");
  });

  it("CX-7: single-line legacy gates.json format stays compatible", () => {
    fs.writeFileSync(gatesFile, GATES_OK); // single-line
    const r = runHook(repo, head(repo), "refs/tags/v6.10.3", ZERO, {
      OPENCLAW_GATES_FILE: gatesFile,
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain("stage-gate OK: v6.10.3");
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

  // --- CX-9: adjudication docs must have a Refs receipt ----------------------
  // EFFECTIVE = 1791216000 (2026-10-06 00:00 +0800)
  const EFFECTIVE = 1791216000;

  function writeAdjudication(name: string, sub: string): string {
    const dir = path.join(repo, "inbox", sub);
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, name);
    fs.writeFileSync(f, `# Review\n- **裁决**: CONDITIONALLY APPROVED\n`);
    return f;
  }

  function writeRefsReceipt(refsName: string): void {
    const dir = path.join(repo, "inbox/inbox-results");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `ack-${refsName}`),
      `**Stage**: code-review ｜ **From**: CodeAgent (Jarvis) ｜ **Status**: ack ｜ **Refs**: ${refsName} ｜ **Date**: 2026-10-06\n`,
    );
  }

  it("CX-9: adjudication doc without Refs receipt is rejected and listed", () => {
    writeResults(repo, true, true);
    // mtime after the policy effective date → receipt required
    const f = writeAdjudication("friday-review-x-20261006.md", "inbox-design-review");
    const now = new Date();
    fs.utimesSync(f, now, now);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("Refs receipt for adjudication doc friday-review-x-20261006.md");
  });

  it("CX-9: Refs receipt present → allowed", () => {
    writeResults(repo, true, true);
    const f = writeAdjudication("friday-review-y-20261006.md", "inbox-design-review");
    const now = new Date();
    fs.utimesSync(f, now, now);
    writeRefsReceipt("friday-review-y-20261006.md");
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).toBe(0);
    expect(r.out).toContain("stage-gate OK: main");
  });

  it("CX-9: filename mentioned in body but NOT on a Refs line does not count", () => {
    writeResults(repo, true, true);
    const f = writeAdjudication("friday-review-z-20261006.md", "inbox-design-review");
    const now = new Date();
    fs.utimesSync(f, now, now);
    const dir = path.join(repo, "inbox/inbox-results");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "mention-only.md"),
      `# Report\nSee friday-review-z-20261006.md for details (prose mention, no Refs header).\n`,
    );
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("Refs receipt for adjudication doc friday-review-z-20261006.md");
  });

  it("CX-9: pre-policy doc (mtime < 2026-10-06) is exempt even inside window", () => {
    // first-push window starts 2026-10-05 (pinned commit date < EFFECTIVE)
    fs.rmSync(repo, { recursive: true, force: true });
    repo = makeRepo("2026-10-05T10:00:00+0800");
    writeResults(repo, true, true);
    const f = writeAdjudication("friday-review-old-20261005.md", "inbox-design-review");
    const old = new Date("2026-10-05T12:00:00+0800");
    fs.utimesSync(f, old, old);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).toBe(0); // exempt: mtime < EFFECTIVE
    expect(r.out).toContain("stage-gate OK: main");
  });

  it("CX-9: window boundary — doc older than batch start is not required", () => {
    // batch window = commits after remote (both today); doc mtime today but
    // BEFORE the oldest pushed commit → outside the window → not required
    writeResults(repo, true, true);
    fs.writeFileSync(path.join(repo, "f.txt"), "y");
    sh(["git", "add", "."], repo);
    sh(["git", "commit", "-qm", "batch"], repo);
    const first = spawnSync("git", ["rev-parse", "HEAD~1"], { cwd: repo, encoding: "utf-8" }).stdout.trim();
    const f = writeAdjudication("friday-review-prebatch-20261006.md", "inbox-design-review");
    const justNow = new Date(Date.now() + 60_000); // will be older than next commit… pin below
    // age the doc before the batch commit timestamp
    const batchTime = new Date(
      Number(spawnSync("git", ["log", "-1", "--format=%ct", "HEAD"], { cwd: repo, encoding: "utf-8" }).stdout.trim()) * 1000,
    );
    const beforeBatch = new Date(batchTime.getTime() - 60_000);
    fs.utimesSync(f, beforeBatch, beforeBatch);
    void justNow;
    const r = runHook(repo, head(repo), "refs/heads/main", first);
    expect(r.code).toBe(0);
    expect(r.out).toContain("stage-gate OK: main");
  });

  it("CX-9: plan domain — approval-named docs required, policy docs exempt", () => {
    writeResults(repo, true, true);
    // policy-like doc (no review/approval in name) → not an adjudication doc
    const pol = writeAdjudication("stage-gate-receipt-policy-20261006.md", "inbox-plan");
    // adjudication doc in plan → required
    const appr = writeAdjudication("peter-approval-v9999-20261006.md", "inbox-plan");
    const now = new Date();
    fs.utimesSync(pol, now, now);
    fs.utimesSync(appr, now, now);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("peter-approval-v9999-20261006.md");
    expect(r.out).not.toContain("stage-gate-receipt-policy");
  });

  it("CX-9: archived (processed/) adjudication doc still requires a receipt", () => {
    writeResults(repo, true, true);
    const dir = path.join(repo, "inbox/inbox-design-review/processed");
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, "friday-review-archived-20261006.md");
    fs.writeFileSync(f, "# Review\n- **裁决**: ACCEPTED\n");
    const now = new Date();
    fs.utimesSync(f, now, now);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("friday-review-archived-20261006.md");
  });
});
