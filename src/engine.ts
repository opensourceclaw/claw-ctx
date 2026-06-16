/**
 * claw-ctx — Context Engine for OpenClaw
 *
 * Copyright 2026 OpenSourceClaw Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * claw-ctx v4.22.0 — Context Engine
 *
 * Standalone Context Engine plugin. Uses claw-mem MemoryManager for storage/retrieval.
 * v2.0.0 adds: C2 confidence gating, RL experience injection, governance signal pass-through.
 * v3.0.0 adds: cross-domain signal injection, token budget management.
 */
import * as fs from "fs";
import { createRequire } from "module";
import { ConfidenceGate, type ConfidenceMode, type ConfidenceReport } from "./confidence_gate.js";

// Graceful claw-mem import — works locally (sibling dir) and in CI (npm package)
const _require = createRequire(import.meta.url);
let _clawMem: any = null;
let getMemoryManager: any;
type MemoryManager = any;
try {
  _clawMem = _require("claw-mem");
  getMemoryManager = _clawMem.getMemoryManager;
} catch {
  try {
    _clawMem = _require("../../claw-mem/dist/memory_manager.js");
    getMemoryManager = _clawMem.getMemoryManager;
  } catch {
    // claw-mem unavailable — use mock for CI/testing
    getMemoryManager = (opts: any) => {
      return {
        sessionId: "",
        store: () => {},
        retrieve: () => [],
        search: () => [],
        injectConstitution: () => {},
      };
    };
  }
}
import { RLInjector, type RLExperience, type RLProvider, MockRLProvider } from "./rl_injector.js";
import { GovernanceInjector, type GovernanceSignal, type GovernanceProvider, type GovernanceLayer, MockGovernanceProvider } from "./governance_injector.js";
import { CrossDomainInjector, type InjectedSignal, type CrossDomainProvider, MockCrossDomainProvider } from "./cross_domain_injector.js";
import { TokenBudgetManager, type BudgetResult } from "./token_budget_manager.js";
import { TiktokenCounter, FallbackCounter, createTokenCounter, type TokenCounterResult } from "./token-counter.js";
import { DriftDetector, TopicModel, type DriftAlert, type DriftReport, type DriftConfig, DEFAULT_DRIFT_CONFIG } from "./drift-detector.js";
import { SmartBudgetAllocator, type TaskType, type BudgetAllocation as SmartBudgetAllocation, type AllocationHistory } from "./smart-budget-allocator.js";
import { SessionStateExtractor, type SessionState, type Entity } from "./session-state-extractor.js";
import { CIInjector, type CISignal, type CIProvider, MockCIProvider } from "./ci_injector.js";
import { LongTermDependencyTracker } from "./long-term-dependency-tracker.js";
import { SelfRefiner } from "./self_refiner.js";
import { PromptStrategyController } from "./prompt_strategy_controller.js";
import { PositionOptimizer } from "./position_optimizer.js";
import { StructuredContextHandler } from "./structured_context_handler.js";
import { MultimodalContextHandler } from "./multimodal_context_handler.js";
import { AutoCompactController, type AutoCompactConfig } from "./auto-compact.js";
import { AutoSessionController, type AutoSessionConfig } from "./auto-session.js";
import { RelevanceScorer, type RelevanceContext, type ScoredMemory } from "./relevance-scorer.js";
import { SemanticCompressor, type CompressionResult } from "./semantic-compressor.js";
import { SessionResumeManager, type SessionResumeConfig, DEFAULT_SESSION_RESUME_CONFIG } from "./session-resume/mod.js";

// v4.11.0: RL-driven memory strategy selection
import {
  MemoryStrategySelector,
  type MemoryStrategy,
  type StrategyContext,
  type StrategyResult,
} from "./memory_strategy_selector.js";

// v4.3.0: Global token counter instance for precise counting
let globalTokenCounter = createTokenCounter("cl100k_base");

interface ClawCtxConfig { workspaceDir?: string; topK?: number; debug?: boolean; compactThreshold?: number; reserveRatio?: number; compressionStrategy?: "semantic" | "legacy"; sessionResume?: Partial<SessionResumeConfig> | false }
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
// v4.10.0: Token count cache to avoid repeated tiktoken lookups
const tokenCache = new Map<string, number>();
const MAX_TOKEN_CACHE = 5000;

