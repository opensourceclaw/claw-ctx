/**
 * claw-ctx v1.0.0 — Context Engine
 *
 * Standalone Context Engine plugin. Uses claw-mem MemoryManager for storage/retrieval.
 */
import { type MemoryManager } from "../../claw-mem/claw_mem_plugin/dist/src/memory_manager";
interface ClawCtxConfig {
    workspaceDir?: string;
    topK?: number;
    debug?: boolean;
}
interface ClawCtxLogger {
    info: (...a: any[]) => void;
    error: (...a: any[]) => void;
    warn: (...a: any[]) => void;
    debug?: (...a: any[]) => void;
}
export declare class ClawContextEngine {
    readonly info: {
        id: string;
        name: string;
        version: string;
        ownsCompaction: boolean;
        turnMaintenanceMode: "foreground";
        hostRequirements: {};
    };
    private manager;
    private config;
    private logger;
    private sid;
    private cache;
    constructor(config: ClawCtxConfig, logger: ClawCtxLogger, manager?: MemoryManager);
    private _session;
    bootstrap(p: {
        sessionId: string;
        sessionKey?: string;
        sessionFile: string;
    }): Promise<{
        bootstrapped: boolean;
        importedMessages?: number;
        reason?: string;
    }>;
    ingest(p: {
        sessionId: string;
        sessionKey?: string;
        message: any;
        isHeartbeat?: boolean;
    }): Promise<{
        ingested: boolean;
    }>;
    ingestBatch(p: {
        sessionId: string;
        sessionKey?: string;
        messages: any[];
        isHeartbeat?: boolean;
    }): Promise<{
        ingestedCount: number;
    }>;
    assemble(p: {
        sessionId: string;
        sessionKey?: string;
        messages: any[];
        tokenBudget?: number;
        availableTools?: Set<string>;
        citationsMode?: string;
        model?: string;
        prompt?: string;
    }): Promise<{
        messages: any[];
        estimatedTokens: number;
        systemPromptAddition?: string;
        promptAuthority?: string;
    }>;
    compact(p: {
        sessionId: string;
        sessionKey?: string;
        sessionFile: string;
        tokenBudget?: number;
        force?: boolean;
        currentTokenCount?: number;
        compactionTarget?: string;
        customInstructions?: string;
        abortSignal?: AbortSignal;
    }): Promise<{
        ok: boolean;
        compacted: boolean;
        reason?: string;
        result?: {
            summary?: string;
            tokensBefore: number;
            tokensAfter?: number;
            details?: unknown;
        };
    }>;
    maintain(p: {
        sessionId: string;
        sessionKey?: string;
        sessionFile: string;
        runtimeContext?: Record<string, unknown>;
    }): Promise<{
        changed: boolean;
        bytesFreed: number;
        rewrittenEntries: number;
    }>;
    afterTurn(p: {
        sessionId: string;
        sessionKey?: string;
        sessionFile: string;
        messages: any[];
        prePromptMessageCount: number;
        autoCompactionSummary?: string;
        isHeartbeat?: boolean;
        tokenBudget?: number;
    }): Promise<void>;
    prepareSubagentSpawn(p: {
        parentSessionKey: string;
        childSessionKey: string;
        contextMode?: "isolated" | "fork";
        parentSessionId?: string;
        parentSessionFile?: string;
        childSessionId?: string;
        childSessionFile?: string;
        ttlMs?: number;
    }): Promise<{
        rollback: () => void;
    } | undefined>;
    onSubagentEnded(p: {
        childSessionKey: string;
        reason: "deleted" | "completed" | "swept" | "released";
    }): Promise<void>;
    dispose(): Promise<void>;
}
export declare function createClawContextEngine(config: ClawCtxConfig, logger: ClawCtxLogger, manager?: MemoryManager): ClawContextEngine;
export {};
