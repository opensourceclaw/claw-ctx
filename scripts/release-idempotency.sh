#!/bin/sh
# CX-15 — GH Release idempotency: create-if-absent by FULL list lookup
# (gh release view is unreliable against drafts — OBS-B double-release), then
# verify exactly ONE release exists for the tag; anything else fails the job.
#
# Family rule (devclaw/docs/protocol/UNIFIED-RELEASE-PROCESS.md):
#   release notes are hand-written, English-only, passed via --notes-file.
#   There is NO --generate-notes fallback: a missing notes file is a FATAL.
#   v6.15.0/v6.15.1 shipped Chinese bodies after that fallback fired, so the
#   landed title+body are CJK-gated by check-release-cjk.mjs as well.
#
# usage: release-idempotency.sh <tag>
# gh resolved via PATH (mockable in tests). GH_TOKEN env required by gh itself.

set -u

TAG="${1:-}"
[ -n "$TAG" ] || { echo "usage: release-idempotency.sh <tag>" >&2; exit 2; }

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

count_for_tag() {
  gh release list --json tagName --jq "[.[] | select(.tagName==\"$TAG\")] | length"
}

BEFORE=$(count_for_tag) || { echo "FATAL: cannot list releases for $TAG" >&2; exit 1; }

if [ "$BEFORE" -eq 0 ]; then
  NOTES="release-notes/${TAG}.md"
  if [ ! -f "$NOTES" ]; then
    echo "FATAL: missing release notes file: $NOTES" >&2
    echo "  family rule: hand-written English notes via --notes-file only; --generate-notes is forbidden (UNIFIED-RELEASE-PROCESS)." >&2
    echo "  fix: add $NOTES (English) in the bump commit, then re-run this job." >&2
    exit 1
  fi
  # Preflight (OBS-2): run the same CJK rule on the notes file before create —
  # a bad note must fail the job while no release exists yet.
  node "$SCRIPT_DIR/check-release-cjk.mjs" --file "$NOTES" \
    || { echo "FATAL: CJK preflight failed for $NOTES — release not created" >&2; exit 1; }
  echo "release absent → create with notes file $NOTES"
  gh release create "$TAG" --notes-file "$NOTES" --title "claw-ctx $TAG" \
    || { echo "FATAL: gh release create failed for $TAG" >&2; exit 1; }
else
  echo "release exists (count=$BEFORE), skip create"
fi

# idempotency self-check — a duplicate (OBS-B) must turn CI red, not be
# discovered by a human on the Releases page
AFTER=$(count_for_tag) || { echo "FATAL: cannot re-list releases for $TAG" >&2; exit 1; }
if [ "$AFTER" -ne 1 ]; then
  echo "FATAL: $AFTER releases for tag $TAG (expected exactly 1)" >&2
  exit 1
fi

# post-publish CJK gate — backstop for notes-vs-release drift (body already
# landed, so this can only alarm: CI red, never silent, never auto-rewritten)
node "$SCRIPT_DIR/check-release-cjk.mjs" "$TAG" \
  || { echo "FATAL: CJK gate failed for $TAG — release title/body must be English (UNIFIED-RELEASE-PROCESS)" >&2; exit 1; }

echo "release ok: $TAG (count=1)"
