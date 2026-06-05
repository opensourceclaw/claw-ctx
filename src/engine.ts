/**
 * claw-ctx v3.0.0 — Context Engine
 *
 * Standalone Context Engine plugin. Uses claw-mem MemoryManager for storage/retrieval.
 * v2.0.0 adds: C2 confidence gating, RL experience injection, governance signal pass-through.
 * v3.0.0 adds: cross-domain signal injection, token budget management.
 */
import { getMemoryManager, type MemoryManager } from "../../claw-mem/dist/memory_manager";
import { ConfidenceGate, type ConfidenceMode, type ConfidenceReport } from "./confidence_gate";
import { RLInjector, type RLExperience, type RLProvider, MockRLProvider } from "./rl_injector";
import { GovernanceInjector, type GovernanceSignal, type GovernanceProvider, type GovernanceLayer, MockGovernanceProvider } from "./governance_injector";
import { CrossDomainInjector, type InjectedSignal, type CrossDomainProvider, MockCrossDomainProvider } from "./cross_domain_injector";
import { TokenBudgetManager, type BudgetResult } from "./token_budget_manager";
import { TiktokenCounter, FallbackCounter, createTokenCounter, type TokenCounterResult } from "./token-counter";
import { DriftDetector, TopicModel, type DriftAlert, type DriftReport, type DriftConfig, DEFAULT_DRIFT_CONFIG } from "./drift-detector";
import { SmartBudgetAllocator, type TaskType, type BudgetAllocation as SmartBudgetAllocation, type AllocationHistory } from "./smart-budget-allocator";
import { CIInjector, type CISignal, type CIProvider, MockCIProvider } from "./ci_injector";

// v4.3.0: Global token counter instance for precise counting
let globalTokenCounter = createTokenCounter("cl100k_base");

interface ClawCtxConfig { workspaceDir?: string; topK?: number; debug?: boolean; compactThreshold?: number; reserveRatio?: number }
interface ClawCtxLogger { info: (...a: any[]) => void; error: (...a: any[]) => void; warn: (...a: any[]) => void; debug?: (...a: any[]) => void }

function extractText(msg: any): string {
  if (!msg) return "";
  const c = msg.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((b: any) => typeof b === "string" ? b : b?.text ?? b?.thinking ?? "").join(" ");
  return String(c ?? "");
}

/**
 * Estimate tokens using tiktoken (v4.3.0) or fallback.
 * Replaces the old char/3.5 heuristic with precise token counting.
 */
function estimateTokens(text: string): number {
  if (globalTokenCounter.isPrecise()) {
    try {
      return globalTokenCounter.count(text).tokens;
    } catch {
      // Fall through to fallback
    }
  }
  return FallbackCounter.estimate(text);
}

interface ScoredItem { content: string; score: number }

function selectByBudget(items: ScoredItem[], budget: number): ScoredItem[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const counts = sorted.map((m) => estimateTokens(m.content));
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (counts.slice(0, mid).reduce((s, t) => s + t, 0) <= budget) lo = mid;
    else hi = mid - 1;
  }
  return sorted.slice(0, lo);
}

const INFO = { id: "claw-ctx", name: "Claw Context Engine", version: "4.5.0", ownsCompaction: false, turnMaintenanceMode: "foreground" as const, hostRequirements: {} };

class SearchCache<T> {
  private store = new Map<string, { data: T; ts: number }>();
  private ttl: number;
  constructor(ttl = 30000) { this.ttl = ttl; }
  get(k: string): T | undefined { const e = this.store.get(k); if (e && Date.now() - e.ts < this.ttl) return e.data; this.store.delete(k); return undefined; }
  set(k: string, d: T): void { this.store.set(k, { data: d, ts: Date.now() }); if (this.store.size > 50) { const a = [...this.store.entries()].sort((a,b) => a[1].ts - b[1].ts)[0]; if (a) this.store.delete(a[0]); } }
}

