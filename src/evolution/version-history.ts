import type { ContextSnapshot, ContextStrategy } from "./types.js";

/** VersionHistory — in-memory snapshot store with sliding window. */
export class VersionHistory {
  private snapshots: ContextSnapshot[] = [];
  private maxSnapshots = 200; // ponytail: keep last 200; upgrade to file-backed if persistence needed

  append(snapshot: ContextSnapshot): void {
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  getLatest(): ContextSnapshot | undefined {
    return this.snapshots[this.snapshots.length - 1];
  }

  getBySession(sessionId: string): ContextSnapshot[] {
    return this.snapshots.filter((s) => s.sessionId === sessionId);
  }

  getByTimeRange(start: number, end: number): ContextSnapshot[] {
    return this.snapshots.filter((s) => s.timestamp >= start && s.timestamp <= end);
  }

  getByStrategy(strategy: ContextStrategy): ContextSnapshot[] {
    return this.snapshots.filter((s) => s.strategy === strategy);
  }

  getAll(): ContextSnapshot[] {
    return [...this.snapshots];
  }

  size(): number {
    return this.snapshots.length;
  }

  export(): string {
    return JSON.stringify(this.snapshots, null, 2);
  }

  reset(): void {
    this.snapshots = [];
  }
}