function estimateTokens(text: string): number {
  // Use compound cache key: length is the primary differentiator
  const cacheKey = text.length < 500
    ? text
    : `L${text.length}|${text.slice(0, 30)}|${text.slice(-30)}|${text.length}`;
  const cached = tokenCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let result: number;
  if (globalTokenCounter.isPrecise()) {
    try {
      result = globalTokenCounter.count(text).tokens;
    } catch {
      result = FallbackCounter.estimate(text);
    }
  } else {
    result = FallbackCounter.estimate(text);
  }
  // Cache eviction: batch-clean expired entries when full
  if (tokenCache.size >= MAX_TOKEN_CACHE) {
    const toDelete = Math.ceil(MAX_TOKEN_CACHE * 0.1);
    for (let i = 0; i < toDelete; i++) {
      const firstKey = tokenCache.keys().next().value;
      if (firstKey !== undefined) tokenCache.delete(firstKey);
      else break;
    }
  }
  tokenCache.set(cacheKey, result);
  return result;
}

interface ScoredItem { content: string; score: number }

function selectByBudget(items: ScoredItem[], budget: number): ScoredItem[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const counts = sorted.map((m) => estimateTokens(m.content));
  // Use prefix sums for O(n) budget selection
  const prefix = [0];
  for (let i = 0; i < counts.length; i++) prefix.push(prefix[i] + counts[i]);
  let lo = 0, hi = counts.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (prefix[mid] <= budget) lo = mid;
    else hi = mid - 1;
  }
  return sorted.slice(0, lo);
}

const INFO = { id: "claw-ctx", name: "Claw Context Engine", version: "4.25.0", ownsCompaction: true, turnMaintenanceMode: "foreground" as const, hostRequirements: {} };

class SearchCache<T> {
  private store = new Map<string, { data: T; ts: number }>();
  private ttl: number;
  constructor(ttl = 30000) { this.ttl = ttl; }
  get(k: string): T | undefined { const e = this.store.get(k); if (e && Date.now() - e.ts < this.ttl) return e.data; this.store.delete(k); return undefined; }
  set(k: string, d: T): void { this.store.set(k, { data: d, ts: Date.now() }); if (this.store.size > 50) { const firstKey = this.store.keys().next().value; if (firstKey !== undefined) this.store.delete(firstKey); } }
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
  private _sessionState: SessionState | null = null;
  private _depTracker: LongTermDependencyTracker | null = null;
  // v4.11.0: RL memory strategy selector
  private _strategySelector: MemoryStrategySelector;
  // v4.16.0: Self-refiner and prompt strategy controller
  private _refiner: SelfRefiner;
  private _promptStrategy: PromptStrategyController;
  // v4.17.0: Position optimizer and structured context handler
  private _positionOptimizer: PositionOptimizer;
  private _structuredHandler: StructuredContextHandler;
  private _multimodalHandler: MultimodalContextHandler;
  // v4.20.0: Auto-compact, auto-session, relevance scoring
  private _autoCompact: AutoCompactController;
  private _autoSession: AutoSessionController;
  private _relevanceScorer: RelevanceScorer;
  private _semanticCompressor: SemanticCompressor;
  // v5.0.0: Session resume manager
  private _sessionResume: SessionResumeManager | null = null;
  // v4.3.0: tiktoken | v4.4.0: drift | v4.5.0: smart budget | v4.7.0: state extractor | v4.9.0: dependency tracker

  constructor(config: ClawCtxConfig, logger: ClawCtxLogger, manager?: MemoryManager) {
    this.config = config; this.logger = logger;
    this.manager = manager ?? getMemoryManager({ workspace: config.workspaceDir || process.cwd(), autoDetect: false });
    this.budgetManager = new TokenBudgetManager();
    this.driftDetector = new DriftDetector();
    this._smartBudgetAllocator = new SmartBudgetAllocator();
    this._smartBudgetAllocator.setDriftDetector(this.driftDetector);
    // v4.11.0: RL strategy selector
    this._strategySelector = new MemoryStrategySelector();
    // v4.16.0: Self-refinement and prompt strategy
    this._refiner = new SelfRefiner();
    this._promptStrategy = new PromptStrategyController();
    // v4.17.0: Position optimization and structured context
    this._positionOptimizer = new PositionOptimizer();
    this._structuredHandler = new StructuredContextHandler();
    this._multimodalHandler = new MultimodalContextHandler();
    // v4.20.0
    this._autoCompact = new AutoCompactController();
    this._autoSession = new AutoSessionController();
    this._relevanceScorer = new RelevanceScorer();
    this._semanticCompressor = new SemanticCompressor();
    // v5.0.0: Session resume
    if (config.sessionResume !== false) {
      this._sessionResume = new SessionResumeManager(
        this.manager,
        config.sessionResume !== undefined
          ? { ...DEFAULT_SESSION_RESUME_CONFIG, ...config.sessionResume }
          : DEFAULT_SESSION_RESUME_CONFIG
      );
    }
  }

