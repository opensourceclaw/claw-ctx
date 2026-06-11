// claw-ctx v4.20.0 — RelevanceScorer tests
import { describe, it, expect } from "vitest";
import { RelevanceScorer } from "../src/relevance-scorer.js";

describe("RelevanceScorer", () => {
  it("score returns high value for highly relevant memory", () => {
    const scorer = new RelevanceScorer();
    const ctx = RelevanceScorer.buildContext(
      ["login", "auth"],
      ["bug", "frontend"],
      ["Login page crash", "Auth module broken"],
    );
    const result = scorer.score(
      { id: "1", content: "Login page crash in auth module", tags: ["bug", "login", "auth"], confidence: 1.0 },
      ctx,
    );
    expect(result.score).toBeGreaterThan(0.5);
  });

  it("score returns low value for irrelevant memory", () => {
    const scorer = new RelevanceScorer();
    const ctx = RelevanceScorer.buildContext(
      ["login", "auth"],
      ["bug"],
      ["Login page crash"],
    );
    const result = scorer.score(
      { id: "2", content: "Deploy pipeline config", tags: ["deploy", "ci"], confidence: 1.0 },
      ctx,
    );
    expect(result.score).toBeLessThan(0.3);
  });

  it("score breakdown sums correctly to score", () => {
    const scorer = new RelevanceScorer();
    const ctx = RelevanceScorer.buildContext(["entity1"], ["topic1"], ["message1"]);
    const result = scorer.score(
      { id: "3", content: "entity1 with topic1 info", tags: ["topic1"], confidence: 0.8 },
      ctx,
    );
    const computed =
      0.4 * result.breakdown.entityOverlap +
      0.35 * result.breakdown.topicSimilarity +
      0.15 * result.breakdown.recency +
      0.1 * result.breakdown.confidence;
    expect(Math.abs(result.score - computed)).toBeLessThan(0.01);
  });

  it("rank filters below minRelevance", () => {
    const scorer = new RelevanceScorer();
    const ctx = RelevanceScorer.buildContext(["x"], ["y"], ["z"]);
    const mems = [
      { id: "a", content: "x y z relevant", tags: ["x"], confidence: 1.0 },
      { id: "b", content: "unrelated content here", tags: ["other"], confidence: 1.0 },
    ];
    const ranked = scorer.rank(mems, ctx, 0.3);
    expect(ranked.length).toBe(1);
    expect(ranked[0].id).toBe("a");
  });

  it("rank returns sorted by score descending", () => {
    const scorer = new RelevanceScorer();
    const ctx = RelevanceScorer.buildContext(["shared"], ["shared"], ["shared"]);
    const mems = [
      { id: "low", content: "shared", tags: [], confidence: 0.3 },
      { id: "high", content: "shared with full match", tags: ["shared"], confidence: 1.0 },
    ];
    const ranked = scorer.rank(mems, ctx, 0);
    expect(ranked.length).toBe(2);
    expect(ranked[0].id).toBe("high");
    expect(ranked[1].id).toBe("low");
  });

  it("recency decays over time", () => {
    const scorer = new RelevanceScorer(60000); // 1-minute half-life
    const ctx = RelevanceScorer.buildContext(["e"], ["t"], []);
    const recent = scorer.score(
      { id: "r", content: "e t", timestamp: Date.now() / 1000, confidence: 1.0 },
      ctx,
    );
    const old = scorer.score(
      { id: "o", content: "e t", timestamp: Date.now() / 1000 - 120, confidence: 1.0 },
      ctx,
    );
    expect(recent.breakdown.recency).toBeGreaterThan(old.breakdown.recency);
  });

  it("buildContext creates valid context from inputs", () => {
    const ctx = RelevanceScorer.buildContext(
      ["entity1", "entity2"],
      ["topic1"],
      ["message about entity1", "another message"],
    );
    expect(ctx.entities).toEqual(["entity1", "entity2"]);
    expect(ctx.topics).toEqual(["topic1"]);
    expect(ctx.recentTerms.size).toBeGreaterThan(0);
  });

  it("buildContext with empty messages still creates valid context", () => {
    const ctx = RelevanceScorer.buildContext(["e"], ["t"], []);
    expect(ctx.entities).toEqual(["e"]);
    expect(ctx.topics).toEqual(["t"]);
    expect(ctx.recentTerms.size).toBe(0);
  });
});
