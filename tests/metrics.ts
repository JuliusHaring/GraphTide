import { Logger } from "../src/utils/logger.js";

export type CaseMetric = {
  id: string;
  method: string;
  score: number;
  passed: boolean;
  reason: string;
};

export class EvalMetrics {
  private readonly cases: CaseMetric[] = [];

  add(metric: CaseMetric): void {
    this.cases.push(metric);
  }

  summary() {
    const total = this.cases.length;
    const passed = this.cases.filter((entry) => entry.passed).length;
    const avgScore =
      total === 0 ? 0 : this.cases.reduce((sum, entry) => sum + entry.score, 0) / total;

    return {
      total,
      passed,
      failed: total - passed,
      passRate: total === 0 ? 0 : passed / total,
      avgScore,
      cases: this.cases,
    };
  }

  print(log: Logger): void {
    const summary = this.summary();

    log.info("Eval metrics", {
      total: summary.total,
      passed: summary.passed,
      failed: summary.failed,
      passRate: summary.passRate.toFixed(2),
      avgScore: summary.avgScore.toFixed(2),
    });

    for (const entry of summary.cases) {
      log.info("Case result", {
        id: entry.id,
        method: entry.method,
        score: entry.score.toFixed(2),
        passed: entry.passed,
        reason: entry.reason,
      });
    }
  }
}
