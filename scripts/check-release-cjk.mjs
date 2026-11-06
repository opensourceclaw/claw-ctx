#!/usr/bin/env node
// CJK gate — release notes must be English.
// Family rule: devclaw/docs/protocol/UNIFIED-RELEASE-PROCESS.md (hand-written
// English notes via --notes-file; no mixed-language bodies). Incident:
// v6.15.0/v6.15.1 shipped Chinese bodies when the notes-file fallback fired.
//
// Two entry points sharing the same rule:
//   check-release-cjk.mjs --file <notes-file>   preflight, before create
//   check-release-cjk.mjs <tag>                 post-publish gate on gh name+body
//
// `gh release view` exposes the release title as `name` — there is no `title`
// JSON field (requesting one makes gh exit with Unknown JSON field).
//
// gh resolved via PATH (mockable in tests). GH_TOKEN env required by gh itself.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";

const CJK = /[\u4e00-\u9fff]/u;
const USAGE = "usage: check-release-cjk.mjs --file <notes-file> | <tag>";

const [first, second] = process.argv.slice(2);

if (first === "--file") {
  if (!second) {
    console.error(USAGE);
    process.exit(2);
  }
  let notes;
  try {
    notes = fs.readFileSync(second, "utf-8");
  } catch (err) {
    console.error(`FATAL: cannot read notes file ${second}: ${err.message}`);
    process.exit(1);
  }
  if (CJK.test(notes)) {
    console.error(`FATAL: CJK characters found in notes file ${second}`);
    console.error(
      "  family rule: English-only release notes (UNIFIED-RELEASE-PROCESS).",
    );
    console.error(
      `  fix: rewrite ${second} in English before creating the release.`,
    );
    process.exit(1);
  }
  console.log(`cjk preflight ok: ${second} (notes file CJK-free)`);
  process.exit(0);
}

const tag = first;
if (!tag) {
  console.error(USAGE);
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
