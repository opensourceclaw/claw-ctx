/** claw-ctx v6.0.0 — Capability Layer Types */

export interface BootstrapParams {
  sessionId: string;
  sessionKey?: string;
  sessionFile: string;
  memoryReady?: boolean;
}

export interface BootstrapResult {
  bootstrapped: boolean;
  importedMessages?: number;
  reason?: string;
  memoryOk?: boolean;
  contextOk?: boolean;
}

export interface IngestParams {
  sessionId: string;
  sessionKey?: string;
  message: unknown;
  isHeartbeat?: boolean;
}

export interface AssembleParams {
  sessionId: string;
  systemPrompt?: string;
  messages?: unknown[];
  tokenBudget?: number;
  model?: string;
}

export interface AssembleResult {
  messages: unknown[];
  estimatedTokens: number;
  confidenceReport?: unknown;
  crossDomainReport?: unknown;
  ciReport?: unknown;
  driftScore?: number;
  autoCompact?: boolean;
  newSessionSuggestion?: boolean;
}

export interface CompactParams {
  sessionId: string;
  targetTokens?: number;
  targetBudget?: number;
  strategy?: "aggressive" | "balanced" | "conservative";
  force?: boolean;
}

export interface CompactResult {
  ok: boolean;
  compacted?: boolean;
  reason?: string;
  originalTokens?: number;
  compressedTokens?: number;
  removedMessages?: number;
  duration?: number;
}

export interface IContextCapability {
  readonly name: "context";
  readonly version: string;

  bootstrap(params: BootstrapParams): Promise<BootstrapResult>;
  ingest(params: IngestParams): Promise<{ ingested: boolean }>;
  assemble(params: AssembleParams): Promise<AssembleResult>;
  compact(params: CompactParams): Promise<CompactResult>;
  closeSession(sessionId: string): Promise<void>;
  healthCheck(): Promise<{ status: string; score: number }>;
  dispose(): Promise<void>;
}
