#!/usr/bin/env node
/**
 * Wire repo-level hooks only when this package IS the repository root
 * (maintainer checkout). npm runs dependency postinstalls with cwd inside the
 * consumer's repo (node_modules/<pkg>), where an unconditional
 * `git config core.hooksPath` would write into the CONSUMER's .git/config —
 * silently disabling that repo's own hooks (incident: v6.16.0, claw-mem /
 * devclaw). Under a dependency install, or outside a git checkout, this is a
 * no-op.
 *
 * Zero dependencies (node builtins only).
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

let topLevel;
try {
  topLevel = git(["rev-parse", "--show-toplevel"]);
} catch {
  // Not a git checkout (e.g. tarball install outside a repo) — nothing to wire.
  process.exit(0);
}

if (resolve(topLevel) !== resolve(process.cwd())) {
  // Dependency install: cwd is node_modules/<pkg> inside a consumer repo.
  // Never touch the consumer's git config.
  process.exit(0);
}

try {
  git(["config", "--local", "core.hooksPath", ".githooks"]);
} catch {
  // Preserve the historical fail-open semantics (the old `|| echo` branch):
  // a failed write must never fail the install.
  process.stderr.write("[postinstall] core.hooksPath not set (git config failed)\n");
}
