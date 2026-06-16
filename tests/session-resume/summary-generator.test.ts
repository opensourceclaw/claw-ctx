import { describe, it, expect } from "vitest";
import { SummaryGenerator } from "../../src/session-resume/summary-generator.js";
import type { SessionState } from "../../src/session-state-extractor.js";

describe("SummaryGenerator", () => {
  const generator = new SummaryGenerator();
  const sid = "test-session-1";

  it("extracts theme from keywords", () => {
    const msgs = [
      { role: "user", content: "We need to deploy the kubernetes cluster with helm charts" },
      { role: "assistant", content: "The deploy process for kubernetes involves configuring helm and setting up the cluster" },
      { role: "user", content: "What about monitoring the kubernetes deployment?" },
    ];
    const summary = generator.generate(msgs, sid);
    expect(summary.theme).toContain("deploy");
    expect(summary.theme).toContain("kubernetes");
    expect(summary.sessionId).toBe(sid);
    expect(summary.messageCount).toBe(3);
    expect(summary.timestamp).toBeGreaterThan(0);
  });

  it("extracts pending tasks from todo patterns", () => {
    const msgs = [
      { role: "user", content: "TODO: fix the login bug in the auth module. It's causing 500 errors." },
    ];
    const summary = generator.generate(msgs, sid);
    expect(summary.pendingTasks.length).toBeGreaterThan(0);
    expect(summary.pendingTasks[0].toLowerCase()).toContain("login bug");
  });

  it("extracts pending tasks from need-to patterns", () => {
    const msgs = [
      { role: "user", content: "We need to update the database config before the next release." },
    ];
    const summary = generator.generate(msgs, sid);
    expect(summary.pendingTasks.length).toBeGreaterThan(0);
    expect(summary.pendingTasks[0].toLowerCase()).toContain("database config");
  });

  it("extracts key points from decided patterns", () => {
    const msgs = [
      { role: "assistant", content: "We decided to use Redis for caching. This will improve performance." },
    ];
    const summary = generator.generate(msgs, sid);
    expect(summary.keyPoints.length).toBeGreaterThan(0);
    expect(summary.keyPoints[0].toLowerCase()).toContain("redis");
  });

  it("extracts key points from important patterns", () => {
    const msgs = [
      { role: "assistant", content: "Important: the API contract changed for the v2 endpoint." },
    ];
    const summary = generator.generate(msgs, sid);
    expect(summary.keyPoints.length).toBeGreaterThan(0);
    expect(summary.keyPoints[0].toLowerCase()).toContain("api contract");
  });

  it("augments with SessionState decisions", () => {
    const msgs = [{ role: "user", content: "Let's fix the login flow" }];
    const state: SessionState = {
      sessionId: sid,
      entities: [],
      decisions: [
        { description: "Use JWT tokens for authentication", actor: "team", confidence: 0.8, context: "" },
      ],
      topics: [{ label: "auth", weight: 0.9, firstMentioned: 100 }],
      actions: [],
      lastUpdated: Date.now(),
      messageCount: 1,
    };
    const summary = generator.generate(msgs, sid, state);
    expect(summary.theme).toContain("auth");
    expect(summary.keyPoints.some((p) => p.toLowerCase().includes("jwt"))).toBe(true);
  });

  it("generates fallback theme for empty messages", () => {
    const summary = generator.generate([], sid);
    expect(summary.theme).toBe("General discussion");
    expect(summary.pendingTasks).toEqual([]);
    expect(summary.keyPoints).toEqual([]);
    expect(summary.entities).toEqual([]);
    expect(summary.messageCount).toBe(0);
  });

  it("deduplicates identical tasks", () => {
    // Two identical task mentions in the same sentence should dedup
    const msgs = [
      { role: "user", content: "TODO: fix login bug in auth module" },
      { role: "user", content: "TODO: fix login bug in auth module" },
    ];
    const summary = generator.generate(msgs, sid);
    const loginTasks = summary.pendingTasks.filter((t) =>
      t.toLowerCase().includes("login bug"),
    );
    expect(loginTasks.length).toBeLessThanOrEqual(1);
  });

  it("generateFromState produces valid summary", () => {
    const state: SessionState = {
      sessionId: sid,
      entities: [
        { name: "Redis", type: "tool", mentions: 5, firstSeen: "Redis cache" },
        { name: "Docker", type: "tool", mentions: 3, firstSeen: "Docker compose" },
      ],
      decisions: [
        { description: "Decided to use Redis for caching", actor: "team", confidence: 0.9, context: "" },
        { description: "Need to update Docker config", actor: "user", confidence: 0.7, context: "" },
      ],
      topics: [
        { label: "caching", weight: 0.9, firstMentioned: 100 },
        { label: "deployment", weight: 0.5, firstMentioned: 200 },
      ],
      actions: [],
      lastUpdated: Date.now(),
      messageCount: 5,
    };
    const msgs = [
      { role: "user", content: "TODO: update Docker compose file" },
    ];
    const summary = generator.generateFromState(state, msgs);
    expect(summary.theme).toContain("caching");
    expect(summary.pendingTasks.length).toBeGreaterThan(0);
    expect(summary.entities).toContain("Redis");
    expect(summary.entities).toContain("Docker");
    expect(summary.sessionId).toBe(sid);
    expect(summary.messageCount).toBe(5);
  });

  // ── CJK tests ──────────────────────────────────────────────────

  it("extracts CJK theme from Chinese messages", () => {
    const msgs = [
      { role: "user", content: "修复登录模块的安全漏洞" },
      { role: "assistant", content: "登录模块的安全漏洞需要优先处理" },
    ];
    const summary = generator.generate(msgs, sid);
    expect(summary.theme).not.toBe("General discussion");
    expect(summary.theme.length).toBeGreaterThan(0);
  });

  it("extracts CJK pending tasks from Chinese messages", () => {
    const msgs = [
      { role: "user", content: "需要更新 JWT 密钥。还要修复 CSRF 漏洞。" },
    ];
    const summary = generator.generate(msgs, sid);
    expect(summary.pendingTasks.length).toBeGreaterThan(0);
  });

  it("extracts CJK key points from Chinese messages", () => {
    const msgs = [
      { role: "assistant", content: "决定采用 Redis 作为缓存方案。确认使用 JWT 认证。" },
    ];
    const summary = generator.generate(msgs, sid);
    expect(summary.keyPoints.length).toBeGreaterThan(0);
  });

  it("handles mixed CJK and English messages", () => {
    const msgs = [
      { role: "user", content: "需要 deploy 新的 kubernetes cluster" },
      { role: "assistant", content: "确认使用 helm charts 部署到生产环境" },
    ];
    const summary = generator.generate(msgs, sid);
    expect(summary.pendingTasks.length).toBeGreaterThan(0);
  });

  it("respects maxKeywords config", () => {
    const gen = new SummaryGenerator({ maxKeywords: 1 });
    const msgs = [
      { role: "user", content: "deploy kubernetes cluster and configure monitoring for kubernetes" },
      { role: "assistant", content: "the deploy process involves helm charts for kubernetes" },
    ];
    const summary = gen.generate(msgs, sid);
    const keywordCount = summary.theme.split(", ").length;
    expect(keywordCount).toBeLessThanOrEqual(2); // 1 keyword + possible topic
  });

  it("generates entities from SessionState", () => {
    const msgs = [{ role: "user", content: "Work on Redis config" }];
    const state: SessionState = {
      sessionId: sid,
      entities: [
        { name: "Redis", type: "tool", mentions: 10, firstSeen: "Redis" },
        { name: "PostgreSQL", type: "tool", mentions: 5, firstSeen: "PostgreSQL" },
      ],
      decisions: [],
      topics: [],
      actions: [],
      lastUpdated: Date.now(),
      messageCount: 1,
    };
    const summary = generator.generate(msgs, sid, state);
    expect(summary.entities).toContain("Redis");
    expect(summary.entities).toContain("PostgreSQL");
  });
});
