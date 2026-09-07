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
 * claw-ctx v6.9.0 — Structural Digest constants (ADR-1/ADR-2/ADR-3)
 *
 * All tuning values are initial estimates — mark and calibrate after real
 * session observation (repo convention: constants annotated 待校准).
 */

/** Master switch: false fully reverts compaction output to pre-v6.9.0 bytes */
export const STRUCTURAL_DIGEST_ENABLED = true;

/** Message-content prefix marking a structural digest entry (quasi-header) */
export const DIGEST_PREFIX = "[STRUCTURAL-DIGEST v1]";

/** Minimum confidence to enter the protected zone (below = dropped, 宁缺毋滥) */
export const CONFIDENCE_FLOOR = 0.75; // 待校准
export const STRONG_SIGNAL_BASE = 0.85;
export const WEAK_SIGNAL_BASE = 0.6; // weak only enters when raised to 0.75
export const WEAK_SIGNAL_RAISED = 0.75;
export const CONFIDENCE_CAP = 0.95;
export const LINKER_BONUS = 0.1; // reason linker in sentence
export const LEN_BONUS = 0.05; // sentence > LEN_BONUS_CHARS
export const LEN_BONUS_CHARS = 50;

/** Protected zone capacity (≈ 8-10KB text, single monotonic entry) */
export const DIGEST_MAX_TOKENS = 2048; // 待校准

export const SNIPPET_MAX_CHARS = 200; // stored provenance snippet cap
export const SNIPPET_DISPLAY_CHARS = 80; // per-line display cap
export const ITEM_TEXT_MAX_CHARS = 160; // entry body display cap (claim/approach/…)

export const MIN_SENTENCE_CHARS = 12; // below: not enough context, dropped

/** Parse lossy-rebuild defaults (entry confidence unknown after text round-trip) */
export const PARSE_REBUILD_CONFIDENCE = CONFIDENCE_FLOOR;
export const PARSE_REBUILD_ROUND = 0;

export const SECTION_CONFIRMED = "-- 已确认 --";
export const SECTION_REJECTED = "-- 已否决 --";
export const SECTION_PITFALLS = "-- API 契约与坑 --";
