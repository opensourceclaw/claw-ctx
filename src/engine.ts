/**
 * claw-ctx v1.0.0 — Context Engine
 *
 * Standalone Context Engine plugin. Uses claw-mem MemoryManager for storage/retrieval.
 */
import { getMemoryManager, type MemoryManager } from "../../claw-mem/claw_mem_plugin/dist/src/memory_manager";

interface ClawCtxConfig { workspaceDir?: string; topK?: number; debug?: boolean }
interface ClawCtxLogger { info: (...a: any[]) => void; error: (...a: any[]) => void; warn: (...a: any[]) => void; debug?: (...a: any[]) => void }

function extractText(msg: any): string {
  if (!msg) return "";
  const c = msg.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((b: any) => typeof b === "string" ? b : b?.text ?? b?.thinking ?? "").join(" ");
  return String(c ?? "");
}

function estimateTokens(text: string): number {
  let t = 0;
  for (const ch of text) t += /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch) ? 1 : 1 / 3.5;
  return Math.ceil(t);
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

const INFO = { id: "claw-ctx", name: "Claw Context Engine", version: "1.0.0", ownsCompaction: false, turnMaintenanceMode: "foreground" as const, hostRequirements: {} };

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

  constructor(config: ClawCtxConfig, logger: ClawCtxLogger, manager?: MemoryManager) {
    this.config = config; this.logger = logger;
    this.manager = manager ?? getMemoryManager({ workspace: config.workspaceDir || process.cwd(), autoDetect: false });
  }

  private _session(id: string): void { if (this.sid !== id) { this.sid = id; this.manager.sessionId = id; } }

  async bootstrap(p: { sessionId: string; sessionKey?: string; sessionFile: string }): Promise<{ bootstrapped: boolean; importedMessages?: number; reason?: string }> {
    this._session(p.sessionId);
    try { this.manager.injectConstitution?.(); } catch { this.logger.warn("[claw-ctx] constitution skip"); }
    return { bootstrapped: true, importedMessages: 0, reason: "Claw Context bootstrapped" };
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

  async assemble(p: { sessionId: string; sessionKey?: string; messages: any[]; tokenBudget?: number; availableTools?: Set<string>; citationsMode?: string; model?: string; prompt?: string }): Promise<{ messages: any[]; estimatedTokens: number; systemPromptAddition?: string; promptAuthority?: string }> {
    this._session(p.sessionId);
    const q = p.prompt || extractText(p.messages[p.messages.length - 1]) || "";
    const budget = p.tokenBudget ?? 4000;
    let mems: any[] = this.cache.get(q) ?? [];
    if (!mems.length) { try { const r = this.manager.search(q, undefined, this.config.topK ?? 10); mems = (r as any)?.memories ?? r ?? []; if (Array.isArray(mems)) this.cache.set(q, mems); } catch (e) { this.logger.warn("[claw-ctx] search fail:", e); } }
    if (!Array.isArray(mems) || mems.length === 0) return { messages: p.messages, estimatedTokens: 0 };
    const items: ScoredItem[] = mems.filter((m: any) => (m.score ?? 0) >= 0.3).map((m: any) => ({ content: m.content ?? "", score: m.score ?? 0 }));
    const sel = selectByBudget(items, budget);
    const tokens = sel.reduce((s, m) => s + estimateTokens(m.content), 0);
    const lines = sel.map((m) => `- ${m.content}`);
    const sys = lines.length ? `[Context] Relevant memories:\n${lines.join("\n")}` : undefined;
    return { messages: p.messages, estimatedTokens: tokens, systemPromptAddition: sys };
  }

  async compact(p: { sessionId: string; sessionKey?: string; sessionFile: string; tokenBudget?: number; force?: boolean; currentTokenCount?: number; compactionTarget?: string; customInstructions?: string; abortSignal?: AbortSignal }): Promise<{ ok: boolean; compacted: boolean; reason?: string; result?: { summary?: string; tokensBefore: number; tokensAfter?: number; details?: unknown } }> {
    if (p.abortSignal?.aborted) return { ok: false, compacted: false, reason: "aborted" };
    this._session(p.sessionId);
    const cur = p.currentTokenCount ?? 50000;
    if (!p.force && cur < 80000) return { ok: true, compacted: false, reason: "below threshold" };
    return { ok: true, compacted: true, result: { summary: "Claw Context compaction", tokensBefore: cur } };
  }

  async maintain(p: { sessionId: string; sessionKey?: string; sessionFile: string; runtimeContext?: Record<string, unknown> }): Promise<{ changed: boolean; bytesFreed: number; rewrittenEntries: number }> {
    this._session(p.sessionId);
    try { const mem = this.manager as any; if (mem.decayEngine) { const r = mem.decayEngine.runCycle(); return { changed: (r.evicted ?? 0) > 0, bytesFreed: (r.evicted ?? 0) * 500, rewrittenEntries: 0 }; } } catch { /* ok */ }
    return { changed: false, bytesFreed: 0, rewrittenEntries: 0 };
  }

  async afterTurn(p: { sessionId: string; sessionKey?: string; sessionFile: string; messages: any[]; prePromptMessageCount: number; autoCompactionSummary?: string; isHeartbeat?: boolean; tokenBudget?: number }): Promise<void> {
    if (p.isHeartbeat) return;
    this._session(p.sessionId);
    if (p.autoCompactionSummary) { try { this.manager.store(p.autoCompactionSummary, "episodic", ["compaction"]); } catch { /* ok */ } }
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

  async dispose(): Promise<void> { this.sid = null; this.cache = new SearchCache(30000); }
}

export function createClawContextEngine(config: ClawCtxConfig, logger: ClawCtxLogger, manager?: MemoryManager): ClawContextEngine {
  return new ClawContextEngine(config, logger, manager);
}
