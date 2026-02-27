import type { CodeIssue, RepairAction } from '../../types';
import type { RepairStrategy } from '../RepairStrategy';

/**
 * Provides advisory repair actions for security issues.
 * Does NOT auto-apply because security fixes require domain knowledge.
 * Instead it produces a high-quality comment with guidance.
 */
export class SecurityAdvisoryStrategy implements RepairStrategy {
  readonly name = 'SecurityAdvisoryStrategy';

  private static readonly GUIDANCE: Record<string, string> = {
    'eval()': 'Replace eval() with JSON.parse() for data, or use a sandboxed VM module.',
    'Function construction': 'Avoid dynamic Function(). Use explicit function definitions.',
    'innerHTML': 'Use textContent for plain text. For HTML, sanitize with DOMPurify first.',
    'hardcoded secret': 'Move secrets to environment variables and load via process.env or a secrets manager.',
    'command injection': 'Use parameterized commands (e.g. execFile with an args array) instead of template literals.',
    'SQL injection': 'Use parameterized queries / prepared statements instead of string concatenation.',
    'XSS': 'Sanitize all user-controlled output before rendering to the DOM.',
  };

  canHandle(issue: CodeIssue): boolean {
    return issue.category === 'security';
  }

  async propose(issue: CodeIssue, _fileContent: string): Promise<RepairAction[]> {
    const guidance = this.matchGuidance(issue.message);

    return [
      {
        issueId: issue.id,
        description: `[Security Advisory] ${issue.message}`,
        edits: [
          {
            location: issue.location,
            type: 'insert',
            newText: `// ⚠️  SECURITY: ${guidance}`,
          },
        ],
        confidence: 0.5,
        requiresReview: true,  // always require human review for security
        strategyName: this.name,
      },
    ];
  }

  private matchGuidance(message: string): string {
    for (const [key, advice] of Object.entries(SecurityAdvisoryStrategy.GUIDANCE)) {
      if (message.toLowerCase().includes(key.toLowerCase())) return advice;
    }
    return 'Review and remediate this security issue before deploying.';
  }
}
