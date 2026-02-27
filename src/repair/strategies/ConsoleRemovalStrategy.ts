import { randomUUID } from 'crypto';
import type { CodeIssue, RepairAction } from '../../types';
import type { RepairStrategy } from '../RepairStrategy';

/**
 * Removes console.log / console.debug / console.info statements.
 * High-confidence, fully automated.
 */
export class ConsoleRemovalStrategy implements RepairStrategy {
  readonly name = 'ConsoleRemovalStrategy';

  canHandle(issue: CodeIssue): boolean {
    return (
      issue.category === 'dead-code' &&
      issue.fixable &&
      issue.message.includes('console statement')
    );
  }

  async propose(issue: CodeIssue, fileContent: string): Promise<RepairAction[]> {
    const lines = fileContent.split('\n');
    const lineIdx = (issue.location.line ?? 1) - 1;
    const line = lines[lineIdx] ?? '';

    // Match the console call (handles multi-line calls on a single line heuristically)
    const re = /\s*console\.(log|debug|info|warn)\([^)]*\);?\s*/;
    if (!re.test(line)) return [];

    return [
      {
        issueId: issue.id,
        description: `Remove console statement on line ${issue.location.line}`,
        edits: [
          {
            location: issue.location,
            type: 'delete',
            oldText: line,
            newText: '',
          },
        ],
        confidence: 0.95,
        requiresReview: false,
        strategyName: this.name,
      },
    ];
  }
}