  private _session(id: string): void { if (this.sid !== id) { this.sid = id; this.manager.sessionId = id; } }

  async bootstrap(p: { sessionId: string; sessionKey?: string; sessionFile: string }): Promise<{ bootstrapped: boolean; importedMessages?: number; reason?: string }> {
    this._session(p.sessionId);
    try { this.manager.injectConstitution?.(); } catch { this.logger.warn("[claw-ctx] constitution skip"); }

    // v4.1.0: Session continuity — inject previous session context
    // v5.0.0: Replaced by SessionResumeManager
    let importedMessages = 0;
    if (this._sessionResume) {
      try {
        const resumeResult = await this._sessionResume.bootstrap(p.sessionId);
        if (resumeResult.historyLoaded) {
          importedMessages = resumeResult.sessionCount;
          this.logger.info(`[claw-ctx] Loaded ${resumeResult.sessionCount} previous session(s)`);
        }
      } catch (e) {
        this.logger.warn("[claw-ctx] session resume bootstrap failed:", e);
      }
    }

    return { bootstrapped: true, importedMessages, reason: "Claw Context bootstrapped" };
  }

  async ingest(p: { sessionId: string; sessionKey?: string; message: any; isHeartbeat?: boolean }): Promise<{ ingested: boolean }> {
    if (this.config.debug) this.logger.info(`[claw-ctx] ingest() called, sessionId=${p.sessionId}, role=${p.message?.role}`);
    if (p.isHeartbeat) return { ingested: false };
    this._session(p.sessionId);
    const c = extractText(p.message);
    if (!c || c.length < 20) return { ingested: false };
    try {
      this.manager.store(c, "episodic");

      // v4.7.0: Extract and merge session state
      const newState = SessionStateExtractor.extract([{ content: c, role: p.message.role }], p.sessionId);
      this._sessionState = this._sessionState
        ? SessionStateExtractor.merge(this._sessionState, newState)
        : newState;

      // v4.9.0: Feed dependency tracker
      if (this._depTracker) {
        this._depTracker.ingestFromSessionState({
          sessionId: p.sessionId,
          entities: newState.entities,
        });
      }

      return { ingested: true };
    } catch { return { ingested: false }; }
  }

  async ingestBatch(p: { sessionId: string; sessionKey?: string; messages: any[]; isHeartbeat?: boolean }): Promise<{ ingestedCount: number }> {
    if (this.config.debug) this.logger.info(`[claw-ctx] ingestBatch() called, sessionId=${p.sessionId}, messages=${p.messages?.length ?? 0}`);
    if (p.isHeartbeat) return { ingestedCount: 0 };
    this._session(p.sessionId);
    let n = 0;
    for (const m of p.messages) { const c = extractText(m); if (c && c.length >= 20) { try { this.manager.store(c, "episodic"); n++; } catch { /* skip */ } } }
    return { ingestedCount: n };
  }

