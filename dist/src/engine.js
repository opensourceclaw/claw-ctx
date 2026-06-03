"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClawContextEngine = void 0;
exports.createClawContextEngine = createClawContextEngine;
/**
 * claw-ctx v3.0.0 — Context Engine
 *
 * Standalone Context Engine plugin. Uses claw-mem MemoryManager for storage/retrieval.
 * v2.0.0 adds: C2 confidence gating, RL experience injection, governance signal pass-through.
 * v3.0.0 adds: cross-domain signal injection, token budget management.
 */
const memory_manager_1 = require("../../claw-mem/claw_mem_plugin/dist/src/memory_manager");
const confidence_gate_1 = require("./confidence_gate");
const rl_injector_1 = require("./rl_injector");
const governance_injector_1 = require("./governance_injector");
const cross_domain_injector_1 = require("./cross_domain_injector");
const token_budget_manager_1 = require("./token_budget_manager");
const ci_injector_1 = require("./ci_injector");
function extractText(msg) {
    if (!msg)
        return "";
    const c = msg.content;
    if (typeof c === "string")
        return c;
    if (Array.isArray(c))
        return c.map((b) => typeof b === "string" ? b : b?.text ?? b?.thinking ?? "").join(" ");
    return String(c ?? "");
}
function estimateTokens(text) {
    let t = 0;
    for (const ch of text)
        t += /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch) ? 1 : 1 / 3.5;
    return Math.ceil(t);
}
function selectByBudget(items, budget) {
    if (items.length === 0)
        return [];
    const sorted = [...items].sort((a, b) => b.score - a.score);
    const counts = sorted.map((m) => estimateTokens(m.content));
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (counts.slice(0, mid).reduce((s, t) => s + t, 0) <= budget)
            lo = mid;
        else
            hi = mid - 1;
    }
    return sorted.slice(0, lo);
}
const INFO = { id: "claw-ctx", name: "Claw Context Engine", version: "4.1.0", ownsCompaction: false, turnMaintenanceMode: "foreground", hostRequirements: {} };
class SearchCache {
    store = new Map();
    ttl;
    constructor(ttl = 30000) { this.ttl = ttl; }
    get(k) { const e = this.store.get(k); if (e && Date.now() - e.ts < this.ttl)
        return e.data; this.store.delete(k); return undefined; }
    set(k, d) { this.store.set(k, { data: d, ts: Date.now() }); if (this.store.size > 50) {
        const a = [...this.store.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
        if (a)
            this.store.delete(a[0]);
    } }
}
class ClawContextEngine {
    info = INFO;
    manager;
    config;
    logger;
    sid = null;
    cache = new SearchCache(30000);
    confidenceGate = null;
    rlInjector = null;
    governanceInjector = null;
    crossDomainInjector = null;
    ciInjector = null;
    budgetManager;
    constructor(config, logger, manager) {
        this.config = config;
        this.logger = logger;
        this.manager = manager ?? (0, memory_manager_1.getMemoryManager)({ workspace: config.workspaceDir || process.cwd(), autoDetect: false });
        this.budgetManager = new token_budget_manager_1.TokenBudgetManager();
    }
    _session(id) { if (this.sid !== id) {
        this.sid = id;
        this.manager.sessionId = id;
    } }
    async bootstrap(p) {
        this._session(p.sessionId);
        try {
            this.manager.injectConstitution?.();
        }
        catch {
            this.logger.warn("[claw-ctx] constitution skip");
        }
        // v4.1.0: Session continuity — inject previous session context
        let importedMessages = 0;
        try {
            const prevSummary = this._loadPreviousSessionContext();
            if (prevSummary) {
                this.manager.store(`[Previous Session Context] ${prevSummary}`, "episodic", ["session_summary", "continuity"], { sessionId: p.sessionId, isPreviousSession: true });
                importedMessages = 1;
                this.logger.info("[claw-ctx] Injected previous session context");
            }
        }
        catch (e) {
            this.logger.warn("[claw-ctx] session continuity injection failed:", e);
        }
        return { bootstrapped: true, importedMessages, reason: "Claw Context bootstrapped" };
    }
    async ingest(p) {
        if (p.isHeartbeat)
            return { ingested: false };
        this._session(p.sessionId);
        const c = extractText(p.message);
        if (!c || c.length < 20)
            return { ingested: false };
        try {
            this.manager.store(c, "episodic");
            return { ingested: true };
        }
        catch {
            return { ingested: false };
        }
    }
    async ingestBatch(p) {
        if (p.isHeartbeat)
            return { ingestedCount: 0 };
        this._session(p.sessionId);
        let n = 0;
        for (const m of p.messages) {
            const c = extractText(m);
            if (c && c.length >= 20) {
                try {
                    this.manager.store(c, "episodic");
                    n++;
                }
                catch { /* skip */ }
            }
        }
        return { ingestedCount: n };
    }
    async assemble(p) {
        this._session(p.sessionId);
        // Apply confidence mode if specified
        if (p.confidenceMode && p.confidenceMode !== "disabled") {
            const gate = new confidence_gate_1.ConfidenceGate({
                threshold: p.confidenceThreshold,
                mode: p.confidenceMode,
            });
            this.confidenceGate = gate;
        }
        const q = p.prompt || extractText(p.messages[p.messages.length - 1]) || "";
        const budget = p.tokenBudget ?? 4000;
        let mems = this.cache.get(q) ?? [];
        if (!mems.length) {
            try {
                const r = this.manager.search(q, undefined, this.config.topK ?? 10);
                mems = r?.memories ?? r ?? [];
                if (Array.isArray(mems))
                    this.cache.set(q, mems);
            }
            catch (e) {
                this.logger.warn("[claw-ctx] search fail:", e);
            }
        }
        if (!Array.isArray(mems) || mems.length === 0) {
            // Still inject RL/governance/cross-domain/CI even without memories
            const additions = await this.injectExternalContext(p.sessionId);
            const crossDomainResult = await this.injectCrossDomainContext(p);
            if (crossDomainResult)
                additions.push(crossDomainResult.block);
            const ciResult = await this.injectCIContext(p);
            if (ciResult)
                additions.push(ciResult.block);
            const sys = additions.length ? additions.join("\n\n") : undefined;
            return {
                messages: p.messages,
                estimatedTokens: 0,
                systemPromptAddition: sys,
                confidenceReport: this.confidenceGate
                    ? { totalItems: 0, passedItems: 0, avgConfidence: 0, threshold: this.confidenceGate.getConfig().threshold, mode: this.confidenceGate.getConfig().mode }
                    : undefined,
                crossDomainReport: crossDomainResult?.report,
                ciReport: ciResult?.report,
            };
        }
        // Convert to scored items
        let items = mems.map((m) => ({ content: m.content ?? "", score: m.score ?? 0 }));
        // Apply C2 confidence gating
        let confidenceReport;
        if (this.confidenceGate) {
            const gated = this.confidenceGate.gate(items);
            items = gated.passed;
            confidenceReport = gated.report;
        }
        else {
            // Legacy: simple score >= 0.3 filter
            items = items.filter((m) => m.score >= 0.3);
        }
        const sel = selectByBudget(items, budget);
        const tokens = sel.reduce((s, m) => s + estimateTokens(m.content), 0);
        // Build system prompt additions
        const additions = [];
        // Core context from memories
        const lines = sel.map((m) => `- ${m.content}`);
        if (lines.length) {
            additions.push(`[Context] Relevant memories:\n${lines.join("\n")}`);
        }
        // RL experience + governance signal injection
        const externalAdditions = await this.injectExternalContext(p.sessionId);
        additions.push(...externalAdditions);
        // Cross-domain signal injection (v3.0.0)
        const crossDomainResult = await this.injectCrossDomainContext(p);
        if (crossDomainResult)
            additions.push(crossDomainResult.block);
        // CI/CD signal injection (v4.0.0)
        const ciResult = await this.injectCIContext(p);
        if (ciResult)
            additions.push(ciResult.block);
        const sys = additions.length ? additions.join("\n\n") : undefined;
        return { messages: p.messages, estimatedTokens: tokens, systemPromptAddition: sys, confidenceReport, crossDomainReport: crossDomainResult?.report, ciReport: ciResult?.report };
    }
    async compact(p) {
        if (p.abortSignal?.aborted)
            return { ok: false, compacted: false, reason: "aborted" };
        this._session(p.sessionId);
        const crossDomainReserve = p.reserveForCrossDomain ?? 0;
        const ciReserve = p.reserveForCI ?? 0;
        const cur = p.currentTokenCount ?? 50000;
        // v4.2.0: Configurable threshold (default 100K for 200K model context)
        const baseThreshold = this.config.compactThreshold ?? 100000;
        const effectiveThreshold = baseThreshold - crossDomainReserve - ciReserve;
        if (!p.force && cur < effectiveThreshold) {
            return { ok: true, compacted: false, reason: `below threshold (${cur} < ${effectiveThreshold})` };
        }
        const ratio = this.config.reserveRatio ?? 0.7;
        const safeTarget = Math.floor(effectiveThreshold * ratio);
        return {
            ok: true,
            compacted: true,
            result: {
                summary: `Claw Context compaction (target: ${safeTarget} tokens)`,
                tokensBefore: cur,
                tokensAfter: safeTarget,
            },
        };
    }
    async maintain(p) {
        this._session(p.sessionId);
        try {
            const mem = this.manager;
            if (mem.decayEngine) {
                const r = mem.decayEngine.runCycle();
                return { changed: (r.evicted ?? 0) > 0, bytesFreed: (r.evicted ?? 0) * 500, rewrittenEntries: 0 };
            }
        }
        catch { /* ok */ }
        return { changed: false, bytesFreed: 0, rewrittenEntries: 0 };
    }
    async afterTurn(p) {
        if (p.isHeartbeat)
            return;
        this._session(p.sessionId);
        if (p.autoCompactionSummary) {
            try {
                this.manager.store(p.autoCompactionSummary, "episodic", ["compaction"]);
            }
            catch { /* ok */ }
        }
        // v4.1.0: Store session summary for continuity
        try {
            this._storeSessionSummary(p.sessionId, p.messages);
        }
        catch { /* best effort */ }
    }
    async prepareSubagentSpawn(p) {
        const cid = p.childSessionId ?? p.childSessionKey;
        let prev = null;
        if (p.contextMode === "fork" && p.parentSessionId) {
            prev = this.sid;
            this.manager.sessionId = cid;
        }
        else {
            this.manager.sessionId = cid;
        }
        return { rollback: () => { if (prev)
                this.manager.sessionId = prev; } };
    }
    async onSubagentEnded(p) {
        if (p.reason === "completed") {
            try {
                const r = this.manager.search("important", undefined, 5);
                if (Array.isArray(r))
                    for (const m of r)
                        this.manager.store(`[subagent] ${m.content?.slice?.(0, 200) ?? ""}`, "episodic", ["subagent"]);
            }
            catch { /* ok */ }
        }
    }
    /**
     * Inject RL experiences into context assembly.
     * Called externally by devclaw or internally by assemble().
     */
    async injectRLExperience(p) {
        if (!this.rlInjector) {
            this.rlInjector = new rl_injector_1.RLInjector();
        }
        return this.rlInjector.inject(p);
    }
    /**
     * Inject governance signals into context assembly.
     * Called externally by devclaw or internally by assemble().
     */
    async injectGovernanceSignals(p) {
        if (!this.governanceInjector) {
            this.governanceInjector = new governance_injector_1.GovernanceInjector();
        }
        return this.governanceInjector.inject(p);
    }
    /** Set a custom RL provider (e.g., bridge to claw-rl) */
    setRLProvider(provider) {
        if (!this.rlInjector) {
            this.rlInjector = new rl_injector_1.RLInjector(provider);
        }
        else {
            this.rlInjector.setProvider(provider);
        }
    }
    /** Set a custom governance provider (e.g., bridge to neoclaw) */
    setGovernanceProvider(provider) {
        if (!this.governanceInjector) {
            this.governanceInjector = new governance_injector_1.GovernanceInjector(provider);
        }
        else {
            this.governanceInjector.setProvider(provider);
        }
    }
    /** Get current confidence gate for inspection */
    getConfidenceGate() {
        return this.confidenceGate;
    }
    /** Set a custom cross-domain provider (e.g., bridge to claw-mem v5.4.0 detect_cross_domain_correlation) */
    setCrossDomainProvider(provider) {
        if (!this.crossDomainInjector) {
            this.crossDomainInjector = new cross_domain_injector_1.CrossDomainInjector(provider);
        }
        else {
            this.crossDomainInjector.setProvider(provider);
        }
    }
    /** Set a custom CI provider (e.g., bridge to GitHub Actions API) */
    setCIProvider(provider) {
        if (!this.ciInjector) {
            this.ciInjector = new ci_injector_1.CIInjector(provider);
        }
        else {
            this.ciInjector.setProvider(provider);
        }
    }
    /** Get or configure the token budget manager */
    getBudgetManager() {
        return this.budgetManager;
    }
    /** Inject RL, governance, and cross-domain context additions */
    async injectExternalContext(sessionId) {
        const additions = [];
        if (this.rlInjector) {
            const rlResult = await this.rlInjector.inject({
                sessionId,
                topK: 5,
            });
            if (rlResult.experiences.length > 0) {
                const rlBlock = this.rlInjector.formatForContext(rlResult.experiences);
                if (rlBlock)
                    additions.push(rlBlock);
            }
        }
        if (this.governanceInjector) {
            const govResult = await this.governanceInjector.inject({
                sessionId,
            });
            if (govResult.signals.length > 0) {
                const govBlock = this.governanceInjector.formatForContext(govResult.signals);
                if (govBlock)
                    additions.push(govBlock);
            }
        }
        return additions;
    }
    /** Inject cross-domain signals (v3.0.0) */
    async injectCrossDomainContext(p) {
        if (!p.crossDomain?.enabled || !p.crossDomain.currentPillar)
            return null;
        if (!this.crossDomainInjector) {
            this.crossDomainInjector = new cross_domain_injector_1.CrossDomainInjector();
        }
        const result = await this.crossDomainInjector.inject({
            sessionId: p.sessionId,
            currentPillar: p.crossDomain.currentPillar,
            currentIntent: p.crossDomain.currentIntent ?? "",
            timeRange: p.crossDomain.timeRange,
            maxSignals: p.crossDomain.maxSignals,
        });
        if (result.signals.length === 0)
            return null;
        const block = this.crossDomainInjector.formatForContext(result.signals);
        return {
            block,
            report: {
                signalsInjected: result.signals.length,
                totalTokens: result.totalTokens,
                correlations: result.signals,
            },
        };
    }
    /** Inject CI/CD signals (v4.0.0) */
    async injectCIContext(p) {
        if (!p.ci?.enabled)
            return null;
        if (!this.ciInjector) {
            this.ciInjector = new ci_injector_1.CIInjector();
        }
        const result = await this.ciInjector.inject({
            sessionId: p.sessionId,
            project: p.ci.project,
            includeBuildStatus: p.ci.includeBuildStatus,
            includeTestResults: p.ci.includeTestResults,
            includeDeployStatus: p.ci.includeDeployStatus,
            maxSignals: p.ci.maxSignals,
        });
        if (result.signals.length === 0)
            return null;
        const block = this.ciInjector.formatForContext(result.signals);
        return {
            block,
            report: {
                signalsInjected: result.signals.length,
                totalTokens: result.totalTokens,
                signals: result.signals,
            },
        };
    }
    /**
     * v4.1.0: Load previous session context from claw-mem.
     * Searches for stored session summaries and returns a formatted block.
     */
    _loadPreviousSessionContext() {
        try {
            // Search for session summaries in claw-mem
            const summaries = this.manager.search("session_summary", undefined, 5);
            if (!summaries || summaries.length === 0)
                return null;
            // Filter to entries with session_summary tag
            const sessionSummaries = summaries.filter((m) => m.tags?.includes?.("session_summary"));
            if (sessionSummaries.length === 0)
                return null;
            // Get the most recent session summary
            const latest = sessionSummaries[0];
            const content = typeof latest.content === "string" ? latest.content : "";
            return `[Previous Session (${latest.timestamp || "unknown"})]\n${content}\n\nContinue from where you left off.`;
        }
        catch {
            return null;
        }
    }
    /**
     * v4.1.0: Store session summary after each turn for continuity.
     * Aggregates recent messages into a concise summary stored in claw-mem.
     */
    _storeSessionSummary(sessionId, messages) {
        if (!messages || messages.length < 3)
            return;
        // Extract key info from recent messages
        const recentMsgs = messages.slice(-10);
        const topics = [];
        const keywordSet = new Set([
            "code", "bug", "fix", "deploy", "test", "refactor",
            "config", "error", "performance", "api", "database",
            "task", "version", "release", "review", "build"
        ]);
        const text = recentMsgs.map((m) => {
            const c = typeof m.content === "string" ? m.content : "";
            // Extract keywords
            for (const kw of keywordSet) {
                if (c.toLowerCase().includes(kw) && !topics.includes(kw)) {
                    topics.push(kw);
                }
            }
            return c;
        }).join(" ");
        const lastMsg = recentMsgs[recentMsgs.length - 1];
        const lastContent = typeof lastMsg?.content === "string" ? lastMsg.content.slice(0, 200) : "";
        const summary = topics.length > 0
            ? `Working on: ${topics.slice(0, 8).join(", ")}. Last action: ${lastContent}`
            : `Last action: ${lastContent}`;
        this.manager.store(summary, "episodic", ["session_summary", "continuity"], { sessionId, isSessionSummary: true, messageCount: messages.length });
    }
    async dispose() { this.sid = null; this.cache = new SearchCache(30000); }
}
exports.ClawContextEngine = ClawContextEngine;
function createClawContextEngine(config, logger, manager) {
    return new ClawContextEngine(config, logger, manager);
}