export class ClawContextEngine {
  readonly info = INFO;
  private manager: MemoryManager;
  private config: ClawCtxConfig;
  private logger: ClawCtxLogger;
  private sid: string | null = null;
  private cache = new SearchCache<any[]>(30000);
  private confidenceGate: ConfidenceGate | null = null;
  private rlInjector: RLInjector | null = null;
  private governanceInjector: GovernanceInjector | null = null;
  private crossDomainInjector: CrossDomainInjector | null = null;
  private ciInjector: CIInjector | null = null;
  private budgetManager: TokenBudgetManager;
  private _tokenCounter = globalTokenCounter;
  private driftDetector: DriftDetector;
  private driftAlerts: DriftAlert[] = [];
  private _smartBudgetAllocator: SmartBudgetAllocator;
  // v4.3.0: tiktoken | v4.4.0: drift | v4.5.0: smart budget allocator

  constructor(config: ClawCtxConfig, logger: ClawCtxLogger, manager?: MemoryManager) {
    this.config = config; this.logger = logger;
    this.manager = manager ?? getMemoryManager({ workspace: config.workspaceDir || process.cwd(), autoDetect: false });
    this.budgetManager = new TokenBudgetManager();
    this.driftDetector = new DriftDetector();
    this._smartBudgetAllocator = new SmartBudgetAllocator();
    this._smartBudgetAllocator.setDriftDetector(this.driftDetector);
  }

  private _session(id: string): void { if (this.sid !== id) { this.sid = id; this.manager.sessionId = id; } }

  async bootstrap(p: { sessionId: string; sessionKey?: string; sessionFile: string }): Promise<{ bootstrapped: boolean; importedMessages?: number; reason?: string }> {
    this._session(p.sessionId);
    try { this.manager.injectConstitution?.(); } catch { this.logger.warn("[claw-ctx] constitution skip"); }

    // v4.1.0: Session continuity — inject previous session context
    let importedMessages = 0;
    try {
      const prevSummary = this._loadPreviousSessionContext();
      if (prevSummary) {
        this.manager.store(
          `[Previous Session Context] ${prevSummary}`,
          "episodic",
          ["session_summary", "continuity"],
          { sessionId: p.sessionId, isPreviousSession: true }
        );
        importedMessages = 1;
        this.logger.info("[claw-ctx] Injected previous session context");
      }
    } catch (e) {
      this.logger.warn("[claw-ctx] session continuity injection failed:", e);
    }

    return { bootstrapped: true, importedMessages, reason: "Claw Context bootstrapped" };
  }

  async ingest(p: { sessionId: string; sessionKey?: string; message: any; isHeartbeat?: boolean }): Promise<{ ingested: boolean }> {
    if (p.isHeartbeat) return { ingested: false };
    this._session(p.sessionId);
    const c = extractText(p.message);
    if (!c || c.length < 20) return { ingested: false };
    try { this.manager.store(c, "episodic"); return { ingested: true }; } catch { return { ingested: false }; }
  }

  async ingestBatch(p: { sessionId: string; sessionKey?: string; messages: any[]; isHeartbeat?: boolean }): Promise<{ ingestedCount: number }> {
    if (p.isHeartbeat) return { ingestedCount: 0 };
    this._session(p.sessionId);
    let n = 0;
    for (const m of p.messages) { const c = extractText(m); if (c && c.length >= 20) { try { this.manager.store(c, "episodic"); n++; } catch { /* skip */ } } }
    return { ingestedCount: n };
  }

