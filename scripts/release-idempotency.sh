#!/bin/sh
# CX-15 — GH Release idempotency: create-if-absent by FULL list lookup
# (gh release view is unreliable against drafts — OBS-B double-release), then
# verify exactly ONE release exists for the tag; anything else fails the job.
#
# body responsibility (two-state, OBS-C/E):
#   docs/releases/<tag>.md exists  → workflow publishes the full body (--notes-file)
#   otherwise                      → --generate-notes compare link only;
#                                    publisher may PATCH afterwards (explicit)
#
# usage: release-idempotency.sh <tag>
# gh resolved via PATH (mockable in tests). GH_TOKEN env required by gh itself.

set -u

TAG="${1:-}"
[ -n "$TAG" ] || { echo "usage: release-idempotency.sh <tag>" >&2; exit 2; }

count_for_tag() {
  gh release list --json tagName --jq "[.[] | select(.tagName==\"$TAG\")] | length"
}

BEFORE=$(count_for_tag) || { echo "FATAL: cannot list releases for $TAG" >&2; exit 1; }

if [ "$BEFORE" -eq 0 ]; then
  NOTES="docs/releases/${TAG}.md"
  if [ -f "$NOTES" ]; then
    echo "release absent → create with notes file $NOTES"
    gh release create "$TAG" --notes-file "$NOTES" --title "claw-ctx $TAG" \
      || { echo "FATAL: gh release create failed for $TAG" >&2; exit 1; }
  else
    echo "release absent → create with --generate-notes (body falls back to compare link; publisher may PATCH)"
    gh release create "$TAG" --generate-notes --title "claw-ctx $TAG" \
      || { echo "FATAL: gh release create failed for $TAG" >&2; exit 1; }
  fi
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
echo "release ok: $TAG (count=1)"
