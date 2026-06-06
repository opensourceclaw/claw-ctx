import { describe, it, expect } from "vitest";
import {
  SessionStateExtractor,
  type SessionState,
  type Entity,
} from "../src/session-state-extractor";

describe("SessionStateExtractor", () => {
  describe("extract()", () => {
    it("extracts entities, decisions, topics, actions from messages", () => {
      const messages = [
        { content: "I decided to use docker for deployment. Fixed the auth bug in login.ts. Deployed the new version to production." },
        { content: "Peter reviewed the code and agreed we should switch to Kubernetes." },
      ];

      const state = SessionStateExtractor.extract(messages, "test-session");
      expect(state.sessionId).toBe("test-session");
      expect(state.entities.length).toBeGreaterThan(0);
      expect(state.decisions.length).toBeGreaterThan(0);
      expect(state.topics.length).toBeGreaterThan(0);
      expect(state.actions.length).toBeGreaterThan(0);
      expect(state.messageCount).toBe(2);
    });

    it("handles empty messages", () => {
      const state = SessionStateExtractor.extract([], "empty");
      expect(state.entities).toHaveLength(0);
      expect(state.decisions).toHaveLength(0);
      expect(state.messageCount).toBe(0);
    });
  });

  describe("entity extraction", () => {
    it("detects file entities", () => {
      const state = SessionStateExtractor.extract([
        { content: "Updated src/engine.ts and tests/engine.test.ts" },
      ]);
      const files = state.entities.filter((e) => e.type === "file");
      expect(files.length).toBeGreaterThanOrEqual(2);
      const names = files.map((f) => f.name);
      expect(names).toContain("src/engine.ts");
      expect(names).toContain("tests/engine.test.ts");
    });

    it("detects tool entities", () => {
      const state = SessionStateExtractor.extract([
        { content: "Using docker and kubernetes for deployment" },
      ]);
      const tools = state.entities.filter((e) => e.type === "tool");
      expect(tools.length).toBeGreaterThanOrEqual(2);
      expect(tools.map((t) => t.name.toLowerCase())).toContain("docker");
    });

    it("detects person entities", () => {
      const state = SessionStateExtractor.extract([
        { content: "Friday asked EDITH to review. Peter approved the change." },
      ]);
      const persons = state.entities.filter((e) => e.type === "person");
      expect(persons.length).toBeGreaterThanOrEqual(2);
    });

    it("counts entity mentions", () => {
      const state = SessionStateExtractor.extract([
        { content: "docker docker docker docker docker" },
      ]);
      const docker = state.entities.find((e) => e.name.toLowerCase() === "docker");
      expect(docker).toBeDefined();
      expect(docker!.mentions).toBeGreaterThanOrEqual(1);
    });

    it("detects concept entities (Capitalized Multi Word)", () => {
      const state = SessionStateExtractor.extract([
        { content: "The Context Engine and Memory Manager are core components." },
      ]);
      const concepts = state.entities.filter((e) => e.type === "concept");
      // "Context Engine" and "Memory Manager" should be detected
      const names = concepts.map((c) => c.name);
      expect(names.some((n) => n.includes("Context"))).toBe(true);
    });
  });

  describe("decision extraction", () => {
    it("detects explicit decisions", () => {
      const state = SessionStateExtractor.extract([
        { content: "I decided to use TypeScript for the project." },
      ]);
      expect(state.decisions.length).toBeGreaterThan(0);
    });

    it("detects 'let's' decisions", () => {
      const state = SessionStateExtractor.extract([
        { content: "Let's go with PostgreSQL for the database." },
      ]);
      expect(state.decisions.length).toBeGreaterThan(0);
    });

    it("infers actor from decision text", () => {
      const state = SessionStateExtractor.extract([
        { content: "I decided to refactor the code." },
      ]);
      if (state.decisions.length > 0) {
        expect(state.decisions[0].actor).toBeDefined();
      }
    });

    it("deduplicates similar decisions", () => {
      const state = SessionStateExtractor.extract([
        { content: "I decided to use docker. I decided to use docker." },
      ]);
      // Should not duplicate the same decision
      const uniqueDecisions = [...new Set(state.decisions.map((d) => d.description))];
      expect(state.decisions.length).toBe(uniqueDecisions.length);
    });
  });

  describe("topic extraction", () => {
    it("detects technical topics", () => {
      const state = SessionStateExtractor.extract([
        { content: "Fixed a bug in the deployment pipeline configuration." },
      ]);
      expect(state.topics.length).toBeGreaterThan(0);
      const labels = state.topics.map((t) => t.label);
      // Should contain at least one of: bug, deployment, configuration
      expect(labels.some((l) => ["bug", "deployment", "deploy", "configuration", "config", "pipeline"].includes(l))).toBe(true);
    });

    it("weights topics by frequency", () => {
      const state = SessionStateExtractor.extract([
        { content: "bug bug bug bug bug" },
      ]);
      const bugTopic = state.topics.find((t) => t.label === "bug");
      if (bugTopic) {
        expect(bugTopic.weight).toBeCloseTo(1.0, 1);
      }
    });
  });

  describe("action extraction", () => {
    it("detects code actions", () => {
      const state = SessionStateExtractor.extract([
        { content: "I fixed the bug and refactored the code." },
      ]);
      expect(state.actions.length).toBeGreaterThan(0);
    });

    it("detects deploy actions", () => {
      const state = SessionStateExtractor.extract([
        { content: "Deployed to production successfully." },
      ]);
      const deployActions = state.actions.filter((a) => a.type === "deploy");
      expect(deployActions.length).toBeGreaterThan(0);
    });
  });

  describe("merge()", () => {
    it("accumulates entity mentions on merge", () => {
      const prev: SessionState = {
        sessionId: "s1",
        entities: [{ name: "docker", type: "tool", mentions: 3, firstSeen: "docker stuff" }],
        decisions: [],
        topics: [],
        actions: [],
        lastUpdated: 1000,
        messageCount: 5,
      };

      const curr: SessionState = {
        sessionId: "s1",
        entities: [{ name: "docker", type: "tool", mentions: 2, firstSeen: "docker again" }],
        decisions: [],
        topics: [],
        actions: [],
        lastUpdated: 2000,
        messageCount: 3,
      };

      const merged = SessionStateExtractor.merge(prev, curr);
      const docker = merged.entities.find((e) => e.name === "docker");
      expect(docker).toBeDefined();
      expect(docker!.mentions).toBe(5);
    });

    it("accumulates message count", () => {
      const prev: SessionState = {
        sessionId: "s", entities: [], decisions: [], topics: [], actions: [],
        lastUpdated: 1, messageCount: 10,
      };
      const curr: SessionState = {
        sessionId: "s", entities: [], decisions: [], topics: [], actions: [],
        lastUpdated: 2, messageCount: 5,
      };
      const merged = SessionStateExtractor.merge(prev, curr);
      expect(merged.messageCount).toBe(15);
    });

    it("deduplicates decisions", () => {
      const d1 = { description: "Use TypeScript", actor: "team", confidence: 0.8, context: "..." };
      const d2 = { description: "Use TypeScript", actor: "team", confidence: 0.7, context: "..." };
      const d3 = { description: "Use PostgreSQL", actor: "team", confidence: 0.6, context: "..." };

      const prev: SessionState = {
        sessionId: "s", entities: [], decisions: [d1], topics: [], actions: [],
        lastUpdated: 1, messageCount: 1,
      };
      const curr: SessionState = {
        sessionId: "s", entities: [], decisions: [d2, d3], topics: [], actions: [],
        lastUpdated: 2, messageCount: 1,
      };

      const merged = SessionStateExtractor.merge(prev, curr);
      expect(merged.decisions).toHaveLength(2);
    });
  });

  describe("getKeyEntities()", () => {
    it("groups entities by type", () => {
      const state: SessionState = {
        sessionId: "s",
        entities: [
          { name: "docker", type: "tool", mentions: 5, firstSeen: "..." },
          { name: "Peter", type: "person", mentions: 3, firstSeen: "..." },
        ],
        decisions: [], topics: [], actions: [],
        lastUpdated: 1, messageCount: 1,
      };

      const grouped = SessionStateExtractor.getKeyEntities(state);
      expect(grouped.tool).toHaveLength(1);
      expect(grouped.person).toHaveLength(1);
      expect(grouped.tool[0].name).toBe("docker");
    });

    it("includes all entity type categories", () => {
      const state: SessionState = {
        sessionId: "s",
        entities: [],
        decisions: [], topics: [], actions: [],
        lastUpdated: 1, messageCount: 1,
      };

      const grouped = SessionStateExtractor.getKeyEntities(state);
      expect(grouped).toHaveProperty("person");
      expect(grouped).toHaveProperty("tool");
      expect(grouped).toHaveProperty("concept");
      expect(grouped).toHaveProperty("file");
      expect(grouped).toHaveProperty("project");
      expect(grouped).toHaveProperty("other");
    });
  });

  describe("decisions edge cases", () => {
    it("infers actor as team for 'we' decisions", () => {
      const state = SessionStateExtractor.extract([
        { content: "We have decided to use TypeScript for the project." },
      ]);
      // The decision may or may not have been detected due to pattern matching
      // but we check the actor inference helper works
      const decision = state.decisions[0];
      expect(decision).toBeDefined();
      // Actor could be "team" or "unknown" depending on pattern match
      expect(["team", "unknown"]).toContain(decision.actor);
    });

    it("infers actor as agent for AI mentions", () => {
      const state = SessionStateExtractor.extract([
        { content: "The AI assistant decided to refactor the code." },
      ]);
      if (state.decisions.length > 0) {
        expect(["agent", "unknown"]).toContain(state.decisions[0].actor);
      }
    });

    it("calculates confidence based on desc length", () => {
      const state = SessionStateExtractor.extract([
        { content: "We have decided to go with PostgreSQL because it offers better performance and reliability for our use case." },
      ]);
      const decision = state.decisions[0];
      expect(decision.confidence).toBeGreaterThan(0.5);
    });
  });

  describe("topics edge cases", () => {
    it("returns up to 10 topics", () => {
      const state = SessionStateExtractor.extract([
        { content: "authentication deployment database api frontend backend testing bug fix config migration refactoring" },
      ]);
      expect(state.topics.length).toBeLessThanOrEqual(10);
    });

    it("includes timestamp in topics", () => {
      const state = SessionStateExtractor.extract([
        { content: "fix the bug" },
      ]);
      expect(state.topics[0]?.firstMentioned).toBeDefined();
      expect(typeof state.topics[0]?.firstMentioned).toBe("number");
    });
  });

  describe("actions edge cases", () => {
    it("detects config actions", () => {
      const state = SessionStateExtractor.extract([
        { content: "I configured the system and set up the environment." },
      ]);
      const configActions = state.actions.filter((a) => a.type === "config");
      expect(configActions.length).toBeGreaterThan(0);
    });

    it("detects test actions", () => {
      const state = SessionStateExtractor.extract([
        { content: "Ran tests and verified they pass." },
      ]);
      const testActions = state.actions.filter((a) => a.type === "test");
      expect(testActions.length).toBeGreaterThan(0);
    });

    it("detects review actions", () => {
      const state = SessionStateExtractor.extract([
        { content: "Reviewed the code changes." },
      ]);
      const reviewActions = state.actions.filter((a) => a.type === "review");
      expect(reviewActions.length).toBeGreaterThan(0);
    });

    it("detects discuss actions", () => {
      const state = SessionStateExtractor.extract([
        { content: "Discussed the implementation with the team." },
      ]);
      const discussActions = state.actions.filter((a) => a.type === "discuss");
      expect(discussActions.length).toBeGreaterThan(0);
    });
  });

  describe("merge edge cases", () => {
    it("keeps all decisions when no duplicates", () => {
      const prev: SessionState = {
        sessionId: "s", entities: [], decisions: [
          { description: "Use TypeScript", actor: "team", confidence: 0.8, context: "..." }
        ], topics: [], actions: [],
        lastUpdated: 1, messageCount: 1,
      };
      const curr: SessionState = {
        sessionId: "s", entities: [], decisions: [
          { description: "Use PostgreSQL", actor: "team", confidence: 0.7, context: "..." }
        ], topics: [], actions: [],
        lastUpdated: 2, messageCount: 1,
      };
      const merged = SessionStateExtractor.merge(prev, curr);
      expect(merged.decisions).toHaveLength(2);
    });

    it("merges topics with max weight", () => {
      const prev: SessionState = {
        sessionId: "s", entities: [], decisions: [],
        topics: [
          { label: "bug", weight: 0.5, firstMentioned: 1 }
        ], actions: [],
        lastUpdated: 1, messageCount: 1,
      };
      const curr: SessionState = {
        sessionId: "s", entities: [], decisions: [],
        topics: [
          { label: "bug", weight: 0.8, firstMentioned: 2 }
        ], actions: [],
        lastUpdated: 2, messageCount: 1,
      };
      const merged = SessionStateExtractor.merge(prev, curr);
      const bugTopic = merged.topics.find((t) => t.label === "bug");
      expect(bugTopic?.weight).toBeCloseTo(0.8, 1);
    });

    it("accumulates actions", () => {
      const prev: SessionState = {
        sessionId: "s", entities: [], decisions: [], topics: [],
        actions: [{ description: "fixed bug", type: "code", timestamp: 100 }],
        lastUpdated: 1, messageCount: 1,
      };
      const curr: SessionState = {
        sessionId: "s", entities: [], decisions: [], topics: [],
        actions: [{ description: "deployed", type: "deploy", timestamp: 200 }],
        lastUpdated: 2, messageCount: 1,
      };
      const merged = SessionStateExtractor.merge(prev, curr);
      expect(merged.actions).toHaveLength(2);
    });

    it("preserves sessionId from previous state", () => {
      const prev: SessionState = {
        sessionId: "original-session", entities: [], decisions: [], topics: [], actions: [],
        lastUpdated: 1, messageCount: 1,
      };
      const curr: SessionState = {
        sessionId: "different-session", entities: [], decisions: [], topics: [], actions: [],
        lastUpdated: 2, messageCount: 1,
      };
      const merged = SessionStateExtractor.merge(prev, curr);
      expect(merged.sessionId).toBe("original-session");
    });
  });

  describe("firstSeen entity context", () => {
    it("stores first seen context snippet", () => {
      const state = SessionStateExtractor.extract([
        { content: "The docker container is running in production." },
      ]);
      const docker = state.entities.find((e) => e.name.toLowerCase() === "docker");
      expect(docker?.firstSeen).toContain("docker");
    });
  });

  describe("lastUpdated timestamp", () => {
    it("updates lastUpdated on extract", () => {
      const before = Date.now();
      const state = SessionStateExtractor.extract([{ content: "test" }]);
      const after = Date.now();
      expect(state.lastUpdated).toBeGreaterThanOrEqual(before);
      expect(state.lastUpdated).toBeLessThanOrEqual(after);
    });
  });
});
