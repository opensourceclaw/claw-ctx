/**
 * claw-ctx v6.5.x — pi agent Runtime Plugin Entry
 *
 * Wraps the 3 context tools as pi agent AgentTool definitions.
 * Executes via ContextCapability (src source), the same business path
 * the OpenClaw plugin uses (src/index.ts register).
 */

import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { ContextCapability } from "../src/capability/context-capability";

const capability = new ContextCapability();

// ── Run helper ───────────────────────────────────────────────────────────
async function run<T>(fn: () => Promise<T>): Promise<AgentToolResult<T>> {
  try {
    const result = await fn();
    return { content: [{ type: "text", text: JSON.stringify(result ?? {}) }], details: {} as T };
  } catch (e) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: String(e) }) }],
      details: {} as T,
    };
  }
}

// ── Tool definitions ─────────────────────────────────────────────────────

export const ctxTools: AgentTool[] = [
  {
    name: "ctx_compact",
    label: "Compact Context",
    description: "Manually trigger context compaction for a session",
    parameters: Type.Object({
      sessionId: Type.String({ description: "Target session ID" }),
      strategy: Type.Optional(
        Type.Union([
          Type.Literal("aggressive"),
          Type.Literal("balanced"),
          Type.Literal("conservative"),
        ], { description: "Compaction strategy" }),
      ),
      threshold: Type.Optional(Type.Number({ description: "Target token budget" })),
      force: Type.Optional(Type.Boolean({ description: "Force compaction" })),
    }),
    execute: async (id, params) =>
      run(() => {
        const p = params as {
          sessionId: string;
          strategy?: string;
          threshold?: number;
          force?: boolean;
        };
        return capability.compact({
          sessionId: p.sessionId,
          strategy: p.strategy ?? "balanced",
          targetBudget: p.threshold,
          force: p.force ?? false,
        } as never);
      }),
  },
  {
    name: "ctx_build",
    label: "Build Context",
    description: "Assemble context according to configuration",
    parameters: Type.Object({
      sessionId: Type.String({ description: "Target session ID" }),
      budget: Type.Optional(Type.Number({ description: "Token budget" })),
      model: Type.Optional(Type.String({ description: "Target model" })),
    }),
    execute: async (id, params) =>
      run(() => {
        const p = params as { sessionId: string; budget?: number; model?: string };
        return capability.assemble(p as never);
      }),
  },
  {
    name: "ctx_inject",
    label: "Inject Context",
    description: "Inject content into a target session context",
    parameters: Type.Object({
      targetSessionId: Type.String({ description: "Target session ID" }),
      content: Type.String({ description: "Content to inject" }),
      position: Type.Optional(
        Type.Union([
          Type.Literal("prepend"),
          Type.Literal("append"),
          Type.Literal("replace"),
        ], { description: "Injection position" }),
      ),
    }),
    execute: async (id, params) =>
      run(() => {
        const p = params as { targetSessionId: string; content: string; position?: string };
        return capability.inject(p as never);
      }),
  },
];

export default ctxTools;