  async assemble(p: { sessionId: string; sessionKey?: string; messages: any[]; tokenBudget?: number; availableTools?: Set<string>; citationsMode?: string; model?: string; prompt?: string; confidenceThreshold?: number; confidenceMode?: ConfidenceMode; crossDomain?: { enabled: boolean; currentPillar?: string; currentIntent?: string; timeRange?: string; maxSignals?: number }; ci?: { enabled: boolean; project?: string; includeBuildStatus?: boolean; includeTestResults?: boolean; includeDeployStatus?: boolean; maxSignals?: number } }): Promise<{ messages: any[]; estimatedTokens: number; systemPromptAddition?: string; promptAuthority?: string; confidenceReport?: ConfidenceReport; crossDomainReport?: { signalsInjected: number; totalTokens: number; correlations: InjectedSignal[] }; ciReport?: { signalsInjected: number; totalTokens: number; signals: CISignal[] } }> {
    this._session(p.sessionId);

    // Apply confidence mode if specified
    if (p.confidenceMode && p.confidenceMode !== "disabled") {
      const gate = new ConfidenceGate({
        threshold: p.confidenceThreshold,
        mode: p.confidenceMode,
      });
      this.confidenceGate = gate;
    }

    // v5.0.0: Feed messages to drift detector
    const recentMsgs = p.messages.slice(-2).map((m: any) => ({
      content: extractText(m),
      role: m.role,
    }));
    const newDriftAlerts = this.driftDetector.feedTurn(recentMsgs);
    if (newDriftAlerts.length > 0) {
      this.driftAlerts.push(...newDriftAlerts);
    }

    const q = p.prompt || extractText(p.messages[p.messages.length - 1]) || "";
    const budget = p.tokenBudget ?? 4000;
    let mems: any[] = this.cache.get(q) ?? [];
    if (!mems.length) { try { const r = this.manager.search(q, undefined, this.config.topK ?? 10); mems = (r as any)?.memories ?? r ?? []; if (Array.isArray(mems)) this.cache.set(q, mems); } catch (e) { this.logger.warn("[claw-ctx] search fail:", e); } }
    if (!Array.isArray(mems) || mems.length === 0) {
      // Still inject RL/governance/cross-domain/CI even without memories
      const additions = await this.injectExternalContext(p.sessionId);
      const crossDomainResult = await this.injectCrossDomainContext(p);
      if (crossDomainResult) additions.push(crossDomainResult.block);
      const ciResult = await this.injectCIContext(p);
      if (ciResult) additions.push(ciResult.block);
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
    let items: ScoredItem[] = mems.map((m: any) => ({ content: m.content ?? "", score: m.score ?? 0 }));

    // Apply C2 confidence gating
    let confidenceReport: ConfidenceReport | undefined;
    if (this.confidenceGate) {
      const gated = this.confidenceGate.gate(items);
      items = gated.passed;
      confidenceReport = gated.report;
    } else {
      // Legacy: simple score >= 0.3 filter
      items = items.filter((m) => m.score >= 0.3);
    }

    const sel = selectByBudget(items, budget);
    const tokens = sel.reduce((s, m) => s + estimateTokens(m.content), 0);

    // Build system prompt additions
    const additions: string[] = [];

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
    if (crossDomainResult) additions.push(crossDomainResult.block);

    // CI/CD signal injection (v4.0.0)
    const ciResult = await this.injectCIContext(p);
    if (ciResult) additions.push(ciResult.block);

    const sys = additions.length ? additions.join("\n\n") : undefined;

    // v5.0.0: Include drift alerts in system prompt
    let driftAwareSys = sys;
    if (this.driftAlerts.length > 0) {
      const recent = this.driftAlerts.slice(-2);
      const driftBlock = recent
        .map((a) => `[Drift ${a.level.toUpperCase()}] Score: ${a.driftScore.toFixed(2)} — ${a.suggestedActions.map((act) => act.description).join("; ")}`)
        .join("\n");
      driftAwareSys = sys
        ? `${sys}\n\n[Drift Monitor]\n${driftBlock}`
        : `[Drift Monitor]\n${driftBlock}`;
    }

    return { messages: p.messages, estimatedTokens: tokens, systemPromptAddition: driftAwareSys, confidenceReport, crossDomainReport: crossDomainResult?.report, ciReport: ciResult?.report };
  }

  async compact(p: { sessionId: string; sessionKey?: string; sessionFile: string; tokenBudget?: number; force?: boolean; currentTokenCount?: number; compactionTarget?: string; customInstructions?: string; abortSignal?: AbortSignal; reserveForCrossDomain?: number; reserveForCI?: number }): Promise<{ ok: boolean; compacted: boolean; reason?: string; result?: { summary?: string; tokensBefore: number; tokensAfter?: number; details?: unknown } }> {
    if (p.abortSignal?.aborted) return { ok: false, compacted: false, reason: "aborted" };
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

  async maintain(p: { sessionId: string; sessionKey?: string; sessionFile: string; runtimeContext?: Record<string, unknown> }): Promise<{ changed: boolean; bytesFreed: number; rewrittenEntries: number }> {
    this._session(p.sessionId);
    try { const mem = this.manager as any; if (mem.decayEngine) { const r = mem.decayEngine.runCycle(); return { changed: (r.evicted ?? 0) > 0, bytesFreed: (r.evicted ?? 0) * 500, rewrittenEntries: 0 }; } } catch { /* ok */ }
    return { changed: false, bytesFreed: 0, rewrittenEntries: 0 };
  }

  /**
   * v4.3.0: Get the token counter instance for external use.
   */
  getTokenCounter(): typeof globalTokenCounter {
    return this._tokenCounter;
  }

  /**
   * v4.3.0: Count tokens in text with precise tiktoken or fallback.
   */
  countTokens(text: string): TokenCounterResult {
    return this._tokenCounter.count(text);
  }

  async afterTurn(p: { sessionId: string; sessionKey?: string; sessionFile: string; messages: any[]; prePromptMessageCount: number; autoCompactionSummary?: string; isHeartbeat?: boolean; tokenBudget?: number }): Promise<void> {
    if (p.isHeartbeat) return;
    this._session(p.sessionId);
    if (p.autoCompactionSummary) { try { this.manager.store(p.autoCompactionSummary, "episodic", ["compaction"]); } catch { /* ok */ } }

    // v4.1.0: Store session summary for continuity
    try {
      this._storeSessionSummary(p.sessionId, p.messages);
    } catch { /* best effort */ }
  }

  async prepareSubagentSpawn(p: { parentSessionKey: string; childSessionKey: string; contextMode?: "isolated" | "fork"; parentSessionId?: string; parentSessionFile?: string; childSessionId?: string; childSessionFile?: string; ttlMs?: number }): Promise<{ rollback: () => void } | undefined> {
    const cid = p.childSessionId ?? p.childSessionKey;
    let prev: string | null = null;
    if (p.contextMode === "fork" && p.parentSessionId) { prev = this.sid; this.manager.sessionId = cid; } else { this.manager.sessionId = cid; }
    return { rollback: () => { if (prev) this.manager.sessionId = prev; } };
  }

  async onSubagentEnded(p: { childSessionKey: string; reason: "deleted" | "completed" | "swept" | "released" }): Promise<void> {
    if (p.reason === "completed") { try { const r = this.manager.search("important", undefined, 5); if (Array.isArray(r)) for (const m of r) this.manager.store(`[subagent] ${(m.content as any)?.slice?.(0,200) ?? ""}`, "episodic", ["subagent"]); } catch { /* ok */ } }
  }

  /**
   * Inject RL experiences into context assembly.
   * Called externally by devclaw or internally by assemble().
   */
  async injectRLExperience(p: {
    sessionId: string;
    taskType?: string;
    topK?: number;
  }): Promise<{ experiences: RLExperience[]; injectedTokens: number }> {
    if (!this.rlInjector) {
      this.rlInjector = new RLInjector();
    }
    return this.rlInjector.inject(p);
  }

  /**
   * Inject governance signals into context assembly.
   * Called externally by devclaw or internally by assemble().
   */
  async injectGovernanceSignals(p: {
    sessionId: string;
    governanceLayers?: GovernanceLayer[];
  }): Promise<{ signals: GovernanceSignal[]; injectedTokens: number }> {
    if (!this.governanceInjector) {
      this.governanceInjector = new GovernanceInjector();
    }
    return this.governanceInjector.inject(p);
  }

  /** Set a custom RL provider (e.g., bridge to claw-rl) */
  setRLProvider(provider: RLProvider): void {
    if (!this.rlInjector) {
      this.rlInjector = new RLInjector(provider);
    } else {
      this.rlInjector.setProvider(provider);
    }
  }

  /** Set a custom governance provider (e.g., bridge to neoclaw) */
  setGovernanceProvider(provider: GovernanceProvider): void {
    if (!this.governanceInjector) {
      this.governanceInjector = new GovernanceInjector(provider);
    } else {
      this.governanceInjector.setProvider(provider);
    }
  }

  /** Get current confidence gate for inspection */
  getConfidenceGate(): ConfidenceGate | null {
    return this.confidenceGate;
  }

  /** Set a custom cross-domain provider (e.g., bridge to claw-mem v5.4.0 detect_cross_domain_correlation) */
  setCrossDomainProvider(provider: CrossDomainProvider): void {
    if (!this.crossDomainInjector) {
      this.crossDomainInjector = new CrossDomainInjector(provider);
    } else {
      this.crossDomainInjector.setProvider(provider);
    }
  }

  /** Set a custom CI provider (e.g., bridge to GitHub Actions API) */
  setCIProvider(provider: CIProvider): void {
    if (!this.ciInjector) {
      this.ciInjector = new CIInjector(provider);
    } else {
      this.ciInjector.setProvider(provider);
    }
  }

  /** Get or configure the token budget manager */
  getBudgetManager(): TokenBudgetManager {
    return this.budgetManager;
  }

  /** Inject RL, governance, and cross-domain context additions */
  private async injectExternalContext(sessionId: string): Promise<string[]> {
    const additions: string[] = [];

    if (this.rlInjector) {
      const rlResult = await this.rlInjector.inject({
        sessionId,
        topK: 5,
      });
      if (rlResult.experiences.length > 0) {
        const rlBlock = this.rlInjector.formatForContext(rlResult.experiences);
        if (rlBlock) additions.push(rlBlock);
      }
    }

    if (this.governanceInjector) {
      const govResult = await this.governanceInjector.inject({
        sessionId,
      });
      if (govResult.signals.length > 0) {
        const govBlock = this.governanceInjector.formatForContext(govResult.signals);
        if (govBlock) additions.push(govBlock);
      }
    }

    return additions;
  }

  /** Inject cross-domain signals (v3.0.0) */
  private async injectCrossDomainContext(p: {
    sessionId: string;
    crossDomain?: { enabled: boolean; currentPillar?: string; currentIntent?: string; timeRange?: string; maxSignals?: number };
  }): Promise<{ block: string; report: { signalsInjected: number; totalTokens: number; correlations: InjectedSignal[] } } | null> {
    if (!p.crossDomain?.enabled || !p.crossDomain.currentPillar) return null;

    if (!this.crossDomainInjector) {
      this.crossDomainInjector = new CrossDomainInjector();
    }

    const result = await this.crossDomainInjector.inject({
      sessionId: p.sessionId,
      currentPillar: p.crossDomain.currentPillar,
      currentIntent: p.crossDomain.currentIntent ?? "",
      timeRange: p.crossDomain.timeRange,
      maxSignals: p.crossDomain.maxSignals,
    });

    if (result.signals.length === 0) return null;

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
  private async injectCIContext(p: {
    sessionId: string;
    ci?: { enabled: boolean; project?: string; includeBuildStatus?: boolean; includeTestResults?: boolean; includeDeployStatus?: boolean; maxSignals?: number };
  }): Promise<{ block: string; report: { signalsInjected: number; totalTokens: number; signals: CISignal[] } } | null> {
    if (!p.ci?.enabled) return null;

    if (!this.ciInjector) {
      this.ciInjector = new CIInjector();
    }

    const result = await this.ciInjector.inject({
      sessionId: p.sessionId,
      project: p.ci.project,
      includeBuildStatus: p.ci.includeBuildStatus,
      includeTestResults: p.ci.includeTestResults,
      includeDeployStatus: p.ci.includeDeployStatus,
      maxSignals: p.ci.maxSignals,
    });

    if (result.signals.length === 0) return null;

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
  private _loadPreviousSessionContext(): string | null {
    try {
      // Search for session summaries in claw-mem
      const summaries = this.manager.search("session_summary", undefined, 5) as any[];
      if (!summaries || summaries.length === 0) return null;

      // Filter to entries with session_summary tag
      const sessionSummaries = summaries.filter(
        (m: any) => m.tags?.includes?.("session_summary")
      );
      if (sessionSummaries.length === 0) return null;

      // Get the most recent session summary
      const latest = sessionSummaries[0];
      const content = typeof latest.content === "string" ? latest.content : "";

      return `[Previous Session (${latest.timestamp || "unknown"})]\n${content}\n\nContinue from where you left off.`;
    } catch {
      return null;
    }
  }

  /**
   * v4.1.0: Store session summary after each turn for continuity.
   * Aggregates recent messages into a concise summary stored in claw-mem.
   */
  private _storeSessionSummary(sessionId: string, messages: any[]): void {
    if (!messages || messages.length < 3) return;

    // Extract key info from recent messages
    const recentMsgs = messages.slice(-10);
    const topics: string[] = [];
    const keywordSet = new Set([
      "code", "bug", "fix", "deploy", "test", "refactor",
      "config", "error", "performance", "api", "database",
      "task", "version", "release", "review", "build"
    ]);

    const text = recentMsgs.map((m: any) => {
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

    this.manager.store(
      summary,
      "episodic",
      ["session_summary", "continuity"],
      { sessionId, isSessionSummary: true, messageCount: messages.length }
    );
  }

  async dispose(): Promise<void> { this.sid = null; this.cache = new SearchCache(30000); }

  // ── v5.0.0: Drift Detection API ──────────────────────────────────

  /** Feed messages to drift detector (call after each turn) */
  feedDriftDetector(messages: Array<{ content: string; role?: string }>): DriftAlert[] {
    return this.driftDetector.feedTurn(messages);
  }

  /** Get current drift score (0.0–1.0, higher = more drift) */
  getDriftScore(): number {
    return this.driftDetector.getDriftScore();
  }

  /** Get comprehensive drift report for message history */
  getDriftReport(history: Array<Array<{ role?: string; content: string }>>): DriftReport {
    return this.driftDetector.detectDrift(history);
  }

  /** Get all accumulated drift alerts */
  getDriftAlerts(): DriftAlert[] {
    return [...this.driftAlerts];
  }

  /** Reset drift detector state */
  resetDriftDetector(): void {
    this.driftDetector.reset();
    this.driftAlerts = [];
  }

  /** Update drift detection config */
  updateDriftConfig(config: Partial<DriftConfig>): void {
    this.driftDetector.updateConfig(config);
  }

  // ── v4.5.0: Smart Budget Allocation ──────────────────────────────

  /**
   * Calculate smart budget using SmartBudgetAllocator.
   * Based on drift state and task type (auto-detected from recent messages).
   */
  calculateSmartBudget(
    totalBudget: number,
    taskType: string = "unknown",
    messages?: Array<{ role?: string; content: string }>
  ): {
    allocation: SmartBudgetAllocation;
    driftScore: number;
    driftLevel: "stable" | "low" | "medium" | "high";
  } {
    const sessionId = this.sid || "default";
    const allocation = this._smartBudgetAllocator.allocate(sessionId, totalBudget, messages);

    let driftLevel: "stable" | "low" | "medium" | "high" = "stable";
    if (allocation.driftScore >= 0.7) driftLevel = "high";
    else if (allocation.driftScore >= 0.5) driftLevel = "medium";
    else if (allocation.driftScore >= 0.3) driftLevel = "low";

    return { allocation, driftScore: allocation.driftScore, driftLevel };
  }

  /** Get the smart budget allocator for external use */
  getSmartBudgetAllocator(): SmartBudgetAllocator {
    return this._smartBudgetAllocator;
  }

  /** Get budget allocation history */
  getBudgetHistory(): AllocationHistory[] {
    return this._smartBudgetAllocator.getHistory();
  }
}

export function createClawContextEngine(config: ClawCtxConfig, logger: ClawCtxLogger, manager?: MemoryManager): ClawContextEngine {
  return new ClawContextEngine(config, logger, manager);
}
