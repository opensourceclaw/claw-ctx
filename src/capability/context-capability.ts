/** claw-ctx v6.0.0 — ContextCapability Implementation */

import { ClawContextEngine } from "../engine.js";
import type {
  IContextCapability, BootstrapParams, BootstrapResult,
  IngestParams, AssembleParams, AssembleResult,
  CompactParams, CompactResult,
} from "./types.js";

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

export class ContextCapability implements IContextCapability {
  readonly name = "context" as const;
  readonly version = "6.0.0";

  private engine: ClawContextEngine;
  private disposed = false;

  constructor(config?: Record<string, unknown>) {
    this.engine = new ClawContextEngine(
      (config ?? {}) as any,
      noopLogger as any,
    );
  }

  async bootstrap(params: BootstrapParams): Promise<BootstrapResult> {
    this.checkDisposed();
    return this.engine.bootstrap(params);
  }

  async ingest(params: IngestParams): Promise<{ ingested: boolean }> {
    this.checkDisposed();
    return this.engine.ingest(params as any);
  }

  async assemble(params: AssembleParams): Promise<AssembleResult> {
    this.checkDisposed();
    return this.engine.assemble({
      ...params,
      messages: params.messages ?? [],
    } as any) as Promise<AssembleResult>;
  }

  async compact(params: CompactParams): Promise<CompactResult> {
    this.checkDisposed();
    return this.engine.compact(params as any) as Promise<CompactResult>;
  }

  async closeSession(sessionId: string): Promise<void> {
    this.checkDisposed();
    await this.engine.closeSession(sessionId);
  }

  async healthCheck(): Promise<{ status: string; score: number }> {
    this.checkDisposed();
    const hc = this.engine.healthCheck();
    return { status: hc.status, score: hc.score };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    await this.engine.dispose();
    this.disposed = true;
  }

  private checkDisposed(): void {
    if (this.disposed) throw new Error("ContextCapability disposed");
  }
}
