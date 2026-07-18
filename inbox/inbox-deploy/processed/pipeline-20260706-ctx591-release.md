# Task: claw-ctx v5.9.1 Push & Release

**From**: Friday (A)
**To**: Jarvis (B)
**Date**: 2026-07-06
**Stage**: deploy
**Priority**: High
**PipelineId**: pipeline-20260706-ctx591
**Project**: claw-ctx
**Version**: v5.9.1

---

## Background

v5.9.1 has passed all stages. Push and release.

**Project Location**: `/Users/liantian/workspace/osprojects/claw-ctx/`

## Task

### 1. Push

```bash
cd /Users/liantian/workspace/osprojects/claw-ctx
git push origin main
```

### 2. Tag & Push

```bash
git tag v5.9.1
git push origin v5.9.1
```

### 3. GitHub Release

```bash
gh release create v5.9.1 \
  --title "v5.9.1: Dynamic Version Injection" \
  --notes "## v5.9.1 (2026-07-06)

### Changed
- **Dynamic Version Injection**: Version now reads from package.json at build time
- **Auto-generated src/version.ts**: Build script generates version file, eliminated hardcoded strings
- **Test regex updated**: Version check pattern now accepts any semver format

### Fixed
- Runtime version display no longer lags behind package.json after upgrades
- Eliminated risk of version mismatch between code and package metadata"
```

## Acceptance Criteria

- [ ] git push successful
- [ ] git tag v5.9.1 pushed
- [ ] GitHub Release created

---

## Project Location

`/Users/liantian/workspace/osprojects/claw-ctx/`
