#!/bin/sh
# claw-ctx stage-gate audit script (CX-16) — SINGLE source of truth, dual consumers:
#
#   --mode=client   pre-push hook: full batch-window audit (TEST receipt,
#                   Peter approval, CX-9 Refs receipts, CX-10 handoff).
#                   DATA BOUNDARY: reads inbox/ — lives on the client only
#                   (inbox/ is gitignored; internal artifacts are not versioned).
#   --mode=repo     CI job: versioned-surface audit (hook syntax, golden file,
#                   version consistency, no .DS_Store tracked, key fixtures).
#                   DATA BOUNDARY: reads only what checkout contains.
#
# The pre-push hook is a thin shell (stdin loop, bypass, tag gate) that calls
# this script with --mode=client — behaviour is byte-equivalent to the
# pre-CX-16 hook (41 hook tests must pass unchanged).
#
# POSIX sh (macOS bash3 + ubuntu runners). No external dependencies.
# FAIL-CLOSED: unreadable prerequisite → non-zero exit.

set -u

MODE=""
LOCAL_SHA=""
REMOTE_SHA=""
for arg in "$@"; do
  case "$arg" in
    --mode=*)   MODE="${arg#--mode=}" ;;
    --local=*)  LOCAL_SHA="${arg#--local=}" ;;
    --remote=*) REMOTE_SHA="${arg#--remote=}" ;;
  esac
done
[ -n "$MODE" ] || { echo "[stage-gate-audit] usage: --mode=client|repo [--local=<sha>] [--remote=<sha>]" >&2; exit 2; }

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
RESULTS_DIR="$ROOT/inbox/inbox-results"

is_zero_sha() {
  case "$1" in
    *[!0]*) return 1 ;;
    *) return 0 ;;
  esac
}

mtime_of() {
  m=$(stat -f %m "$1" 2>/dev/null) || m=$(stat -c %Y "$1" 2>/dev/null) || m=0
  echo "${m:-0}"
}

