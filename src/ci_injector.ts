/**
 * claw-ctx — Context Engine for OpenClaw
 *
 * Copyright 2026 Peter Cheng
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
 * claw-ctx v4.0.0 — CI/CD Signal Injector
 *
 * Injects CI/CD pipeline signals into context assembly.
 * Supports build, test, deploy, and error signals from various CI providers.
 */
export type CISignalType = "build" | "test" | "deploy" | "error";
export type CISignalStatus = "success" | "failure" | "pending" | "running";

export interface CISignal {
  type: CISignalType;
  status: CISignalStatus;
  message: string;
  timestamp: Date;
  branch?: string;
  commit?: string;
  url?: string;
  tokenCount: number;
}

export interface CIInjectRequest {
  sessionId: string;
  project?: string;
  includeBuildStatus?: boolean;
  includeTestResults?: boolean;
  includeDeployStatus?: boolean;
  maxSignals?: number;
}

export interface CIInjectResponse {
  signals: CISignal[];
  totalTokens: number;
}

/**
 * Provider interface for CI/CD signals.
 * Production implementations: GitHubActionsProvider, JenkinsProvider, GitLabCIProvider.
 */
export interface CIProvider {
  getBuildStatus(project: string): Promise<CISignal[]>;
  getTestResults(project: string): Promise<CISignal[]>;
  getDeployStatus(project: string): Promise<CISignal[]>;
}

/** Noop provider */
class NoopCIProvider implements CIProvider {
  async getBuildStatus(): Promise<CISignal[]> { return []; }
  async getTestResults(): Promise<CISignal[]> { return []; }
  async getDeployStatus(): Promise<CISignal[]> { return []; }
}

/** Mock provider for testing */
export class MockCIProvider implements CIProvider {
  private builds: CISignal[] = [];
  private tests: CISignal[] = [];
  private deploys: CISignal[] = [];

  async getBuildStatus(): Promise<CISignal[]> { return [...this.builds]; }
  async getTestResults(): Promise<CISignal[]> { return [...this.tests]; }
  async getDeployStatus(): Promise<CISignal[]> { return [...this.deploys]; }

  addBuild(signal: CISignal): void { this.builds.push(signal); }
  addTestResult(signal: CISignal): void { this.tests.push(signal); }
  addDeploy(signal: CISignal): void { this.deploys.push(signal); }
  clear(): void { this.builds = []; this.tests = []; this.deploys = []; }
}

function estimateTokens(text: string): number {
  let t = 0;
  for (const ch of text) {
    t += /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch) ? 1 : 1 / 3.5;
  }
  return Math.ceil(t);
}

const STATUS_ICONS: Record<CISignalStatus, string> = {
  success: "🟢",
  failure: "🔴",
  pending: "🟡",
  running: "🔵",
};

const TYPE_LABELS: Record<CISignalType, string> = {
  build: "Build",
  test: "Test",
  deploy: "Deploy",
  error: "Error",
};

export class CIInjector {
  private provider: CIProvider;

  constructor(provider?: CIProvider) {
    this.provider = provider ?? new NoopCIProvider();
  }

  /**
   * Inject CI/CD signals into context.
   */
  async inject(params: CIInjectRequest): Promise<CIInjectResponse> {
    const signals: CISignal[] = [];

    if (params.includeBuildStatus !== false) {
      signals.push(...(await this.provider.getBuildStatus(params.project ?? "")));
    }
    if (params.includeTestResults !== false) {
      signals.push(...(await this.provider.getTestResults(params.project ?? "")));
    }
    if (params.includeDeployStatus === true) {
      signals.push(...(await this.provider.getDeployStatus(params.project ?? "")));
    }

    // Calculate token counts
    for (const sig of signals) {
      sig.tokenCount = estimateTokens(sig.message) + estimateTokens(sig.branch ?? "") + 20; // icon + label overhead
    }

    // Sort: failures first, then by timestamp descending
    signals.sort((a, b) => {
      if (a.status === "failure" && b.status !== "failure") return -1;
      if (b.status === "failure" && a.status !== "failure") return 1;
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

    const max = params.maxSignals ?? 5;
    const limited = signals.slice(0, max);
    const totalTokens = limited.reduce((s, sig) => s + sig.tokenCount, 0);

    return { signals: limited, totalTokens };
  }

  /**
   * Format CI signals as context text.
   * Failures highlighted with explicit fix guidance.
   */
  formatForContext(signals: CISignal[]): string {
    if (signals.length === 0) return "";

    const lines: string[] = ["[CI/CD Pipeline Status]"];

    for (const sig of signals) {
      const icon = STATUS_ICONS[sig.status] ?? "⚪";
      const label = TYPE_LABELS[sig.type] ?? sig.type;
      const branchInfo = sig.branch ? ` (${sig.branch})` : "";
      const commitInfo = sig.commit ? ` [${sig.commit.slice(0, 7)}]` : "";

      let line = `  ${icon} ${label}${branchInfo}${commitInfo}: ${sig.message}`;

      if (sig.status === "failure" && sig.type === "test") {
        // Add implicit guidance for test failures
        line += `\n     ↳ Action: Review failing tests and fix before next commit.`;
      } else if (sig.status === "failure" && sig.type === "build") {
        line += `\n     ↳ Action: Check build error above, fix compilation/type issues.`;
      }

      if (sig.url) {
        line += `\n     🔗 ${sig.url}`;
      }

      lines.push(line);
    }

    return lines.join("\n");
  }

  /** Replace the provider at runtime */
  setProvider(provider: CIProvider): void {
    this.provider = provider;
  }
}
