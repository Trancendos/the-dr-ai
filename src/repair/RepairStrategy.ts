import type { CodeIssue, RepairAction } from '../types';

/**
 * Base interface every repair strategy must implement.
 * A strategy inspects a single CodeIssue and returns zero or more
 * RepairActions ordered by descending confidence.
 */
export interface RepairStrategy {
  /** Human-readable name shown in logs and reports. */
  readonly name: string;

  /** Returns true when this strategy knows how to handle the given issue. */
  canHandle(issue: CodeIssue): boolean;

  /** Produce one or more repair actions for the issue. */
  propose(issue: CodeIssue, fileContent: string): Promise<RepairAction[]>;
}
