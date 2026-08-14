/**
 * claw-ctx v6.4.0 — OpenClaw Plugin Entry Point
 *
 * @deprecated v6.5.1: orphaned half-baked entry — NOT part of the build, NOT git-tracked,
 * and uses the wrong registration paradigm (api.registerPlugin is a fabricated old API).
 * Tool registration now lives in src/index.ts register(api) via api.registerTool,
 * wired to the real ContextCapability API. Kept only as an audit trail for the
 * v6.4.0 acceptance records that reference it. Do NOT import from this file.
 */

import { ContextCapability } from "../src/capability/index.js";

// Plugin registration
export function register(api: any): void {
  api.registerPlugin({
    id: "claw-ctx",
    version: "6.4.0",
    kind: "context",
  });

  const capability = new ContextCapability();

  // Tool 1: ctx_compact
  api.registerTool(() => ({
    name: "ctx_compact",
    description: "Manually trigger context compaction for a session",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Target session ID" },
        strategy: { type: "string", enum: ["aggressive", "balanced", "conservative"], description: "Compaction strategy" },
        threshold: { type: "number", description: "Token threshold" },
        force: { type: "boolean", description: "Force compaction" },
      },
      required: ["sessionId"],
    },
    execute: async (_toolCallId: string, params: any) => {
      const result = await capability.compact({
        sessionId: params.sessionId,
        strategy: params.strategy ?? "balanced",
        targetBudget: params.threshold,
        force: params.force ?? false,
      });
      return result;
    },
  }), { names: ["ctx_compact"] });

  // Tool 2: ctx_build
  api.registerTool(() => ({
    name: "ctx_build",
    description: "Assemble context according to configuration",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Target session ID" },
        sources: { type: "array", items: { type: "string" }, description: "Reserved: source selection" },
        filters: { type: "object", description: "Reserved: filter configuration" },
        budget: { type: "number", description: "Token budget" },
        model: { type: "string", description: "Target model" },
      },
      required: ["sessionId"],
    },
    execute: async (_toolCallId: string, params: any) => {
      const result = await capability.assemble({
        sessionId: params.sessionId,
        tokenBudget: params.budget,
        model: params.model,
      });
      return {
        estimatedTokens: result.estimatedTokens,
        messageCount: result.messages.length,
        confidenceReport: result.confidenceReport,
        autoCompact: result.autoCompact,
      };
    },
  }), { names: ["ctx_build"] });

  // Tool 3: ctx_inject
  api.registerTool(() => ({
    name: "ctx_inject",
    description: "Inject content into a target session context",
    parameters: {
      type: "object",
      properties: {
        targetSessionId: { type: "string", description: "Target session ID" },
        content: { type: "string", description: "Content to inject" },
        position: { type: "string", enum: ["prepend", "append", "replace"], description: "Injection position" },
      },
      required: ["targetSessionId", "content"],
    },
    execute: async (_toolCallId: string, params: any) => {
      const result = await capability.inject({
        targetSessionId: params.targetSessionId,
        content: params.content,
        position: params.position ?? "append",
      });
      return result;
    },
  }), { names: ["ctx_inject"] });
}

export async function activate(context: any): Promise<void> {
  // ContextEngine handles its own activation
}
