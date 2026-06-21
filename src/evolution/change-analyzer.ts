import type { ContextSnapshot, ContextItem, ChangeReport, ModifiedItem } from "./types.js";

/** ChangePatternAnalyzer — diff context snapshots and analyze evolution patterns. */
export class ChangePatternAnalyzer {
  diff(previous: ContextSnapshot, current: ContextSnapshot): ChangeReport {
    const currMap = new Map(current.output.selectedItems.map((i) => [this.itemKey(i), i]));
    const prevMap = new Map(previous.output.selectedItems.map((i) => [this.itemKey(i), i]));

    const additions: ContextItem[] = [];
    const deletions: string[] = [];
    const modifications: ModifiedItem[] = [];
    let unchanged = 0;

    for (const [key, item] of currMap) {
      const prev = prevMap.get(key);
      if (!prev) {
        additions.push(item);
      } else if (Math.abs(prev.score - item.score) > 0.01) {
        // ponytail: 0.01 delta threshold filters float noise
        modifications.push({
          key,
          previousScore: prev.score,
          currentScore: item.score,
          delta: item.score - prev.score,
        });
      } else {
        unchanged++;
      }
    }

    for (const key of prevMap.keys()) {
      if (!currMap.has(key)) deletions.push(key);
    }

    const total = currMap.size + deletions.length;
    const stability = total > 0 ? unchanged / total : 1;

    return {
      additions,
      deletions,
      modifications,
      stability,
      timestamp: current.timestamp,
    };
  }

  analyzeSeries(snapshots: ContextSnapshot[]): {
    totalSnapshots: number;
    avgStability: number;
    frequentAdditions: Array<{ key: string; count: number }>;
    frequentDeletions: Array<{ key: string; count: number }>;
    volatilityTrend: Array<{ index: number; stability: number }>;
  } {
    if (snapshots.length < 2) {
      return {
        totalSnapshots: snapshots.length,
        avgStability: 1,
        frequentAdditions: [],
        frequentDeletions: [],
        volatilityTrend: [],
      };
    }

    const addCounts = new Map<string, number>();
    const delCounts = new Map<string, number>();
    let totalStability = 0;
    const trend: Array<{ index: number; stability: number }> = [];

    for (let i = 1; i < snapshots.length; i++) {
      const report = this.diff(snapshots[i - 1], snapshots[i]);
      totalStability += report.stability;
      trend.push({ index: i, stability: report.stability });

      for (const a of report.additions) {
        const key = this.itemKey(a);
        addCounts.set(key, (addCounts.get(key) ?? 0) + 1);
      }
      for (const d of report.deletions) {
        delCounts.set(d, (delCounts.get(d) ?? 0) + 1);
      }
    }

    const n = snapshots.length - 1;
    return {
      totalSnapshots: snapshots.length,
      avgStability: totalStability / n,
      frequentAdditions: [...addCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([key, count]) => ({ key, count })),
      frequentDeletions: [...delCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([key, count]) => ({ key, count })),
      volatilityTrend: trend,
    };
  }

  private itemKey(item: ContextItem): string {
    return item.content.slice(0, 40).toLowerCase().trim();
  }
}
