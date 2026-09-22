/**
 * Vendored snapshot drift lock — claw-mem error-card contract (T2a, Friday 2026-09-22).
 *
 * Upgrade from substring-only (toContain) locks in error-card-injection.test.ts:
 *  (1) byte-level sha256 of the snapshot file, and
 *  (2) heading-structure full-equality (all #/##/### titles in order).
 * Existing toContain assertions remain untouched. Snapshot NOT rewritten.
 * Upgrade procedure: devclaw/docs/contracts/VENDORED_CONTRACT_STANDARD.md §(c).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const source = readFileSync(
  fileURLToPath(
    new URL("./fixtures/error-card-injection-contract.snapshot.md", import.meta.url)
  ),
  "utf-8"
);

const headings = source.split("\n").filter((line) => /^#{1,3} /.test(line));

describe("error-card-injection-contract.snapshot.md — byte + structure lock (T2a)", () => {
  it("byte sha256 matches embedded expectation", () => {
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "1b8235027ccf7ab1be643e7652aaeca5f1c3483847e6bc80f739796e40973d43"
    );
  });

  it("heading structure is locked (full equality, order-sensitive)", () => {
    expect(headings).toEqual([
      "# Error Card Injection Contract (claw-mem × claw-ctx)",
      "## 1. Query parameters (ctx → mem)",
      "## 2. Card → reminder format (mem produces, ctx injects verbatim)",
      "## 3. hit / avoided writeback (host-driven, at run settlement)",
      "## 4. Enum alignment (three-repo)",
      "## 5. Frozen surfaces",
      "## 6. v7.8.0 additive extension（双侧卡存储 + 策略组合框架）",
      "### 6.1 cardType 维度（schema + 查询）",
      "### 6.2 注入格式（✅ 行 + 双侧头）",
      "### 6.3 回写扩展（lifecycle，§3 扩展字段）",
      "### 6.4 T2 占位",
    ]);
  });
});
