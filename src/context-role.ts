// claw-ctx v6.8.0 — Role-aware context injection (ADR: role-aware-injection)
//
// Five-role context package semantics (Authority > Exemplar > Constraint >
// Rubric > Metadata) based on arXiv 2604.04258v1 (Context Engineering).
// Injection products carry role + priority; assembly arbitrates conflicts by
// priority instead of injection order, so low-priority signals cannot override
// high-priority governance constraints.
//
// Default role map (configurable via roleOverrides):
//   Governance/Constitution -> authority (P1)
//   RL experiences          -> exemplar   (P2)
//   CI / CrossDomain        -> constraint (P3)
//   Drift quality           -> rubric     (P4)
//   session/meta            -> metadata   (P5, fallback)
//
// Licensed under the Apache License, Version 2.0

export type ContextRole = "authority" | "exemplar" | "constraint" | "rubric" | "metadata";

export const CONTEXT_ROLES: ContextRole[] = ["authority", "exemplar", "constraint", "rubric", "metadata"];

/** Priority per role: 1 = highest, 5 = lowest. */
export const ROLE_PRIORITY: Record<ContextRole, number> = {
  authority: 1,
  exemplar: 2,
  constraint: 3,
  rubric: 4,
  metadata: 5,
};

/**
 * v6.8.0: An injection segment carrying its role semantics.
 * `block` is the exact text previously injected as a raw string.
 */
export interface RoleHint {
  role: ContextRole;
  priority: number;
  /** Injector identity: "governance" | "rl" | "ci" | "crossdomain" | "drift" | "constitution" | ... */
  source: string;
  /** Injection text */
  block: string;
  /**
   * Separator used when joining this segment (default "\n\n").
   * Preserves pre-v6.8.0 join semantics per segment (e.g. multimodal used "\n").
   */
  separator?: "\n" | "\n\n";
}

/** Join role hints preserving each segment's original separator semantics. */
export function joinRoleHints(hints: RoleHint[]): string {
  let out = "";
  for (const h of hints) {
    if (!h.block) continue;
    out = out === "" ? h.block : out + (h.separator ?? "\n\n") + h.block;
  }
  return out;
}

/** v6.8.0: A detected same-topic conflict between two priorities. */
export interface RoleConflictRecord {
  lowPrioritySource: string;
  highPrioritySource: string;
  /** Overlapping topic keyword */
  topic: string;
  /** Role of the retained (higher-priority) segment */
  resolved: ContextRole;
}

/** v6.8.0: Observational role distribution for the injected context. */
export interface RoleBreakdown {
  byRole: Record<ContextRole, number>;
  total: number;
}

/** Default source -> role classification. `undefined` falls back to metadata. */
export const DEFAULT_ROLE_SOURCES: Record<string, ContextRole> = {
  governance: "authority",
  constitution: "authority",
  rl: "exemplar",
  ci: "constraint",
  crossdomain: "constraint",
  drift: "rubric",
};

/** v6.8.0: Role mapping override, e.g. { rl: "constraint" }. */
export type RoleOverrides = Record<string, ContextRole>;

/** Classify an injector source into a role; undeclared sources -> metadata (P5). */
export function classifyRole(source: string, overrides?: RoleOverrides): ContextRole {
  const fromOverrides = overrides?.[source];
  if (fromOverrides && fromOverrides in ROLE_PRIORITY) return fromOverrides;
  return DEFAULT_ROLE_SOURCES[source] ?? "metadata";
}

/** Wrap an injection block with its role hint (content never dropped). */
export function toRoleHint(source: string, block: string, overrides?: RoleOverrides, separator?: "\n" | "\n\n"): RoleHint {
  const role = classifyRole(source, overrides);
  return { role, priority: ROLE_PRIORITY[role], source, block, separator };
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "for", "to", "of", "in", "on", "with",
  "this", "that", "these", "those", "is", "are", "was", "were", "be", "been",
  "by", "as", "at", "from", "it", "its", "we", "you", "your", "our", "their",
  "i", "me", "my", "they", "them", "he", "she", "his", "her", "not", "no",
  "should", "must", "can", "will", "would", "could", "may", "might", "do", "does",
  "did", "has", "have", "had", "about", "into", "than", "then", "each", "which",
  "use", "used", "using",
  "when", "where", "who", "whom", "after", "before", "all", "any", "some", "more",
]);

/**
 * Extract topic keywords from an injection block for conflict detection.
 * Conservative by design: only overlapping keywords between different
 * priorities mark a conflict (ADR: 冲突保留双段先于抑制).
 */
export function extractTopics(text: string): string[] {
  const cleaned = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");
  const words = cleaned.split(/\s+/).filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  return [...new Set(words)];
}

/** Stable sort by priority ascending (P1 first). Same-priority keeps injection order. */
export function sortRoleHints(hints: RoleHint[]): RoleHint[] {
  return [...hints].sort((a, b) => a.priority - b.priority);
}

/**
 * Detect same-topic conflicts between segments of different priority.
 * Conservative: both segments are retained; only the report records which
 * higher-priority role wins the topic.
 */
export function detectRoleConflicts(hints: RoleHint[]): RoleConflictRecord[] {
  const conflicts: RoleConflictRecord[] = [];
  for (let i = 0; i < hints.length; i++) {
    for (let j = i + 1; j < hints.length; j++) {
      const a = hints[i];
      const b = hints[j];
      if (a.priority === b.priority) continue;
      const topicsA = extractTopics(a.block);
      if (topicsA.length === 0) continue;
      const topicsB = extractTopics(b.block);
      const overlap = topicsA.find((t) => topicsB.includes(t));
      if (overlap) {
        const [high, low] = a.priority < b.priority ? [a, b] : [b, a];
        conflicts.push({
          lowPrioritySource: low.source,
          highPrioritySource: high.source,
          topic: overlap,
          resolved: high.role,
        });
      }
    }
  }
  return conflicts;
}

/** Role distribution of the assembled segments (observational, non-blocking). */
export function roleBreakdownOf(hints: RoleHint[]): RoleBreakdown {
  const byRole = {
    authority: 0,
    exemplar: 0,
    constraint: 0,
    rubric: 0,
    metadata: 0,
  } as Record<ContextRole, number>;
  for (const h of hints) byRole[h.role] += 1;
  return { byRole, total: hints.length };
}

/**
 * v6.8.0: Assemble role hints for injection.
 * Orders by priority (P1 first), detects conflicts, and reports breakdown.
 * Overrides are applied at wrap time (toRoleHint), not here.
 */
export function resolveRoleAssembly(
  hints: RoleHint[],
): { ordered: RoleHint[]; conflicts: RoleConflictRecord[]; breakdown: RoleBreakdown } {
  const ordered = sortRoleHints(hints);
  return {
    ordered,
    conflicts: detectRoleConflicts(ordered),
    breakdown: roleBreakdownOf(ordered),
  };
}
