#!/bin/sh
# family-hooks check (D2, A-tier): the repo's OWN hook dir stays bound; hook
# present + executable + POSIX syntax. Exit 0 = green.
set -u

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$ROOT" || exit 1

HOOK=.githooks/pre-push
EXPECT=.githooks
ok=0

if [ ! -x "$HOOK" ]; then
  echo "[family-hooks] FAIL: $HOOK missing or not executable" >&2
  ok=1
fi
bound=$(git config --get core.hooksPath 2>/dev/null || true)
if [ "$bound" != "$EXPECT" ]; then
  echo "[family-hooks] FAIL: core.hooksPath is '${bound:-<unset>}', expected '$EXPECT'" >&2
  ok=1
fi
if ! sh -n "$HOOK" 2>/dev/null; then
  echo "[family-hooks] FAIL: $HOOK has a shell syntax error" >&2
  ok=1
fi

if [ "$ok" -eq 0 ]; then
  echo "[family-hooks] OK: $ROOT (core.hooksPath=$EXPECT)"
fi
exit $ok
