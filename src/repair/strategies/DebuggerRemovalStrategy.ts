import type { CodeIssue, RepairAction } from '../../types';
import type { RepairStrategy } from '../RepairStrategy';

/**
 * Removes bare `debugger;` statements.
 */
export class DebuggerRemovalStrategy implements RepairStrategy {
  readonly name = 'DebuggerRemovalStrategy';

  canHandle(issue: CodeIssue): boolean {
    return issue.category === 'dead-code' && issue.message.includes('debugger statement');
  }

  async propose(issue: CodeIssue, fileContent: string): Promise<RepairAction[]> {
    const lines = fileContent.split('\n');
    const lineIdx = (issue.location.line ?? 1) - 1;
    const line = lines[lineIdx] ?? '';

    if (!/\bdebugger\s*;/.test(line)) return [];

    return [
      {
        issueId: issue.id,
        description: `Remove debugger statement on line ${issue.location.line}`,
        edits: [
          {
            location: issue.location,
            type: 'delete',
            oldText: line,
            newText: '',
          },
        ],
        confidence: 0.98,
        requiresReview: false,
        strategyName: this.name,
      },
    ];
  }
}
