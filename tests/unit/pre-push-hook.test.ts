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
    // v6.13.1: approval artifacts are canonical ONLY in inbox/inbox-release/
    // (the former inbox-plan scan surface was a bug — Peter 15:35 ruling).
    fs.mkdirSync(path.join(dir, "inbox/inbox-release"), { recursive: true });
    const approvalName = "peter-release-approval-x.md";
    fs.writeFileSync(path.join(dir, "inbox/inbox-release", approvalName), PETER_APPROVAL);
    // CX-9: approval docs are adjudication docs too — their own Refs
    // receipt is a policy obligation (clause 1: every stage response)
    fs.mkdirSync(path.join(dir, "inbox/inbox-results"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "inbox/inbox-results", `ack-${approvalName}`),
      `**Stage**: release-approval ｜ **From**: CodeAgent (Jarvis) ｜ **Status**: ack ｜ **Refs**: ${approvalName} ｜ **Date**: 2026-10-06\n`,
    );
  }
}

// v6.13.2 — GNU-portability probe for mtime_of() (hook delegates the batch
// audit to tools/audit-stage-gate.sh, which is where mtime_of is consumed).
// A shim `stat` first on PATH simulates GNU semantics:
//   faithful: `-c %Y` → real mtime (numeric); `-f %m` → non-numeric + exit 0.
//   nonnumeric: BOTH forms emit non-numeric + exit 0 (probes the numeric guard).
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
      "inbox/inbox-release/peter-release-approval-x.md",
    ]) {
      fs.utimesSync(path.join(repo, f), old, old);
    }
    const r = runHook(repo, head(repo), "refs/heads/main", first);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("newer than batch start");

    // fresh receipts → allowed
    fs.utimesSync(path.join(repo, "inbox/inbox-results/receipt-test-pass.md"), new Date(), new Date());
    fs.utimesSync(path.join(repo, "inbox/inbox-release/peter-release-approval-x.md"), new Date(), new Date());
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
      "inbox/inbox-release/peter-release-approval-x.md",
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
  // CX-14: dual-claim = BOTH actor signatures in one file (TestAgent author
  // + Peter approver) — quoting "Stage: TEST" without the author signature
  // is a normal approval citation and must stay valid (see new case below).
  const DUAL_CLAIM = [
    "# Batch record",
    "**From**: TestAgent (Edith)",
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
    // (in inbox/inbox-release/ — the single canonical dir, v6.13.1) is missing.
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

  it("CX-14: approval quoting its underlying TEST receipt still counts (actor signature rule)", () => {
    // TEST receipt only — the QUOTING approval below must be the ONE that
    // satisfies requirement 2 (otherwise the case cannot detect exclusion)
    writeResults(repo, true, false);
    fs.mkdirSync(path.join(repo, "inbox/inbox-release"), { recursive: true });
    // a genuine Peter approval that QUOTES the TEST receipt header in prose —
    // under the old content rule `Stage.*TEST` anywhere excluded it (false kill)
    fs.writeFileSync(
      path.join(repo, "inbox/inbox-release/peter-approval-quoted.md"),
      [
        "# Peter Release Approval — v9.9.9",
        "- **Approver**: Peter",
        "- **Verdict**: ✅ APPROVED",
        "依据 Edith 验收: **Stage**: TEST ｜ Status: passed(引用所据件,非本人署名)",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(repo, "inbox/inbox-results/ack-pq.md"),
      "**Stage**: release-approval ｜ **Refs**: peter-approval-quoted.md\n",
    );
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).toBe(0);
    expect(r.out).toContain("stage-gate OK: main");
  });

  it("CX-4: separated artifacts across the right directories still allow", () => {
    writeResults(repo, true, true);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).toBe(0);
    expect(r.out).toContain("stage-gate OK: main");
  });

  // --- v6.13.1: approval scan surface narrowed to inbox/inbox-release/ --------
  it("v6.13.1: valid approval in inbox-plan (drift dir) is REJECTED — single canonical", () => {
    // TEST receipt present; a genuine Peter approval placed in the DRIFT dir
    // (inbox-plan). Before v6.13.1 the wide "plan or release" scan accepted
    // this; after narrowing it must NOT satisfy requirement 2.
    writeResults(repo, true, false);
    fs.mkdirSync(path.join(repo, "inbox/inbox-plan"), { recursive: true });
    fs.writeFileSync(path.join(repo, "inbox/inbox-plan/peter-release-approval-drift.md"), PETER_APPROVAL);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("Peter RELEASE APPROVED");
    expect(r.out).not.toContain("stage-gate OK");
  });

  it("v6.13.1: same approval in inbox-release (canonical) is ACCEPTED", () => {
    writeResults(repo, true, false);
    fs.mkdirSync(path.join(repo, "inbox/inbox-release"), { recursive: true });
    fs.writeFileSync(path.join(repo, "inbox/inbox-release/peter-release-approval-drift.md"), PETER_APPROVAL);
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
    // CX-17: commit the batch FIRST, then write receipts — receipt mtime is
    // always >= batch start by construction (was a same-second race: 4/5 red)
    fs.writeFileSync(path.join(repo, "f.txt"), "y");
    sh(["git", "add", "."], repo);
    sh(["git", "commit", "-qm", "batch"], repo);
    const first = spawnSync("git", ["rev-parse", "HEAD~1"], { cwd: repo, encoding: "utf-8" }).stdout.trim();
    writeResults(repo, true, true);
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

  // --- CX-10: handoff checklists must be fulfilled ---------------------------
  function writeHandoffSource(name: string, lines: string[]): string {
    const dir = path.join(repo, "inbox/inbox-plan");
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, name);
    fs.writeFileSync(f, `# Plan\n\n## 后续（handoff 清单）\n${lines.join("\n")}\n\n—— Friday 2026-10-06\n`);
    return f;
  }

  function writeHandoffTask(
    target: string, // e.g. inbox-code/task-x.md
    refsSource: string,
    opts: { processed?: boolean; mtime?: Date } = {},
  ): string {
    const slash = target.lastIndexOf("/");
    const dirRel = target.slice(0, slash);
    const fname = target.slice(slash + 1);
    const base = opts.processed
      ? path.join(repo, "inbox", dirRel, "processed")
      : path.join(repo, "inbox", dirRel);
    fs.mkdirSync(base, { recursive: true });
    const f = path.join(base, fname);
    fs.writeFileSync(f, `# Task\n\n- **依据**: ${refsSource} §1\n- **SubStage**: implement\n`);
    if (opts.mtime) fs.utimesSync(f, opts.mtime, opts.mtime);
    return f;
  }

  it("CX-10: compliant handoff (exists + references + post-dates) allows", () => {
    writeResults(repo, true, true);
    writeHandoffSource("plan-handoff-ok.md", [
      "- [ ] CodeAgent (Jarvis): implement CX-X → inbox-code/task-x.md",
    ]);
    writeHandoffTask("inbox-code/task-x.md", "plan-handoff-ok.md");
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).toBe(0);
    expect(r.out).toContain("stage-gate OK: main");
  });

  it("CX-10: promised task file not delivered → rejected", () => {
    writeResults(repo, true, true);
    writeHandoffSource("plan-handoff-missing.md", [
      "- [ ] TestAgent (Edith): verify → inbox-test/task-y.md",
    ]);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("handoff task inbox-test/task-y.md");
    expect(r.out).toContain("task file not delivered");
  });

  it("CX-10: task exists but does not reference the source → rejected", () => {
    writeResults(repo, true, true);
    writeHandoffSource("plan-handoff-noref.md", [
      "- [ ] CodeAgent (Jarvis): implement → inbox-code/task-noref.md",
    ]);
    writeHandoffTask("inbox-code/task-noref.md", "some-other-source.md");
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("does not reference source");
  });

  it("CX-10: task predating its source doc → EXIT 0 with warning only (§D(c))", () => {
    writeResults(repo, true, true);
    writeHandoffSource("plan-handoff-stale.md", [
      "- [ ] CodeAgent (Jarvis): implement → inbox-code/task-stale.md",
    ]);
    const past = new Date(Date.now() - 3600_000);
    writeHandoffTask("inbox-code/task-stale.md", "plan-handoff-stale.md", { mtime: past });
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).toBe(0); // warning must NOT block
    expect(r.out).toContain("warning: handoff task inbox-code/task-stale.md");
    expect(r.out).toContain("predates source doc");
    expect(r.out).not.toContain("PUSH REJECTED");
    expect(r.out).toContain("stage-gate OK: main");
  });

  it("CX-10: source re-edited after delivery → EXIT 0 with warning (§D(c) landing)", () => {
    writeResults(repo, true, true);
    writeHandoffSource("plan-handoff-reedit.md", [
      "- [ ] CodeAgent (Jarvis): implement → inbox-code/task-reedit.md",
    ]);
    writeHandoffTask("inbox-code/task-reedit.md", "plan-handoff-reedit.md");
    // source doc edited AFTER the task was delivered (mtime refresh) —
    // the exact Edith CX-14 scenario that used to hard-block the push
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(repo, "inbox/inbox-plan/plan-handoff-reedit.md"), later, later);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).toBe(0);
    expect(r.out).toContain("warning: handoff task inbox-code/task-reedit.md");
    expect(r.out).toContain("task predates source doc");
    expect(r.out).not.toContain("PUSH REJECTED");
  });

  it("CX-10: role/dir mismatch (Edith → inbox-code) is malformed", () => {
    writeResults(repo, true, true);
    writeHandoffSource("plan-handoff-mismatch.md", [
      "- [ ] TestAgent (Edith): verify → inbox-code/task-m.md",
    ]);
    writeHandoffTask("inbox-code/task-m.md", "plan-handoff-mismatch.md");
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("role/dir mismatch");
  });

  it("CX-10: doc without anchor heading is not parsed (no free-text inference)", () => {
    writeResults(repo, true, true);
    const dir = path.join(repo, "inbox/inbox-plan");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "plan-prose.md"),
      "# Plan\n\n## 后续\n- Edith should verify something someday (prose, no anchor format)\n",
    );
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).toBe(0);
    expect(r.out).toContain("stage-gate OK: main");
  });

  it("CX-10: pre-policy source doc (mtime < 2026-10-06) is exempt", () => {
    fs.rmSync(repo, { recursive: true, force: true });
    repo = makeRepo("2026-10-05T10:00:00+0800");
    writeResults(repo, true, true);
    const f = writeHandoffSource("plan-handoff-old.md", [
      "- [ ] CodeAgent (Jarvis): implement → inbox-code/task-old.md",
    ]);
    const old = new Date("2026-10-05T12:00:00+0800");
    fs.utimesSync(f, old, old);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).toBe(0);
    expect(r.out).toContain("stage-gate OK: main");
  });

  it("CX-10: [x] checked but task missing → still rejected (no false handoff)", () => {
    writeResults(repo, true, true);
    writeHandoffSource("plan-handoff-checked.md", [
      "- [x] CodeAgent (Jarvis): implement → inbox-code/task-checked.md",
    ]);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("task file not delivered");
  });

  it("CX-10: anchor section present but empty (0 rows) is legal", () => {
    writeResults(repo, true, true);
    writeHandoffSource("plan-handoff-empty.md", []);
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO);
    expect(r.code).toBe(0);
    expect(r.out).toContain("stage-gate OK: main");
  });

  // --- v6.13.2: mtime_of GNU-portability (same bug class as devclaw v10.3.2) --
  // The batch audit's window assertion `[ "$(mtime_of f)" -ge "$wstart" ]` must
  // resolve a real epoch under GNU stat semantics. Old BSD-first mtime_of() let
  // GNU's `stat -f %m` garbage ("?" exit 0) reach the integer comparison.
  it("v6.13.2: faithful GNU shim — fresh compliant push allowed (real mtime, window intact)", () => {
    writeResults(repo, true, true);
    const shim = makeGnuStatShim(repo, "faithful");
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO, {
      PATH: `${shim}:${process.env.PATH}`,
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain("stage-gate OK: main");
    expect(r.out).not.toContain("integer expression expected");
  });

  it("v6.13.2: faithful GNU shim — stale receipts still rejected (window math intact)", () => {
    writeResults(repo, true, true);
    const old = new Date("2020-01-01T00:00:00Z");
    for (const f of [
      "inbox/inbox-results/receipt-test-pass.md",
      "inbox/inbox-release/peter-release-approval-x.md",
    ]) {
      fs.utimesSync(path.join(repo, f), old, old);
    }
    const shim = makeGnuStatShim(repo, "faithful");
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO, {
      PATH: `${shim}:${process.env.PATH}`,
    });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("newer than batch start");
  });

  it("v6.13.2: numeric guard — non-numeric stat output → fail-closed, no integer error", () => {
    writeResults(repo, true, true);
    const shim = makeGnuStatShim(repo, "nonnumeric");
    const r = runHook(repo, head(repo), "refs/heads/main", ZERO, {
      PATH: `${shim}:${process.env.PATH}`,
    });
    expect(r.code).not.toBe(0);
    expect(r.out).not.toContain("integer expression expected");
    expect(r.out).toContain("PUSH REJECTED");
  });
});
