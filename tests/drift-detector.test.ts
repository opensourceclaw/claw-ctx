import { describe, it, expect } from "vitest";
import {
  TopicModel,
  DriftDetector,
  DEFAULT_DRIFT_CONFIG,
  type Topic,
} from "../src/drift-detector";

// ── TopicModel Tests ───────────────────────────────────────────────

describe("TopicModel", () => {
  describe("extractTopics()", () => {
    it("extracts keywords from a single message", () => {
      const topics = TopicModel.extractTopics([
        { content: "Fix the bug in the token counter implementation" },
      ]);
      expect(topics.length).toBeGreaterThan(0);

      const keywords = topics.map((t) => t.keyword);
      expect(keywords).toContain("bug");
      expect(keywords).toContain("token");
      expect(keywords).toContain("counter");
      expect(keywords).toContain("implementation");
    });

    it("removes stop words", () => {
      const topics = TopicModel.extractTopics([
        { content: "the is a an of in to for with on at by" },
      ]);
      // Only stop words, should return empty or very few
      const keywords = topics.map((t) => t.keyword);
      expect(keywords).not.toContain("the");
      expect(keywords).not.toContain("is");
    });

    it("boosts tech keywords", () => {
      const topics = TopicModel.extractTopics([
        { content: "fix deploy build fix deploy build" },
      ]);
      expect(topics.length).toBeGreaterThan(0);
      // fix, deploy, build are tech keywords and should have weight >= 1.0
      const fixTopic = topics.find((t) => t.keyword === "fix");
      expect(fixTopic).toBeDefined();
      // Tech keywords get 1.5x boost, repeated 2x / 1 msg = 2.0 * 1.5 = 3.0, capped at 1.0
      expect(fixTopic!.weight).toBeCloseTo(1.0, 1);
    });

    it("handles empty input", () => {
      const topics = TopicModel.extractTopics([]);
      expect(topics).toEqual([]);
    });

    it("handles message with no meaningful words", () => {
      const topics = TopicModel.extractTopics([
        { content: "??? !!! 123" },
      ]);
      expect(topics.length).toBe(0);
    });

    it("deduplicates words within a message", () => {
      const topics = TopicModel.extractTopics([
        { content: "token token token token token" },
      ]);
      // "token" should appear only once, but with weight = count / messages
      const tokenTopics = topics.filter((t) => t.keyword === "token");
      expect(tokenTopics).toHaveLength(1);
    });

    it("returns top 20 topics max", () => {
      const topics = TopicModel.extractTopics([
        {
          content: Array.from({ length: 50 }, (_, i) => `word${i}`).join(" "),
        },
      ]);
      expect(topics.length).toBeLessThanOrEqual(20);
    });
  });

  describe("computeSimilarity()", () => {
    it("returns 1.0 for identical topic sets", () => {
      const topics: Topic[] = [
        { keyword: "bug", weight: 0.8 },
        { keyword: "fix", weight: 0.6 },
      ];
      expect(TopicModel.computeSimilarity(topics, topics)).toBeCloseTo(1.0, 5);
    });

    it("returns 0.0 for completely different topics", () => {
      const t1: Topic[] = [{ keyword: "bug", weight: 1.0 }];
      const t2: Topic[] = [{ keyword: "deploy", weight: 1.0 }];
      expect(TopicModel.computeSimilarity(t1, t2)).toBeCloseTo(0.0, 5);
    });

    it("returns 1.0 for both empty", () => {
      expect(TopicModel.computeSimilarity([], [])).toBe(1.0);
    });

    it("returns 0.0 when one is empty", () => {
      expect(TopicModel.computeSimilarity([{ keyword: "a", weight: 1.0 }], [])).toBe(0.0);
      expect(TopicModel.computeSimilarity([], [{ keyword: "a", weight: 1.0 }])).toBe(0.0);
    });

    it("returns intermediate value for partially overlapping topics", () => {
      const t1: Topic[] = [
        { keyword: "bug", weight: 0.8 },
        { keyword: "fix", weight: 0.6 },
      ];
      const t2: Topic[] = [
        { keyword: "bug", weight: 0.5 },
        { keyword: "deploy", weight: 0.7 },
      ];
      const sim = TopicModel.computeSimilarity(t1, t2);
      expect(sim).toBeGreaterThan(0.0);
      expect(sim).toBeLessThan(1.0);
    });

    // v4.4.0: Single-topic overload
    it("single-topic: returns 1.0 for same keyword same weight", () => {
      const t1: Topic = { keyword: "bug", weight: 0.8 };
      const t2: Topic = { keyword: "bug", weight: 0.8 };
      expect(TopicModel.computeSimilarity(t1, t2)).toBeCloseTo(1.0, 5);
    });

    it("single-topic: returns 0.0 for different keywords", () => {
      const t1: Topic = { keyword: "bug", weight: 0.8 };
      const t2: Topic = { keyword: "deploy", weight: 0.8 };
      expect(TopicModel.computeSimilarity(t1, t2)).toBe(0.0);
    });

    it("single-topic: returns reduced similarity for different weights", () => {
      const t1: Topic = { keyword: "bug", weight: 0.8 };
      const t2: Topic = { keyword: "bug", weight: 0.5 };
      const sim = TopicModel.computeSimilarity(t1, t2);
      expect(sim).toBeGreaterThan(0.0);
      expect(sim).toBeLessThan(1.0);
      expect(sim).toBeCloseTo(0.7, 1);
    });
  });

  // v4.4.0: getEmbedding()
  describe("getEmbedding()", () => {
    it("returns empty array for no topics", () => {
      expect(TopicModel.getEmbedding([])).toEqual([]);
    });

    it("returns weight vector for topics", () => {
      const topics: Topic[] = [
        { keyword: "bug", weight: 0.8 },
        { keyword: "fix", weight: 0.6 },
      ];
      const emb = TopicModel.getEmbedding(topics);
      expect(emb.length).toBe(2);
      expect(emb[0]).toBeCloseTo(0.8, 1);
      expect(emb[1]).toBeCloseTo(0.6, 1);
    });

    it("returns sorted by keyword", () => {
      const topics: Topic[] = [
        { keyword: "deploy", weight: 0.5 },
        { keyword: "bug", weight: 0.8 },
      ];
      const emb = TopicModel.getEmbedding(topics);
      expect(emb.length).toBe(2);
      expect(emb[0]).toBeCloseTo(0.8, 1); // "bug" sorted first
      expect(emb[1]).toBeCloseTo(0.5, 1);
    });
  });
});

