# release-notes/

Per-tag GitHub Release body files (`<tag>.md`), consumed by
`scripts/release-idempotency.sh` (`--notes-file` branch of the CX-15
two-state body rule).

**Why top-level**: `docs/` is fully gitignored (internal notes), so a
docs-based path could never reach CI — OBS-F. This directory is
intentionally NOT ignored; see `.gitignore` comment.

Convention: the RELEASE stage drops `<tag>.md` in the bump commit;
absent file → `--generate-notes` fallback + publisher PATCH (explicit).
