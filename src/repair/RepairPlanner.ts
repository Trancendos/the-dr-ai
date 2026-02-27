import * as fs from 'fs';
import type { CodeIssue, DiagnosticReport, RepairAction, Severity } from '../types';
import type { RepairStrategy } from './RepairStrategy';
import { ConsoleRemovalStrategy } from './strategies/ConsoleRemovalStrategy';
import { DebuggerRemovalStrategy } from './strategies/DebuggerRemovalStrategy';
import { SecurityAdvisoryStrategy } from './strategies/SecurityAdvisoryStrategy';

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

/**
 * RepairPlanner
 * Iterates over all issues in a DiagnosticReport, finds applicable strategies,
 * and returns an ordered list of RepairActions (highest priority first).
 */
export class RepairPlanner {
  private strategies: RepairStrategy[];

  constructor(extraStrategies: RepairStrategy[] = []) {
    // Built-in strategies — append custom ones last
    this.strategies = [
      new DebuggerRemovalStrategy(),
      new ConsoleRemovalStrategy(),
      new SecurityAdvisoryStrategy(),
      ...extraStrategies,
    ];
  }

  registerStrategy(strategy: RepairStrategy): void {
    this.strategies.push(strategy);
  }

  async plan(report: DiagnosticReport): Promise<RepairAction[]> {
    const allActions: RepairAction[] = [];

    // Sort issues by severity so critical ones are planned first
    const sorted = [...report.issues].sort(
      (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
    );

    for (const issue of sorted) {
      const actions = await this.proposeForIssue(issue);
      allActions.push(...actions);
    }

    return allActions;
  }

  private async proposeForIssue(issue: CodeIssue): Promise<RepairAction[]> {
    const fileContent = this.safeReadFile(issue.location.file);
    const results: RepairAction[] = [];

    for (const strategy of this.strategies) {
      if (strategy.canHandle(issue)) {
        const actions = await strategy.propose(issue, fileContent);
        results.push(...actions);
      }
    }

    // Return actions sorted by descending confidence
    return results.sort((a, b) => b.confidence - a.confidence);
  }

  private safeReadFile(filePath: string): string {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch {
      return '';
    }
  }
}
