#!/usr/bin/env node
// Post-publish CJK gate — release title+body must be English.
// Family rule: devclaw/docs/protocol/UNIFIED-RELEASE-PROCESS.md (hand-written
// English notes via --notes-file; no mixed-language bodies). Incident:
// v6.15.0/v6.15.1 shipped Chinese bodies when the notes-file fallback fired.
//
// usage: check-release-cjk.mjs <tag>
// gh resolved via PATH (mockable in tests). GH_TOKEN env required by gh itself.
// `gh release view` exposes the release title as `name` — there is no `title`
// JSON field (requesting one makes gh exit with Unknown JSON field).

import { execFileSync } from "node:child_process";

const CJK = /[\u4e00-\u9fff]/u;

const tag = process.argv[2];
if (!tag) {
  console.error("usage: check-release-cjk.mjs <tag>");
  process.exit(2);
}

let raw;
try {
  raw = execFileSync("gh", ["release", "view", tag, "--json", "name,body"], {
    encoding: "utf-8",
  });
} catch (err) {
  console.error(`FATAL: cannot read release ${tag} for CJK gate: ${err.message}`);
  process.exit(1);
}

let release;
try {
  release = JSON.parse(raw);
} catch {
  console.error(`FATAL: unparsable gh release view JSON for ${tag}`);
  process.exit(1);
}

const fields = {
  title: String(release.name ?? ""),
  body: String(release.body ?? ""),
};
const hits = Object.entries(fields)
  .filter(([, text]) => CJK.test(text))
  .map(([name]) => name);

if (hits.length > 0) {
  console.error(
    `FATAL: CJK characters found in release ${tag} ${hits.join("+")}`,
  );
  console.error(
    "  family rule: English-only release notes (UNIFIED-RELEASE-PROCESS).",
  );
  console.error(
    `  fix: rewrite release-notes/${tag}.md in English, then \`gh release edit ${tag} --notes-file release-notes/${tag}.md\`.`,
  );
  process.exit(1);
}

console.log(`cjk gate ok: ${tag} (title+body CJK-free)`);
