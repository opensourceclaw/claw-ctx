// claw-ctx v6.8.0 — context-role unit tests (T1)
//
// Role classification, topic extraction, priority ordering, conflict detection.
// Licensed under the Apache License, Version 2.0

import { describe, expect, it } from "vitest";
import {
  classifyRole,
  toRoleHint,
  extractTopics,
  sortRoleHints,
  detectRoleConflicts,
  roleBreakdownOf,
  resolveRoleAssembly,
  ROLE_PRIORITY,
} from "../src/context-role";

describe("classifyRole (v6.8.0)", () => {
  it("maps default sources to roles", () => {
    expect(classifyRole("governance")).toBe("authority");
    expect(classifyRole("constitution")).toBe("authority");
    expect(classifyRole("rl")).toBe("exemplar");
    expect(classifyRole("ci")).toBe("constraint");
    expect(classifyRole("crossdomain")).toBe("constraint");
    expect(classifyRole("drift")).toBe("rubric");
  });

  it("undeclared sources fall back to metadata (content never lost)", () => {
    expect(classifyRole("session-resume")).toBe("metadata");
    expect(classifyRole("prompt-strategy")).toBe("metadata");
    expect(classifyRole("unknown-thing")).toBe("metadata");
  });

  it("roleOverrides take precedence over defaults", () => {
    expect(classifyRole("rl", { rl: "constraint" })).toBe("constraint");
    expect(classifyRole("governance", { governance: "rubric" })).toBe("rubric");
    expect(classifyRole("ci", { ci: "metadata" })).toBe("metadata");
  });

  it("invalid override value falls back to default mapping", () => {
    // invalid role in overrides is ignored
    expect(classifyRole("rl", { rl: "not-a-role" as any })).toBe("exemplar");
  });

  it("priorities follow authority > exemplar > constraint > rubric > metadata", () => {
    expect(ROLE_PRIORITY.authority).toBeLessThan(ROLE_PRIORITY.exemplar);
    expect(ROLE_PRIORITY.exemplar).toBeLessThan(ROLE_PRIORITY.constraint);
    expect(ROLE_PRIORITY.constraint).toBeLessThan(ROLE_PRIORITY.rubric);
    expect(ROLE_PRIORITY.rubric).toBeLessThan(ROLE_PRIORITY.metadata);
  });
});

describe("toRoleHint (v6.8.0)", () => {
  it("wraps block with role and priority", () => {
    const hint = toRoleHint("governance", "[Governance] conservative threshold: 0.5");
    expect(hint).toEqual({
      role: "authority",
      priority: 1,
      source: "governance",
      block: "[Governance] conservative threshold: 0.5",
    });
  });

  it("wraps undeclared sources as metadata P5", () => {
    const hint = toRoleHint("session-resume", "resume block");
    expect(hint.role).toBe("metadata");
    expect(hint.priority).toBe(5);
  });
});

describe("extractTopics (v6.8.0)", () => {
  it("extracts meaningful keywords, drops stopwords and punctuation", () => {
    const topics = extractTopics("Deploy strategy must use conservative threshold for pricing");
    expect(topics).toContain("deploy");
    expect(topics).toContain("strategy");
    expect(topics).toContain("conservative");
    expect(topics).toContain("threshold");
    expect(topics).toContain("pricing");
    expect(topics).not.toContain("must");
    expect(topics).not.toContain("use");
  });

  it("deduplicates topics", () => {
    const topics = extractTopics("pricing policy pricing policy");
    expect(topics.filter((t) => t === "pricing")).toHaveLength(1);
  });

  it("single-char words are dropped", () => {
    const topics = extractTopics("a b c pricing");
    expect(topics).toEqual(["pricing"]);
  });

  it("empty input yields empty topics", () => {
    expect(extractTopics("")).toEqual([]);
  });
});

describe("sortRoleHints (v6.8.0)", () => {
  it("orders by priority descending (P1 first), stable within same priority", () => {
    const hints = [
      toRoleHint("ci", "ci block"),
      toRoleHint("governance", "gov block"),
      toRoleHint("drift", "drift block"),
      toRoleHint("rl", "rl block"),
      toRoleHint("session", "meta block"),
    ];
    const ordered = sortRoleHints(hints);
    expect(ordered.map((h) => h.priority)).toEqual([1, 2, 3, 4, 5]);
    expect(ordered.map((h) => h.source)).toEqual([
      "governance", "rl", "ci", "drift", "session",
    ]);
  });

  it("same-priority segments keep injection order", () => {
    const hints = [
      toRoleHint("ci", "ci-1"),
      toRoleHint("crossdomain", "cd-1"),
    ];
    const ordered = sortRoleHints(hints);
    expect(ordered.map((h) => h.source)).toEqual(["ci", "crossdomain"]);
  });
});

describe("detectRoleConflicts (v6.8.0)", () => {
  it("marks same-topic segments of different priority", () => {
    const hints = [
      toRoleHint("rl", "Aggressive strategy for pricing deployment"),
      toRoleHint("governance", "Conservative strategy for pricing deployment required"),
    ];
    const conflicts = detectRoleConflicts(hints);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      lowPrioritySource: "rl",
      highPrioritySource: "governance",
      resolved: "authority",
    });
    expect(conflicts[0].topic).toBe("strategy");
  });

  it("same-priority segments never conflict", () => {
    const hints = [
      toRoleHint("ci", "no test skip"),
      toRoleHint("crossdomain", "no test skip"),
    ];
    expect(detectRoleConflicts(hints)).toHaveLength(0);
  });

  it("different-topic segments never conflict", () => {
    const hints = [
      toRoleHint("rl", "aggressive pricing strategy"),
      toRoleHint("governance", "conservative deployment window"),
    ];
    expect(detectRoleConflicts(hints)).toHaveLength(0);
  });
});

describe("resolveRoleAssembly (v6.8.0)", () => {
  it("orders, detects conflicts, and reports breakdown", () => {
    const hints = [
      toRoleHint("rl", "Aggressive strategy for pricing"),
      toRoleHint("governance", "Conservative strategy for pricing"),
      toRoleHint("drift", "Quality gate: coverage above 80%"),
      toRoleHint("session", "Resume note"),
    ];
    const { ordered, conflicts, breakdown } = resolveRoleAssembly(hints);
    expect(ordered.map((h) => h.source)).toEqual(["governance", "rl", "drift", "session"]);
    expect(conflicts).toHaveLength(1);
    expect(breakdown.total).toBe(4);
    expect(breakdown.byRole.authority).toBe(1);
    expect(breakdown.byRole.exemplar).toBe(1);
    expect(breakdown.byRole.rubric).toBe(1);
    expect(breakdown.byRole.metadata).toBe(1);
  });
});
