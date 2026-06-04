/**
 * claw-ctx v3.0.0 — Context Engine
 *
 * Standalone Context Engine plugin. Uses claw-mem MemoryManager for storage/retrieval.
 * v2.0.0 adds: C2 confidence gating, RL experience injection, governance signal pass-through.
 * v3.0.0 adds: cross-domain signal injection, token budget management.
 */
import { type MemoryManager } from "../../../claw-mem/claw_mem_plugin/dist/src/memory_manager";
import { ConfidenceGate, type ConfidenceMode, type ConfidenceReport } from "./confidence_gate";
import { type RLExperience, type RLProvider } from "./rl_injector";
import { type GovernanceSignal, type GovernanceProvider, type GovernanceLayer } from "./governance_injector";
import { type InjectedSignal, type CrossDomainProvider } from "./cross_domain_injector";
import { TokenBudgetManager } from "./token_budget_manager";
import { type CISignal, type CIProvider } from "./ci_injector";
interface ClawCtxConfig {
    workspaceDir?: string;
    topK?: number;
    debug?: boolean;
    compactThreshold?: number;
    reserveRatio?: number;
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
    private confidenceGate;
    private rlInjector;
    private governanceInjector;
    private crossDomainInjector;
    private ciInjector;
    private budgetManager;
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
        confidenceThreshold?: number;
        confidenceMode?: ConfidenceMode;
        crossDomain?: {
            enabled: boolean;
            currentPillar?: string;
            currentIntent?: string;
            timeRange?: string;
            maxSignals?: number;
        };
        ci?: {
            enabled: boolean;
            project?: string;
            includeBuildStatus?: boolean;
            includeTestResults?: boolean;
            includeDeployStatus?: boolean;
            maxSignals?: number;
        };
    }): Promise<{
        messages: any[];
        estimatedTokens: number;
        systemPromptAddition?: string;
        promptAuthority?: string;
        confidenceReport?: ConfidenceReport;
        crossDomainReport?: {
            signalsInjected: number;
            totalTokens: number;
            correlations: InjectedSignal[];
        };
        ciReport?: {
            signalsInjected: number;
            totalTokens: number;
            signals: CISignal[];
        };
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
        reserveForCrossDomain?: number;
        reserveForCI?: number;
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
    /**
     * Inject RL experiences into context assembly.
     * Called externally by devclaw or internally by assemble().
     */
    injectRLExperience(p: {
        sessionId: string;
        taskType?: string;
        topK?: number;
    }): Promise<{
        experiences: RLExperience[];
        injectedTokens: number;
    }>;
    /**
     * Inject governance signals into context assembly.
     * Called externally by devclaw or internally by assemble().
     */
    injectGovernanceSignals(p: {
        sessionId: string;
        governanceLayers?: GovernanceLayer[];
    }): Promise<{
        signals: GovernanceSignal[];
        injectedTokens: number;
    }>;
    /** Set a custom RL provider (e.g., bridge to claw-rl) */
    setRLProvider(provider: RLProvider): void;
    /** Set a custom governance provider (e.g., bridge to neoclaw) */
    setGovernanceProvider(provider: GovernanceProvider): void;
    /** Get current confidence gate for inspection */
    getConfidenceGate(): ConfidenceGate | null;
    /** Set a custom cross-domain provider (e.g., bridge to claw-mem v5.4.0 detect_cross_domain_correlation) */
    setCrossDomainProvider(provider: CrossDomainProvider): void;
    /** Set a custom CI provider (e.g., bridge to GitHub Actions API) */
    setCIProvider(provider: CIProvider): void;
    /** Get or configure the token budget manager */
    getBudgetManager(): TokenBudgetManager;
    /** Inject RL, governance, and cross-domain context additions */
    private injectExternalContext;
    /** Inject cross-domain signals (v3.0.0) */
    private injectCrossDomainContext;
    /** Inject CI/CD signals (v4.0.0) */
    private injectCIContext;
    /**
     * v4.1.0: Load previous session context from claw-mem.
     * Searches for stored session summaries and returns a formatted block.
     */
    private _loadPreviousSessionContext;
    /**
     * v4.1.0: Store session summary after each turn for continuity.
     * Aggregates recent messages into a concise summary stored in claw-mem.
     */
    private _storeSessionSummary;
    dispose(): Promise<void>;
}
export declare function createClawContextEngine(config: ClawCtxConfig, logger: ClawCtxLogger, manager?: MemoryManager): ClawContextEngine;
export {};