  async assemble(p: { sessionId: string; sessionKey?: string; messages: any[]; tokenBudget?: number; availableTools?: Set<string>; citationsMode?: string; model?: string; prompt?: string; confidenceThreshold?: number; confidenceMode?: ConfidenceMode; crossDomain?: { enabled: boolean; currentPillar?: string; currentIntent?: string; timeRange?: string; maxSignals?: number }; ci?: { enabled: boolean; project?: string; includeBuildStatus?: boolean; includeTestResults?: boolean; includeDeployStatus?: boolean; maxSignals?: number } }): Promise<{ messages: any[]; estimatedTokens: number; systemPromptAddition?: string; promptAuthority?: string; confidenceReport?: ConfidenceReport; crossDomainReport?: { signalsInjected: number; totalTokens: number; correlations: InjectedSignal[] }; ciReport?: { signalsInjected: number; totalTokens: number; signals: CISignal[] }; driftScore?: number; autoCompact?: boolean; newSessionSuggestion?: string }> {
    if (this.config.debug) this.logger.info(`[claw-ctx] assemble() called, sessionId=${p.sessionId}, messages=${p.messages?.length ?? 0}, tokenBudget=${p.tokenBudget ?? 0}`);
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
    if (!mems.length) { try { const r = await this.manager.search(q, undefined, this.config.topK ?? 10); mems = (r as any)?.memories ?? r ?? []; if (Array.isArray(mems)) this.cache.set(q, mems); } catch (e) { this.logger.warn("[claw-ctx] search fail:", e); } }
    if (!Array.isArray(mems) || mems.length === 0) {
      // Still inject RL/governance/cross-domain/CI even without memories
      const additions = await this.injectExternalContext(p.sessionId);
      const crossDomainResult = await this.injectCrossDomainContext(p);
      if (crossDomainResult) additions.push(crossDomainResult.block);
      const ciResult = await this.injectCIContext(p);
      if (ciResult) additions.push(ciResult.block);
      let sys = additions.length ? additions.join("\n\n") : undefined;
      sys = this._injectSessionResume(sys);
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

    // v4.16.0: Prompt strategy injection
    let finalSys = driftAwareSys;
    try {
      const lastUserMsg = [...p.messages].reverse().find((m: any) => m.role === "user");
      const taskContent = extractText(lastUserMsg || p.messages[p.messages.length - 1] || "");
      const taskType = this._promptStrategy.detectTaskType(taskContent);
      const strategy = this._promptStrategy.selectStrategy({ taskType, content: taskContent });
      const strategyAddition = this._promptStrategy.getSystemPromptAddition(strategy);
      if (strategyAddition) {
        finalSys = finalSys
          ? `${finalSys}\n\n${strategyAddition}`
          : strategyAddition;
      }
    } catch {
      // prompt strategy failure is non-blocking
    }

    // v4.18.0: Multimodal content detection
    try {
      const multimodalItems = this._multimodalHandler.prioritize(p.messages);
      for (const item of multimodalItems.slice(0, 5)) {
        const text = this._multimodalHandler.modalityToText(item);
        if (text) {
          finalSys = finalSys
            ? `${finalSys}\n${text}`
            : text;
        }
      }
    } catch {
      // multimodal failure is non-blocking
    }

    // v4.17.0: Structured context detection and position optimization
    try {
      // Detect and verbalize structured data in recent messages
      const recentUserMsgs = p.messages.filter((m: any) => m.role === "user").slice(-2);
      for (const msg of recentUserMsgs) {
        const text = extractText(msg);
        const dataType = this._structuredHandler.detect(text);
        if (dataType && dataType !== "sql-result") {
          const verbalized = this._structuredHandler.verbalize(text, dataType);
          if (verbalized !== text) {
            finalSys = finalSys
              ? `${finalSys}\n\n${verbalized}`
              : verbalized;
          }
        }
      }
    } catch {
      // structured context failure is non-blocking
    }

    // v4.17.0: Position optimization for long sequences
    let resultMessages = p.messages;
    try {
      if (resultMessages.length > 10) {
        resultMessages = this._positionOptimizer.optimize(resultMessages);
      }
    } catch {
      // position optimization failure is non-blocking
    }

    // v4.19.0: Overflow detection — warn if approaching budget limit
    const budgetLimit = p.tokenBudget ?? 8000;
    if (tokens > budgetLimit * 0.85) {
      const overflowWarn = `[Token Budget Warning: ${tokens}/${budgetLimit} tokens used (${Math.round(tokens / budgetLimit * 100)}%) — consider compaction]`;
      finalSys = finalSys ? `${finalSys}\n\n${overflowWarn}` : overflowWarn;
    }

    // v4.20.0: Drift auto-response signals
    const driftScore = this.driftDetector.getDriftScore();
    const autoCompact = this._autoCompact.shouldCompact(driftScore);
    let newSessionSuggestion: string | undefined;
    if (this._autoSession.shouldSuggestNewSession(driftScore)) {
      newSessionSuggestion = this._autoSession.generateSuggestion();
      // Append suggestion to system prompt as well
      finalSys = finalSys
        ? `${finalSys}\n\n[Auto-Session] ${newSessionSuggestion}`
        : `[Auto-Session] ${newSessionSuggestion}`;
    }

    // v5.0.0: Session resume history injection
    finalSys = this._injectSessionResume(finalSys);

    return { messages: resultMessages, estimatedTokens: tokens, systemPromptAddition: finalSys, confidenceReport, crossDomainReport: crossDomainResult?.report, ciReport: ciResult?.report, driftScore, autoCompact, newSessionSuggestion };
  }

  async compact(p: { sessionId: string; sessionKey?: string; sessionFile: string; tokenBudget?: number; force?: boolean; currentTokenCount?: number; compactionTarget?: string; customInstructions?: string; abortSignal?: AbortSignal; reserveForCrossDomain?: number; reserveForCI?: number; runtimeContext?: any }): Promise<{ ok: boolean; compacted: boolean; reason?: string; result?: { summary?: string; tokensBefore: number; tokensAfter?: number; details?: unknown } }> {
    if (p.abortSignal?.aborted) return { ok: false, compacted: false, reason: "aborted" };
    this._session(p.sessionId);

    const sessionFile = p.sessionFile;
    if (!sessionFile || !fs.existsSync(sessionFile)) {
      const cur = p.currentTokenCount ?? 50000;
      const baseThreshold = this.config.compactThreshold ?? 100000;
      const crossDomainReserve = p.reserveForCrossDomain ?? 0;
      const ciReserve = p.reserveForCI ?? 0;
      const effectiveThreshold = baseThreshold - crossDomainReserve - ciReserve;
      if (!p.force && cur < effectiveThreshold) {
        return { ok: true, compacted: false, reason: `below threshold (${cur} < ${effectiveThreshold})`, result: { tokensBefore: cur, tokensAfter: cur } };
      }
      return { ok: false, compacted: false, reason: "session file not found" };
    }

    // tokenBudget from gateway = context window size (e.g. 204800)
    // Aim for ~75% of budget to leave room for non-message overhead + response
    const contextWindow = p.tokenBudget ?? this.config.compactThreshold ?? 200000;
    const targetTokens = Math.floor(contextWindow * 0.75);

    try {
      const result = await this._executeCompaction(sessionFile, targetTokens);
      if (!result.compacted) {
        return { ok: true, compacted: false, reason: result.reason, result: { tokensBefore: result.tokensBefore ?? 0, tokensAfter: result.tokensBefore ?? 0 } };
      }
      return {
        ok: true,
        compacted: true,
        result: {
          summary: result.summary,
          tokensBefore: result.tokensBefore,
          tokensAfter: result.tokensAfter,
          details: result.details,
        },
      };
    } catch (e: any) {
      this.logger.error("[claw-ctx] compaction failed:", e?.message ?? e);
      return { ok: false, compacted: false, reason: `compaction error: ${e?.message ?? e}` };
    }
  }

  /**
   * Real session compaction: read session file, keep recent messages,
   * summarize old ones, rewrite file. Returns the reduced file.
   */
  private async _executeCompaction(
    sessionFile: string,
    targetTokens: number
  ): Promise<{ compacted: boolean; reason?: string; summary: string; tokensBefore: number; tokensAfter?: number; details?: unknown }> {
    const lines = fs.readFileSync(sessionFile, "utf-8").split("\n").filter(l => l.trim());
    const entries: Array<{ line: string; type: string; message?: any }> = [];

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        entries.push({ line, type: obj.type ?? "unknown", message: obj.message });
      } catch {
        entries.push({ line, type: "unparseable" });
      }
    }