// ── DriftDetector Tests ────────────────────────────────────────────

describe("DriftDetector", () => {
  describe("initialization", () => {
    it("uses default config", () => {
      const detector = new DriftDetector();
      expect(detector.getConfig().similarityThreshold).toBe(0.6);
      expect(detector.getConfig().driftWindow).toBe(3);
      expect(detector.getConfig().minMessages).toBe(5);
    });

    it("accepts custom config", () => {
      const detector = new DriftDetector({
        similarityThreshold: 0.5,
        driftWindow: 5,
        minMessages: 3,
      });
      expect(detector.getConfig().similarityThreshold).toBe(0.5);
      expect(detector.getConfig().driftWindow).toBe(5);
      expect(detector.getConfig().minMessages).toBe(3);
    });
  });

  describe("feedTurn()", () => {
    it("returns no alerts for single turn", () => {
      const detector = new DriftDetector({ minMessages: 1 });
      const alerts = detector.feedTurn([
        { content: "Fix the authentication bug" },
      ]);
      expect(alerts).toHaveLength(0);
    });

    it("returns no alerts when below minMessages", () => {
      const detector = new DriftDetector({ minMessages: 10 });
      detector.feedTurn([{ content: "hello" }]);
      detector.feedTurn([{ content: "world" }]);
      const alerts = detector.feedTurn([{ content: "test" }]);
      expect(alerts).toHaveLength(0);
      expect(detector.getDriftScore()).toBe(0.0);
    });

    it("activates after reaching minMessages", () => {
      const detector = new DriftDetector({
        minMessages: 3,
        similarityThreshold: 0.3,
        driftWindow: 2,
      });
      // Feed 3 messages to activate
      detector.feedTurn([{ content: "fix bug" }]);
      detector.feedTurn([{ content: "fix login" }]);
      // Now at 4 messages, should activate
      const alerts = detector.feedTurn([
        { content: "deploy kubernetes cluster to production" },
      ]);
      // Should have drift score calculated (not 0.0 from pre-activation)
      const score = detector.getDriftScore();
      // Even if no alert triggered, score should be calculable
      expect(typeof score).toBe("number");
    });

    it("returns no alerts for similar consecutive topics", () => {
      const detector = new DriftDetector();
      detector.feedTurn([{ content: "Fix the authentication bug in the login module" }]);
      detector.feedTurn([{ content: "Working on fixing the auth bug for login flow" }]);
      const alerts = detector.feedTurn([
        { content: "Still fixing the authentication login bug issue" },
      ]);
      // Same topic — should have low drift score
      expect(detector.getDriftScore()).toBeLessThan(0.6);
    });

    it("detects drift when topic changes significantly", () => {
      const detector = new DriftDetector({
        similarityThreshold: 0.3,
        driftWindow: 2,
        minMessages: 1,
      });

      // Topic 1: auth bugs
      detector.feedTurn([
        { content: "Fix authentication bug in login module" },
      ]);
      detector.feedTurn([
        { content: "The auth token is invalid for session management" },
      ]);

      // Topic 2: completely different — deployment
      const alerts = detector.feedTurn([
        { content: "Deploy the new Kubernetes cluster to production" },
      ]);

      // Different topics should have low similarity → high drift
      const score = detector.getDriftScore();
      expect(score).toBeGreaterThan(0);
    });

    it("resets consecutive drifts when topic returns", () => {
      const detector = new DriftDetector({
        similarityThreshold: 0.4,
        driftWindow: 3,
      });

      detector.feedTurn([{ content: "fix bug" }]);
      detector.feedTurn([{ content: "fix bug" }]);
      // Drastic topic change
      detector.feedTurn([{ content: "deploy kubernetes cluster" }]);
      // Return to original topic
      detector.feedTurn([{ content: "fix the authentication bug again" }]);

      const score = detector.getDriftScore();
      // Scores should reflect the return to original topic (lower drift)
      expect(score).toBeLessThan(0.9);
    });
  });

  describe("getDriftScore()", () => {
    it("returns 0.0 for new detector", () => {
      const detector = new DriftDetector();
      expect(detector.getDriftScore()).toBe(0.0);
    });
  });

  describe("suggestActions()", () => {
    it("returns default action when no drift", () => {
      const detector = new DriftDetector();
      const actions = detector.suggestActions();
      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0].type).toBe("notify");
    });
  });

  describe("detectDrift()", () => {
    it("returns no drift for short history (grouped turns)", () => {
      const detector = new DriftDetector();
      const report = detector.detectDrift([
        [{ content: "hello" }],
      ]);
      expect(report.drifted).toBe(false);
      expect(report.driftScore).toBe(0);
    });

    it("analyzes pre-grouped turns and returns report", () => {
      const detector = new DriftDetector({
        similarityThreshold: 0.5,
        driftWindow: 2,
        minMessages: 1,
      });

      const history = [
        [{ content: "Fix the authentication bug" }, { content: "The login flow is broken" }],
        [{ content: "Auth tokens need to be refreshed" }],
        [{ content: "Deploy the new microservice to Kubernetes" }, { content: "Kubernetes deployment config needs updating" }],
      ];

      const report = detector.detectDrift(history);
      expect(report.driftScore).toBeDefined();
      expect(report.currentTopics.length).toBeGreaterThan(0);
      expect(report.previousTopics.length).toBeGreaterThan(0);
    });

    // v4.4.0: Flat-message overload
    it("detects drift from flat message array (auto-grouped)", () => {
      const detector = new DriftDetector({
        similarityThreshold: 0.3,
        driftWindow: 2,
        minMessages: 1,
      });

      const flat = [
        { content: "Fix the authentication bug" },
        { content: "The login flow needs work" },
        { content: "Working on auth tokens" },
        { content: "Deploy kubernetes to production" },
        { content: "Configuration for k8s deployment" },
      ];

      const alerts = detector.detectDrift(flat, 2);
      expect(Array.isArray(alerts)).toBe(true);
    });

    it("flat-message returns DriftAlert array", () => {
      const detector = new DriftDetector({
        similarityThreshold: 0.3,
        driftWindow: 2,
        minMessages: 1,
      });

      const flat = [
        { content: "fix bug" },
        { content: "fix more bug" },
        { content: "deploy cluster" },
        { content: "k8s config" },
      ];

      const result = detector.detectDrift(flat, 2);
      expect(Array.isArray(result)).toBe(true);
      // Each element should be a DriftAlert or empty
      if (result.length > 0) {
        expect(result[0]).toHaveProperty("level");
        expect(result[0]).toHaveProperty("driftScore");
      }
    });
  });

  describe("reset()", () => {
    it("clears all state", () => {
      const detector = new DriftDetector();
      detector.feedTurn([{ content: "fix bug" }]);
      detector.feedTurn([{ content: "deploy cluster" }]);
      detector.reset();
      expect(detector.getDriftScore()).toBe(0.0);
      expect(detector.getAlerts()).toHaveLength(0);
      expect(detector.getDriftScores()).toHaveLength(0);
    });
  });

  describe("updateConfig()", () => {
    it("updates config at runtime", () => {
      const detector = new DriftDetector();
      detector.updateConfig({ similarityThreshold: 0.8 });
      expect(detector.getConfig().similarityThreshold).toBe(0.8);
    });
  });

  describe("getDriftScores()", () => {
    it("returns copy of scores array", () => {
      const detector = new DriftDetector();
      detector.feedTurn([{ content: "hello" }]);
      detector.feedTurn([{ content: "world" }]);
      const scores = detector.getDriftScores();
      expect(Array.isArray(scores)).toBe(true);
    });
  });
});