# ---------------------------------------------------------------------------
# repo mode: versioned-surface checks (CI checkout has no inbox data)
# ---------------------------------------------------------------------------
audit_repo() {
  missing=""

  # 1. hook present + POSIX syntax clean
  if [ ! -f "$ROOT/.githooks/pre-push" ]; then
    missing="$missing
  - repo: .githooks/pre-push missing"
  elif ! sh -n "$ROOT/.githooks/pre-push" 2>/dev/null; then
    missing="$missing
  - repo: .githooks/pre-push has shell syntax errors"
  fi

  # 2. golden fixture exists (legacy byte-equality anchor)
  if [ ! -f "$ROOT/tests/golden/legacy-summary-v6104.txt" ]; then
    missing="$missing
  - repo: golden fixture tests/golden/legacy-summary-v6104.txt missing"
  fi

  # 3. version consistency across the three version sites
  v_pkg=$(grep -m1 '"version":' "$ROOT/package.json" 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/')
  v_lock=$(grep -m1 '"version":' "$ROOT/package-lock.json" 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/')
  v_plug=$(grep -m1 '"version":' "$ROOT/openclaw.plugin.json" 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/')
  if [ -z "$v_pkg" ] || [ -z "$v_lock" ] || [ -z "$v_plug" ]; then
    missing="$missing
  - repo: cannot read version from package.json / package-lock.json / openclaw.plugin.json"
  elif [ "$v_pkg" != "$v_lock" ] || [ "$v_pkg" != "$v_plug" ]; then
    missing="$missing
  - repo: version mismatch package=$v_pkg lock=$v_lock plugin=$v_plug"
  fi

  # 4. no macOS junk tracked
  if git -C "$ROOT" ls-files 2>/dev/null | grep -q 'DS_Store'; then
    missing="$missing
  - repo: .DS_Store is tracked (git rm --cached it)"
  fi

  # 5. key test fixtures present
  if [ ! -f "$ROOT/tests/unit/pre-push-hook.test.ts" ]; then
    missing="$missing
  - repo: key fixture tests/unit/pre-push-hook.test.ts missing"
  fi

  if [ -n "$missing" ]; then
    echo "[stage-gate-audit] PUSH REJECTED (stage-gate) for repo surface:" >&2
    printf '%s\n' "$missing" >&2
    return 1
  fi
  echo "[stage-gate-audit] OK: repo surface (hook syntax + golden + version + fixtures)" >&2
  return 0
}

# ---------------------------------------------------------------------------
# client mode: full batch-window audit — byte-equivalent migration of the
# pre-CX-16 pre-push check_main() (message text preserved verbatim).
# ---------------------------------------------------------------------------
audit_client() {
  local_sha="$LOCAL_SHA"
  remote_sha="$REMOTE_SHA"
  missing=""
  warns=""   # CX-14 / §D(c): assertion ③ downgraded to warning (no rc impact)
  wstart=0

  if [ -z "$local_sha" ]; then
    echo "[pre-push] PUSH REJECTED (stage-gate) for refs/heads/main:" >&2
    echo "  - local sha not provided (fail-closed)" >&2
    return 1
  fi

  if is_zero_sha "$remote_sha"; then
    # CX-3: first push — window starts at the OLDEST commit of the local
    # branch, so receipts from another repo's era cannot pass wholesale.
    if ! git cat-file -e "$local_sha" 2>/dev/null; then
      missing="$missing
  - local head $local_sha is unreadable locally (fail-closed)"
    else
      wstart=$(git log --reverse --format=%ct "$local_sha" 2>/dev/null | head -1)
      case "$wstart" in ''|*[!0-9]*|0)
        wstart=0
        missing="$missing
  - cannot determine first-commit time of local branch (fail-closed)"
        ;;
      esac
    fi
  else
    if ! git cat-file -e "$remote_sha" 2>/dev/null; then
      missing="$missing
  - remote head $remote_sha is unreadable locally (fail-closed)"
    elif [ "$local_sha" != "$remote_sha" ] && git cat-file -e "$local_sha" 2>/dev/null; then
      wstart=$(git log --format=%ct "$remote_sha..$local_sha" 2>/dev/null | tail -1)
      case "$wstart" in ''|*[!0-9]*) wstart=0 ;; esac
    fi
  fi

  # requirement 1: TEST acceptance receipt (PASS) within the batch window.
  # CX-4: lives only in inbox/inbox-results/, and a file that also carries
  # "Approver.*Peter" (dual-claim) does not count as a TEST receipt.
  test_ok=0
  if [ -d "$RESULTS_DIR" ]; then
    for f in "$RESULTS_DIR"/*.md; do
      [ -e "$f" ] || continue
      # CX-8: no substring-level "not an approval" check here. Dual-claim is
      # structurally prevented: a receipt must carry 'Stage.*TEST' and an
      # approval must NOT, so one file can never satisfy both branches.
      # A receipt that merely QUOTES 'Approver: Peter' (e.g. citing gate
      # output as evidence) must stay valid.
      if grep -q 'Stage.*TEST' "$f" 2>/dev/null \
        && grep -Eiq 'Status.*:.*pass' "$f" 2>/dev/null; then
        if [ "$(mtime_of "$f")" -ge "$wstart" ]; then
          test_ok=1
          break
        fi
      fi
    done
  fi
  [ "$test_ok" -eq 1 ] || missing="$missing
  - missing: TEST acceptance receipt (Status PASS) in inbox/inbox-results/ newer than batch start ($(date -u -r "$wstart" 2>/dev/null || date -u -d "@$wstart" 2>/dev/null || echo "t=$wstart"))"

  # requirement 2: Peter RELEASE APPROVED record within the batch window.
  # CX-4: lives only in inbox/inbox-plan/ + inbox/inbox-release/, and a file
  # that also carries "Stage.*TEST" (dual-claim) does not count as approval.
  approval_ok=0
  for d in "$ROOT/inbox/inbox-plan" "$ROOT/inbox/inbox-release"; do
    [ -d "$d" ] || continue
    for f in "$d"/*.md; do
      [ -e "$f" ] || continue
      if grep -q 'APPROVED' "$f" 2>/dev/null \
        && grep -q 'Approver.*Peter' "$f" 2>/dev/null \
        && ! grep -q 'Stage.*TEST' "$f" 2>/dev/null; then
        if [ "$(mtime_of "$f")" -ge "$wstart" ]; then
          approval_ok=1
          break 2
        fi
      fi
    done
  done
  [ "$approval_ok" -eq 1 ] || missing="$missing
  - missing: Peter RELEASE APPROVED record (Approver: Peter + APPROVED, in inbox-plan/ or inbox-release/) newer than batch start"

  # requirement 3 (CX-9): every adjudication/approval doc that entered the
  # batch window must have a Refs: receipt in inbox-inbox-results/.
  # Filename-based detection (policy prefers it; content matching caused the
  # CX-8 false positive). processed/ is scanned too — archiving is not an
  # escape from the receipt duty (policy clause 3).
  #
  # EFFECTIVE = 2026-10-06 00:00 +0800 — receipt policy effective date;
  # older adjudication docs inside the first managed window are exempt.
  EFFECTIVE_TS=1791216000
  req_mtime=$wstart
  if [ "$EFFECTIVE_TS" -gt "$req_mtime" ]; then req_mtime=$EFFECTIVE_TS; fi

  check_refs_receipt() {
    _fname="$1"
    for r in "$RESULTS_DIR"/*.md; do
      [ -e "$r" ] || continue
      # match both the bare "Refs:" protocol header and the bolded
      # "**Refs**:" variant used in practice
      if grep -E 'Refs\**:' "$r" 2>/dev/null | grep -qF "$_fname"; then
        return 0
      fi
    done
    return 1
  }

  for d in "$ROOT/inbox/inbox-design-review" "$ROOT/inbox/inbox-plan"; do
    [ -d "$d" ] || continue
    for f in $(find "$d" -maxdepth 2 -name '*.md' -type f 2>/dev/null); do
      fname=$(basename "$f")
      case "$d" in
        *inbox-design-review) : ;;  # whole dir is the adjudication domain
        *inbox-plan)
          # only review/approval-named docs in plan (policies/plans excluded)
          printf '%s' "$fname" | grep -qiE 'review|approval' || continue
          ;;
      esac
      [ "$(mtime_of "$f")" -ge "$req_mtime" ] || continue
      if ! check_refs_receipt "$fname"; then
        missing="$missing
  - missing: Refs receipt for adjudication doc $fname (stage-gate receipt policy 2026-10-06)"
      fi
    done
  done

  # requirement 4 (CX-10): handoff checklists must be fulfilled.
  # Anchor heading (## 后续…handoff…清单) opts a document in; docs without
  # it are not parsed (no free-text inference — CX-8 lesson, Peter-approved).
  # Each anchor line promises an inbox task that must (1) exist (root or
  # processed/), (2) reference the source doc in its 依据/Task/Refs header,
  # and (3) post-date the source. [x] checkboxes are verified the same as
  # [ ] — a check without a file is a false handoff.
  for d in "$ROOT/inbox/inbox-plan" "$ROOT/inbox/inbox-design-review" "$ROOT/inbox/inbox-results"; do
    [ -d "$d" ] || continue
    for f in $(find "$d" -maxdepth 2 -name '*.md' -type f 2>/dev/null); do
      [ "$(mtime_of "$f")" -ge "$req_mtime" ] || continue
      awk 'tolower($0) ~ /^## .*handoff.*清单/ {found=1} END {exit !found}' "$f" 2>/dev/null || continue
      fname_src=$(basename "$f")
      src_mtime=$(mtime_of "$f")

      anchor_tmp=$(mktemp 2>/dev/null || echo "/tmp/.cx10-$$.tmp")
      awk 'tolower($0) ~ /^## .*handoff.*清单/ {f=1; next} /^## /{f=0} f' "$f" 2>/dev/null > "$anchor_tmp"

      while IFS= read -r line || [ -n "$line" ]; do
        [ -n "$(printf '%s' "$line" | tr -d '[:space:]')" ] || continue
        # deviation from design (plan-doc evidence, receipt-filed): only lines
        # carrying a checkbox marker are validated — signatures/prose in the
        # block are not handoff rows. Checkboxed-but-malformed still fails.
        printf '%s' "$line" | grep -qE '^[[:space:]]*- \[[ x]\]' || continue

        # legal anchor line? (half/full-width colon, optional backtick target)
        if ! printf '%s' "$line" | grep -qE '^[[:space:]]*- \[[ x]\][[:space:]]*[^:：]+[:：].*→[[:space:]]*[`]?inbox-[a-z-]+/[A-Za-z0-9._-]+\.md'; then
          missing="$missing
  - malformed handoff line in $fname_src: $(printf '%s' "$line" | cut -c1-70)"
          continue
        fi
        target=$(printf '%s' "$line" | grep -oE 'inbox-[a-z-]+/[A-Za-z0-9._-]+\.md' | head -1)
        role=$(printf '%s' "$line" | sed -E 's/^[[:space:]]*- \[[ x]\][[:space:]]*([^:：]+)[:：].*/\1/' | tr 'A-Z' 'a-z')
        tdir=${target%%/*}

        # role → expected inbox dirs (five domains; Friday/Peter not receivers)
        case "$role" in
          *jarvis*|*codeagent*) expected=" inbox-code " ;;
          *edith*|*testagent*)  expected=" inbox-test " ;;
          *karen*|*releaseagent*) expected=" inbox-release inbox-deploy " ;;
          *deployagent*)        expected=" inbox-deploy " ;;
          *opsagent*)           expected=" inbox-operate " ;;
          *) expected="" ;;
        esac
        if [ -z "$expected" ] || ! printf '%s' "$expected" | grep -q " $tdir "; then
          missing="$missing
  - malformed handoff line in $fname_src (role/dir mismatch): $(printf '%s' "$line" | cut -c1-70)"
          continue
        fi

        tname=${target##*/}
        tdir_rel=${target%/*}
        tp_root="$ROOT/inbox/$target"
        tp_proc="$ROOT/inbox/$tdir_rel/processed/$tname"

        # ① target exists (root or processed — archiving after delivery counts)
        if [ ! -f "$tp_root" ] && [ ! -f "$tp_proc" ]; then
          missing="$missing
  - missing: handoff task $target for \"$fname_src\" (task file not delivered)"
          continue
        fi
        tfile=$tp_root
        [ -f "$tp_root" ] || tfile=$tp_proc

        # ② task header references the source doc (依据 / Task / Refs lines)
        if ! grep -E '(依据|Task|Refs)' "$tfile" 2>/dev/null | grep -qF "$fname_src"; then
          missing="$missing
  - missing: handoff task $target for \"$fname_src\" (task does not reference source)"
          continue
        fi

        # ③ task must post-date its source — WARNING only (§D(c), Friday
        # ruling; source-doc re-edits must not block an otherwise-compliant
        # delivery, and mtime cannot distinguish re-edit from re-sign)
        if [ "$(mtime_of "$tfile")" -lt "$src_mtime" ]; then
          warns="$warns
  warning: handoff task $target for \"$fname_src\" (task predates source doc)"
        fi
      done < "$anchor_tmp"
      rm -f "$anchor_tmp"
    done
  done

  # warnings never affect rc (§D(c)) — printed on both pass and fail paths
  if [ -n "$warns" ]; then
    printf '%s\n' "$warns" >&2
  fi

  if [ -n "$missing" ]; then
    echo "[pre-push] PUSH REJECTED (stage-gate) for refs/heads/main:" >&2
    printf '%s\n' "$missing" >&2
    return 1
  fi
  echo "[pre-push] stage-gate OK: main (TEST receipt + Peter approval in batch window)" >&2
  return 0
}

case "$MODE" in
  client) audit_client ;;
  repo)   audit_repo ;;
  *)
    echo "[stage-gate-audit] unknown mode: $MODE (expected client|repo)" >&2
    exit 2
    ;;
esac
