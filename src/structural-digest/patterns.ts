/**
 * claw-ctx — Context Engine for OpenClaw
 *
 * Copyright 2026 Peter Cheng
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * claw-ctx v6.9.0 — Structural Digest pattern families (ADR-1, §4.3)
 *
 * Three conservative bilingual (EN+ZH) class pattern sets with strong/weak
 * signal grading and suppression words. Rules:
 * - strong hit → base 0.85 (+ reason-linker +0.1, long sentence +0.05, cap 0.95)
 * - weak hit → only when NOT suppressed AND sentence carries a reason linker,
 *   raised 0.6 → 0.75 (i.e. just at the floor)
 * - pitfalls class has no weak tier by design (§4.3: neutral context can never
 *   reach the floor — equivalent to producing nothing).
 */

export type DigestClass = "confirmed" | "rejected" | "pitfalls";

export interface ClassPatternSet {
  strong: RegExp[];
  weak: RegExp[];
  suppress: RegExp[];
}

/* ── Class 1: confirmed decisions / facts ─────────────────────────── */

export const CONFIRMED_PATTERNS: ClassPatternSet = {
  strong: [
    /\b(?:decided|agreed|settled on|went with|chose|chosen|selected|opted for|will use)\b/i,
    /\bdecided to (?:implement|switch|use|go with|adopt)\b/i,
    /(?:决定|同意|确认|选定|采用|一致认为)/,
    /确定(?:使用|用|方案|采用)/,
  ],
  weak: [
    /\b(?:should|let's|we'll)\s+(?:go with|use|do|try|implement|adopt|switch to)\b/i,
    /\b(?:plan|planning|thinking) to (?:use|try|implement|adopt|switch to)\b/i,
    /(?:建议|考虑|打算)(?:用|采用|试|换|切换)/,
    /可以(?:试试|试一下|用)/,
  ],
  suppress: [
    /\b(?:maybe|perhaps|probably|possibly|should we|can we|how about|what about|do you think|could try|would be nice)\b/i,
    /(?:也许|可能|或许|大概|要不要|怎么样|是不是|能不能|要不)/,
  ],
};

/* ── Class 2: rejected approaches ─────────────────────────────────── */

export const REJECTED_PATTERNS: ClassPatternSet = {
  strong: [
    /\b(?:rejected|abandoned|abandon|scrapped|dropped|decided against|backed out of)\b/i,
    /\b(?:does|do|did|will|won't|wont|would) not work\b|\bdoesn't work\b|\bdidn't work\b/i,
    /\bnot (?:viable|feasible|an option|worth it)\b/i,
    /\bno longer (?:using|needed|required|an option|feasible)\b/i,
    /\bremoved the (?:approach|solution|option|idea)\b/i,
    /(?:否决|放弃|回退|撤掉|废弃|弃用)/,
    /(?:行不通|不可行|不采用|不成立|跑不通|走不通|被拒)/,
    /(?:没(?:有)?成功|试(?:了|过)不行|别再?用)/,
  ],
  weak: [],
  suppress: [],
};

/* Reason linkers shared by confidence scoring (LINKER_BONUS) and
 * rejected approach/reason splitting (REJECT_REASON_SPLIT). */
export const LINKERS: RegExp[] = [
  /\b(?:because|due to|as a result|in order to|so that)\b/i,
  /(?:因为|由于|目的是|以便|从而|所以)/,
];

/** Splitting anchors for rejected → {approach, reason} (conservative set) */
export const REJECT_REASON_SPLIT: RegExp[] = [
  /\b(?:because|due to)\b/i,
  /(?:因为|由于|原因是|是因为)/,
];

/* ── Class 3: API pitfalls (strong only) ──────────────────────────── */

/** Negative words — pitfall sentence must carry one */
export const PITFALL_NEGATIVE: RegExp[] = [
  /\b(?:error|errors|fails?|failed|crash(?:es|ed)?|broken|throws?|threw|rejected|invalid|deprecated|gotcha|pitfalls?|misbehav(?:es|ed))\b|\bnot (?:supported|available|working)\b|\breturns? (?:null|undefined)\b/i,
  /(?:报错|出错|失败|崩溃|崩了|坑|陷阱|注意|小心|无法|不能|无效|被拒|拒绝|不支持|不兼容|踩(?:过|坑)|失效|异常)/,
];

/** API symbol shape: dotted chain, backtick code, or call site */
export const API_SYMBOL: RegExp[] = [
  /\b([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+)/,
  /`([\w./@:-]+)`/,
];

/** Explicit workaround markers (extracted as trailing segment) */
export const WORKAROUND_MARKERS: RegExp[] = [
  /\bworkarounds?\s*[:：]?\s*([^.;，。]+)/i,
  /(?:绕开|解决办法|替代方案|改用)\s*(?:[:：]?\s*)?([^.;，。]+)/,
];

export function hasAny(text: string, patterns: RegExp[]): boolean {
  for (const p of patterns) {
    p.lastIndex = 0;
    if (p.test(text)) return true;
  }
  return false;
}
