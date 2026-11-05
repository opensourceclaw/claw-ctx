# release-notes/

Per-tag GitHub Release body files (`<tag>.md`), mandatory input to
`scripts/release-idempotency.sh` (CX-15: `--notes-file` only).

**Why top-level**: `docs/` is fully gitignored (internal notes), so a
docs-based path could never reach CI — OBS-F. This directory is
intentionally NOT ignored; see `.gitignore` comment.

Convention: the RELEASE stage drops `<tag>.md` in the bump commit. The file
is mandatory — a missing one is a FATAL in `release-idempotency.sh` (no
`--generate-notes` fallback; family rule in
`devclaw/docs/protocol/UNIFIED-RELEASE-PROCESS.md`). Notes are hand-written
English, and `scripts/check-release-cjk.mjs` gates the landed title+body for
`[\u4e00-\u9fff]` after publish.
