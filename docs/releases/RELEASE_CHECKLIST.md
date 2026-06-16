# Release Preflight Checklist

Use this checklist before creating any release to ensure all version-related items are updated.

## Pre-Release Checklist

- [ ] `package.json` version has been bumped
- [ ] `openclaw.plugin.json` version has been bumped
- [ ] `src/engine.ts` version string updated
- [ ] `src/index.ts` version string updated
- [ ] `README.md` version badge updated
- [ ] CHANGELOG new entry added with date
- [ ] `npm run lint` exits with code 0
- [ ] `npm test` passes (run 3 times for stability)
- [ ] `npm run build` succeeds
- [ ] All changes committed to git
- [ ] Git tag created with correct version

## Version Bump Commands

```bash
# 1. Update version in package.json
npm version patch  # or minor/major

# 2. Update openclaw.plugin.json
sed -i '' 's/"version": "X.Y.Z"/"version": "NEW_VERSION"/' openclaw.plugin.json

# 3. Update src/engine.ts
sed -i '' 's/version: "X.Y.Z"/version: "NEW_VERSION"/' src/engine.ts

# 4. Update src/index.ts (2 places)
sed -i '' 's/"X.Y.Z"/"NEW_VERSION"/g' src/index.ts
sed -i '' 's/vX.Y.Z/vNEW_VERSION/g' src/index.ts

# 5. Update README.md
sed -i '' 's/vX.Y.Z/vNEW_VERSION/g' README.md

# 6. Add CHANGELOG entry
# See CHANGELOG.md for format

# 7. Commit
git add -A
git commit -m "chore: bump version to vNEW_VERSION"

# 8. Create tag
git tag vNEW_VERSION

# 9. Push
git push origin main --tags
```

## Post-Release

- [ ] GitHub Release created
- [ ] npm publish (if applicable)
- [ ] Announcement sent (if applicable)