    // Separate header entries from message entries
    const headerTypes = new Set(["session", "model_change", "thinking_level_change", "custom", "custom_message"]);
    const headers = entries.filter(e => headerTypes.has(e.type));
    const msgEntries = entries.filter(e => e.type === "message");

    if (msgEntries.length === 0) {
      return { compacted: false, reason: "no messages to compact", summary: "", tokensBefore: 0 };
    }

    // Estimate tokens per message
    const msgTokens: number[] = [];
    let totalMsgTokens = 0;
    for (const e of msgEntries) {
      const t = this._estimateMessageTokens(e.message);
      msgTokens.push(t);
      totalMsgTokens += t;
    }

    if (totalMsgTokens <= targetTokens) {
      return { compacted: false, reason: `already under target (${totalMsgTokens} <= ${targetTokens})`, summary: "", tokensBefore: totalMsgTokens };
    }

    const useSemantic = this.config.compressionStrategy === "semantic";

    let keptMsgs: Array<{ line: string; type: string; message?: any }>;
    let summaryBlock: string;
    let removedCount: number;

    if (useSemantic) {
      // v4.22.0: Semantic compression — preserve important messages
      const result: CompressionResult = this._semanticCompressor.compress(
        msgEntries, msgTokens, targetTokens
      );
      keptMsgs = result.keptIndices.map(i => msgEntries[i]);
      removedCount = result.removedIndices.length;
      if (removedCount <= 10) {
        return { compacted: false, reason: `too few messages to remove (${removedCount})`, summary: "", tokensBefore: totalMsgTokens };
      }
      summaryBlock = result.summary;
    } else {
      // Legacy: walk from newest to oldest
      let acc = 0;
      let keepFrom = msgEntries.length;
      for (let i = msgEntries.length - 1; i >= 0; i--) {
        acc += msgTokens[i];
        if (acc > targetTokens) {
          keepFrom = Math.min(msgEntries.length, Math.max(20, i + 1));
          break;
        }
      }

      removedCount = keepFrom;
      if (removedCount <= 10) {
        return { compacted: false, reason: `too few messages to remove (${removedCount})`, summary: "", tokensBefore: totalMsgTokens };
      }

      const oldMsgs = msgEntries.slice(0, removedCount);
      summaryBlock = this._buildSummary(oldMsgs, removedCount);
      keptMsgs = msgEntries.slice(removedCount);
    }
    const lastHeader = headers.length > 0 ? headers[headers.length - 1] : entries[0];
    let lastHeaderId = "root";
    try { lastHeaderId = JSON.parse(lastHeader.line).id ?? "root"; } catch { /* ok */ }

