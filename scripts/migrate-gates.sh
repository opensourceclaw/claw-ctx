#!/bin/sh
# CX-20 — split the legacy shared gates store into per-repo slot files.
#
#   usage: migrate-gates.sh <repo-name> [--source <legacy-file>]
#
#   Default source: $GATES_DIR/gates.json (the shared single-slot file that
#   caused the 2026-10-07 14:24 cross-repo clobber). The source is NEVER
#   deleted — it is archived as gates.json.bak-migrated-<epoch> (records are
#   kept, md5 printed for the audit trail), then copied to <repo>.json.
#   Idempotent: if <repo>.json already exists → no-op (exit 0).
#
#   Concurrency semantics after the split (task §3):
#     - cross-repo / cross-tag: isolated (separate files)
#     - same repo + same tag: still single-slot (by design — that pair is
#       mutually exclusive anyway)
#
# POSIX sh. No new dependencies.

set -eu

GATES_DIR="${OPENCLAW_GATES_DIR:-$HOME/.openclaw/gates}"
REPO="${1:-}"
if [ -z "$REPO" ]; then
  echo "usage: migrate-gates.sh <repo-name> [--source <legacy-file>]" >&2
  exit 2
fi

SOURCE="$GATES_DIR/gates.json"
if [ "${2:-}" = "--source" ] && [ -n "${3:-}" ]; then
  SOURCE="$3"
fi

DST="$GATES_DIR/$REPO.json"

if [ -f "$DST" ]; then
  echo "migrate-gates: OK (idempotent) — $DST already exists; source untouched."
  exit 0
fi

if [ ! -f "$SOURCE" ]; then
  echo "migrate-gates: source not found: $SOURCE (nothing to migrate)" >&2
  exit 1
fi

mkdir -p "$GATES_DIR"
EPOCH=$(date +%s)
ARCHIVE="$GATES_DIR/gates.json.bak-migrated-$EPOCH"
cp "$SOURCE" "$ARCHIVE"
cp "$SOURCE" "$DST"

md5_of() {
  if command -v md5sum >/dev/null 2>&1; then
    md5sum "$1" | awk '{print $1}'
  elif command -v md5 >/dev/null 2>&1; then
    md5 -q "$1"
  else
    echo "no-md5-tool"
  fi
}

SRC_MD5=$(md5_of "$SOURCE")
DST_MD5=$(md5_of "$DST")
echo "migrate-gates: OK"
echo "  source : $SOURCE (md5=$SRC_MD5)"
echo "  archive: $ARCHIVE (records preserved — source NOT deleted)"
echo "  slot   : $DST (md5=$DST_MD5)"
if [ "$SRC_MD5" != "$DST_MD5" ]; then
  echo "migrate-gates: WARN md5 mismatch between source and slot" >&2
  exit 1
fi
grep -o '"version": *"[^"]*"' "$DST" 2>/dev/null | head -1 | sed 's/^/  contains /' || true
echo "  next: future releases write $DST; other repos keep their own slots."