    const newLines: string[] = [
      ...headers.map(h => h.line),
      JSON.stringify({ type: "message", id: this._makeId(), parentId: lastHeaderId, timestamp: new Date().toISOString(), message: { role: "user", content: summaryBlock } }),
      ...keptMsgs.map(m => m.line),
    ];

    // Atomic write
    const tmpFile = sessionFile + ".compact.tmp";
    fs.writeFileSync(tmpFile, newLines.join("\n") + "\n", "utf-8");
    fs.renameSync(tmpFile, sessionFile);

    const newTokens = keptMsgs.reduce((sum, _m, i) => sum + msgTokens[removedCount + i], 0) + estimateTokens(summaryBlock);
    this.logger.info(`[claw-ctx] COMPACT: ${msgEntries.length} msgs → ${keptMsgs.length + 1} msgs, ${totalMsgTokens} → ≈${newTokens} tokens`);

    return {
      compacted: true,
      summary: `Removed ${removedCount} old messages (kept ${keptMsgs.length} recent + 1 summary). Tokens: ${totalMsgTokens} → ≈${newTokens}`,
      tokensBefore: totalMsgTokens,
      tokensAfter: newTokens,
      details: { messagesBefore: msgEntries.length, messagesAfter: keptMsgs.length + 1, removedCount, tokensBefore: totalMsgTokens, tokensAfter: newTokens },
    };
  }

  /** Estimate tokens in a message, handling string and array content */
  private _estimateMessageTokens(msg: any): number {
    if (!msg) return 0;
    const content = msg.content;
    if (typeof content === "string") return estimateTokens(content);
    if (Array.isArray(content)) {
      let total = 0;
      for (const block of content) {
        if (typeof block === "string") { total += estimateTokens(block); }
        else if (block?.text) { total += estimateTokens(block.text); }
        else if (block?.input) { total += estimateTokens(JSON.stringify(block.input)); }
      }
      return total || 10; // minimum token cost for structured messages
    }
    return estimateTokens(String(content ?? ""));
  }

  /** Determine how many messages to keep from the end to stay under budget */
  private _computeKeepCount(msgTokens: number[], budget: number): number {
    let acc = 0;
    for (let i = msgTokens.length - 1; i >= 0; i--) {
      acc += msgTokens[i];
      if (acc > budget) {
        // Keep at least 20 messages
        const natural = msgTokens.length - i - 1;
        return Math.min(msgTokens.length, Math.max(20, natural));
      }
    }
    return msgTokens.length; // everything fits
  }

  /** Build a concise summary from old messages */
  private _buildSummary(oldMsgs: Array<{ message?: any }>, count: number): string {
    const topics = new Set<string>();
    const keywordSet = new Set([
      "code", "bug", "fix", "deploy", "test", "refactor", "build",
      "config", "error", "performance", "api", "database", "task",
      "version", "release", "review", "compile", "compact", "compaction",
      "context", "token", "memory", "session", "plugin", "gateway",
      "TypeScript", "openclaw", "claw-ctx", "claw-mem", "devclaw"
    ]);

    // Extract key topics from removed messages
    const lastUserMsgs: string[] = [];
    for (const entry of oldMsgs) {
      const msg = entry.message;
      if (!msg) continue;
      const role = msg.role;
      let text = "";
      const content = msg.content;
      if (typeof content === "string") { text = content; }
      else if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.text) text += block.text + " ";
        }
      }
      if (!text) continue;

      // Collect keywords
      for (const kw of keywordSet) {
        if (text.toLowerCase().includes(kw.toLowerCase())) {
          topics.add(kw);
        }
      }
      // Collect last few user messages for context
      if (role === "user" && lastUserMsgs.length < 5) {
        lastUserMsgs.push(text.slice(0, 200));
      }
    }

    const topicStr = topics.size > 0 ? [...topics].slice(0, 15).join(", ") : "general discussion";
    const userSummary = lastUserMsgs.length > 0
      ? `\nKey requests: ${lastUserMsgs.map(t => `"${t.slice(0, 100)}"`).join("; ")}`
      : "";

    return `[Compacted History — ${count} earlier messages summarized]\nTopics: ${topicStr}${userSummary}\n\nContinue with the current task using the remaining recent context below.`;
  }

  private _makeId(): string {
    return "ctxc-" + Math.random().toString(36).slice(2, 10);
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
    if (this.config.debug) this.logger.info(`[claw-ctx] afterTurn() called, sessionId=${p.sessionId}, messages=${p.messages?.length ?? 0}`);
    if (p.isHeartbeat) return;
    this._session(p.sessionId);
    if (p.autoCompactionSummary) { try { this.manager.store(p.autoCompactionSummary, "episodic", ["compaction"]); } catch { /* ok */ } }

    // v4.16.0: Self-refinement evaluation of last assistant message
    try {
      const msgs = p.messages || [];
      const lastAssistant = [...msgs].reverse().find((m: any) => m.role === "assistant");
      if (lastAssistant) {
        const content = extractText(lastAssistant);
        if (content && content.length > 20) {
          const result = this._refiner.run(content, msgs.map((m: any) => ({
            role: m.role || "unknown",
            content: extractText(m),
          })));
          if (!result.accepted && result.loops > 0) {
            this.logger.warn(`[claw-ctx] Self-refinement: output not accepted after ${result.loops} loops (score: ${result.evaluationScore})`);
          }
        }
      }
    } catch {
      // self-refinement failure is non-blocking
    }

    // v4.1.0: Store session summary for continuity
    // v5.0.0: Replaced by SessionResumeManager
    if (this._sessionResume) {
      try {
        await this._sessionResume.afterTurn(p.sessionId, p.messages, this._sessionState);
      } catch { /* best effort */ }
    }
  }

  async prepareSubagentSpawn(p: { parentSessionKey: string; childSessionKey: string; contextMode?: "isolated" | "fork"; parentSessionId?: string; parentSessionFile?: string; childSessionId?: string; childSessionFile?: string; ttlMs?: number }): Promise<{ rollback: () => void } | undefined> {
    const cid = p.childSessionId ?? p.childSessionKey;
    let prev: string | null = null;
    if (p.contextMode === "fork" && p.parentSessionId) { prev = this.sid; this.manager.sessionId = cid; } else { this.manager.sessionId = cid; }
    return { rollback: () => { if (prev) this.manager.sessionId = prev; } };
  }

  async onSubagentEnded(p: { childSessionKey: string; reason: "deleted" | "completed" | "swept" | "released" }): Promise<void> {
    if (p.reason === "completed") { try { const r = await this.manager.search("important", undefined, 5); if (Array.isArray(r)) for (const m of r) this.manager.store(`[subagent] ${(m.content as any)?.slice?.(0,200) ?? ""}`, "episodic", ["subagent"]); } catch { /* ok */ } }
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

  /** v4.9.0: Get or create the long-term dependency tracker */
  getDependencyTracker(): LongTermDependencyTracker {
    if (!this._depTracker) this._depTracker = new LongTermDependencyTracker();
    return this._depTracker;
  }

  /** v5.0.0: Get session resume manager */
  getSessionResumeManager(): SessionResumeManager | null {
    return this._sessionResume;
  }

  /** v4.9.0: Set a custom dependency tracker */
  setDependencyTracker(tracker: LongTermDependencyTracker): void {
    this._depTracker = tracker;
  }

  // ── v4.11.0: RL Memory Strategy Selection ──────────────────────────

  /** Select best memory recall strategy based on current context. */
  selectMemoryStrategy(context: {
    tokenBudget?: number;
    taskComplexity?: "simple" | "medium" | "complex";
  }): StrategyResult {
    const driftScore = this.getDriftScore();
    const budget = context.tokenBudget ?? 8000;

    return this._strategySelector.select({
      tokenBudget: budget,
      currentDrift: driftScore,
      taskComplexity: context.taskComplexity ?? "medium",
      sessionLength: 50, // default estimate
    });
  }

  /** Recall memories using the specified strategy. */
  recallWithStrategy(
    strategy: MemoryStrategy,
    query: string,
  ): Promise<any[]> {
    switch (strategy) {
      case "aggressive_recall":
        return this._recallAggressive(query);
      case "selective_recall":
        return this._recallSelective(query);
      case "minimal_context":
        return this._recallMinimal(query);
      case "drift_adaptive":
        return this._recallAdaptive(query);
    }
  }

  /** Record feedback for RL learning after strategy execution. */
  recordStrategyFeedback(strategy: MemoryStrategy, reward: number): void {
    this._strategySelector.recordFeedback(strategy, reward);
  }

  /** Get strategy selector stats. */
  getStrategyStats() {
    return this._strategySelector.getStats();
  }

  /** Reset strategy selector state. */
  resetStrategySelector(): void {
    this._strategySelector.reset();
  }

  private _recallAggressive(query: string): Promise<any[]> {
    return Promise.resolve(this.manager.search(query, undefined, 20) as any[] ?? []);
  }

  private _recallSelective(query: string): Promise<any[]> {
    const all = this.manager.search(query, undefined, 50) as any[];
    if (!Array.isArray(all)) return Promise.resolve([]);
    return Promise.resolve(all.filter((r: any) => (r.score ?? 0) >= 0.5));
  }

  private _recallMinimal(query: string): Promise<any[]> {
    return Promise.resolve(this.manager.search(query, undefined, 3) as any[] ?? []);
  }

  private _recallAdaptive(query: string): Promise<any[]> {
    const driftScore = this.getDriftScore();
    const topK = driftScore > 0.5 ? 12 : 6;
    return Promise.resolve(this.manager.search(query, undefined, topK) as any[] ?? []);
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

  /** v5.0.0: Inject session resume history into system prompt. */
  private _injectSessionResume(sys: string | undefined): string | undefined {
    if (!this._sessionResume) return sys;
    try {
      const historySection = this._sessionResume.assemble();
      if (historySection) {
        return sys ? `${sys}\n\n${historySection}` : historySection;
      }
    } catch {
      // session resume assembly is non-blocking
    }
    return sys;
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

  // ── v4.7.0: Session State ────────────────────────────────────────

  /** Get current session state */
  getSessionState(): SessionState | null {
    return this._sessionState;
  }

  /** Get key entities from session state */
  getKeyEntities(): Record<string, Entity[]> {
    if (!this._sessionState) return { person: [], tool: [], concept: [], file: [], project: [], other: [] };
    return SessionStateExtractor.getKeyEntities(this._sessionState) as Record<string, Entity[]>;
  }

  // ── v4.10.0: Health Check ──────────────────────────────────────

  /** Health check: returns status and metrics for monitoring. */
  healthCheck(): { status: "healthy" | "degraded" | "unhealthy"; score: number; checks: Record<string, boolean>; metrics: Record<string, number> } {
    const checks: Record<string, boolean> = {};
    const metrics: Record<string, number> = {};

    // Token counter health
    try {
      const testResult = this._tokenCounter.count("health check test");
      checks.tokenCounter = testResult.tokens > 0;
      metrics.tokenCountLatency = testResult.tokens;
    } catch {
      checks.tokenCounter = false;
    }

    // Memory manager health
    try {
      const mem = this.manager as any;
      checks.memoryManager = !!mem;
      metrics.hasSession = this.sid ? 1 : 0;
    } catch {
      checks.memoryManager = false;
    }

    // Drift detector health
    checks.driftDetector = this.driftDetector !== null;
    metrics.driftScore = this.getDriftScore();

    // Dependency tracker health
    if (this._depTracker) {
      const stats = this._depTracker.getStats();
      checks.dependencyTracker = true;
      metrics.trackedEntities = stats.entitiesTracked;
      metrics.trackedSessions = stats.sessions;
    } else {
      checks.dependencyTracker = false;
    }

    // Token cache health
    metrics.tokenCacheSize = tokenCache.size;
    checks.tokenCache = true;

    // Compute overall health score
    const passedChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;
    const score = totalChecks > 0 ? passedChecks / totalChecks : 0;

    let status: "healthy" | "degraded" | "unhealthy";
    if (score >= 0.8) status = "healthy";
    else if (score >= 0.5) status = "degraded";
    else status = "unhealthy";

    return { status, score, checks, metrics };
  }
}

export function createClawContextEngine(config: ClawCtxConfig, logger: ClawCtxLogger, manager?: MemoryManager): ClawContextEngine {
  return new ClawContextEngine(config, logger, manager);
}

export type { StrategyStats } from './memory_strategy_selector.js';

