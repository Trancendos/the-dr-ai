import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type {
  CodeIssue,
  DiagnosticReport,
  IssueCategory,
  Language,
  Severity,
} from '../types';

/**
 * DiagnosticEngine — analyses source files and produces a list of CodeIssues.
 *
 * Built-in passes (no external tools required):
 *  1. Language detection
 *  2. Syntax-level heuristics (unmatched brackets, common mistakes)
 *  3. Dead-code patterns (console.log, TODO markers left behind, etc.)
 *  4. Security patterns (eval, hardcoded secrets, SQL concatenation)
 *  5. Complexity heuristics (deeply nested blocks)
 *
 * Pluggable: external linters / compilers can push additional issues via
 * `ingestExternalIssues()`.
 */
export class DiagnosticEngine {
  private static readonly LANGUAGE_MAP: Record<string, Language> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.css': 'css',
    '.html': 'html',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
  };

  // ─── Public API ────────────────────────────────────────────────────────────

  async analyse(filePaths: string[]): Promise<DiagnosticReport> {
    const start = Date.now();
    const reportId = randomUUID();
    const allIssues: CodeIssue[] = [];

    for (const filePath of filePaths) {
      const issues = await this.analyseFile(filePath);
      allIssues.push(...issues);
    }

    const language = this.detectDominantLanguage(filePaths);

    return {
      id: reportId,
      timestamp: new Date(),
      files: filePaths,
      language,
      issues: allIssues,
      summary: this.buildSummary(allIssues),
      durationMs: Date.now() - start,
    };
  }

  /** Allow external tools (eslint, tsc, pylint, etc.) to push their findings in. */
  ingestExternalIssues(report: DiagnosticReport, external: CodeIssue[]): DiagnosticReport {
    const merged = [...report.issues, ...external];
    return {
      ...report,
      issues: merged,
      summary: this.buildSummary(merged),
    };
  }

  // ─── File-level analysis ───────────────────────────────────────────────────

  private async analyseFile(filePath: string): Promise<CodeIssue[]> {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return [{
        id: randomUUID(),
        category: 'syntax',
        severity: 'high',
        message: `Cannot read file: ${filePath}`,
        location: { file: filePath },
        fixable: false,
      }];
    }

    const issues: CodeIssue[] = [];
    const lines = content.split('\n');

    issues.push(...this.checkBracketBalance(filePath, content));
    issues.push(...this.checkDeadCode(filePath, lines));
    issues.push(...this.checkSecurityPatterns(filePath, lines));
    issues.push(...this.checkComplexity(filePath, lines));
    issues.push(...this.checkTodoMarkers(filePath, lines));

    return issues;
  }

  // ─── Passes ───────────────────────────────────────────────────────────────

  private checkBracketBalance(file: string, content: string): CodeIssue[] {
    const issues: CodeIssue[] = [];
    const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
    const stack: Array<{ char: string; line: number; col: number }> = [];
    let inString: string | null = null;
    let inComment = false;
    let lineNum = 1;
    let colNum = 0;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      if (ch === '\n') { lineNum++; colNum = 0; continue; }
      colNum++;

      if (inComment) {
        if (content.slice(i, i + 2) === '*/') inComment = false;
        continue;
      }
      if (content.slice(i, i + 2) === '//') { while (i < content.length && content[i] !== '\n') i++; continue; }
      if (content.slice(i, i + 2) === '/*') { inComment = true; continue; }

      if (inString) {
        if (ch === inString && content[i - 1] !== '\\') inString = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { inString = ch; continue; }

      if (pairs[ch]) {
        stack.push({ char: ch, line: lineNum, col: colNum });
      } else if (Object.values(pairs).includes(ch)) {
        const top = stack[stack.length - 1];
        if (!top || pairs[top.char] !== ch) {
          issues.push({
            id: randomUUID(),
            category: 'syntax',
            severity: 'critical',
            message: `Unexpected closing bracket '${ch}'`,
            location: { file, line: lineNum, column: colNum },
            fixable: false,
          });
        } else {
          stack.pop();
        }
      }
    }

    for (const unclosed of stack) {
      issues.push({
        id: randomUUID(),
        category: 'syntax',
        severity: 'critical',
        message: `Unclosed bracket '${unclosed.char}'`,
        location: { file, line: unclosed.line, column: unclosed.col },
        fixable: false,
      });
    }

    return issues;
  }

  private checkDeadCode(file: string, lines: string[]): CodeIssue[] {
    const issues: CodeIssue[] = [];
    const patterns: Array<{ re: RegExp; msg: string; severity: Severity; category: IssueCategory; fixable: boolean }> = [
      { re: /console\.(log|debug|info|warn)\(/, msg: 'console statement left in production code', severity: 'low', category: 'dead-code', fixable: true },
      { re: /debugger;/, msg: 'debugger statement left in code', severity: 'high', category: 'dead-code', fixable: true },
    ];

    lines.forEach((line, i) => {
      for (const p of patterns) {
        if (p.re.test(line)) {
          issues.push({
            id: randomUUID(),
            category: p.category,
            severity: p.severity,
            message: p.msg,
            location: { file, line: i + 1 },
            context: line.trim(),
            fixable: p.fixable,
          });
        }
      }
    });

    return issues;
  }

  private checkSecurityPatterns(file: string, lines: string[]): CodeIssue[] {
    const issues: CodeIssue[] = [];
    const patterns: Array<{ re: RegExp; msg: string; severity: Severity; category: IssueCategory }> = [
      { re: /\beval\s*\(/, msg: 'Use of eval() is a security risk', severity: 'critical', category: 'security' },
      { re: /new Function\s*\(/, msg: 'Dynamic Function construction is a security risk', severity: 'high', category: 'security' },
      { re: /innerHTML\s*=/, msg: 'Direct innerHTML assignment may cause XSS', severity: 'high', category: 'security' },
      { re: /(password|secret|api_key|apikey|token)\s*=\s*['"][^'"]+['"]/i, msg: 'Potential hardcoded secret detected', severity: 'critical', category: 'security' },
      { re: /\bexec\s*\(\s*`/, msg: 'Template literal in exec() may allow command injection', severity: 'critical', category: 'security' },
      { re: /\bexec\s*\(\s*(req\.|params\.|query\.)/, msg: 'User-controlled input passed to exec() — command injection risk', severity: 'critical', category: 'security' },
      { re: /query\s*\+\s*(req\.|params\.|query\.|user)/, msg: 'SQL query built via string concatenation — SQL injection risk', severity: 'critical', category: 'security' },
    ];

    lines.forEach((line, i) => {
      for (const p of patterns) {
        if (p.re.test(line)) {
          issues.push({
            id: randomUUID(),
            category: p.category,
            severity: p.severity,
            message: p.msg,
            location: { file, line: i + 1 },
            context: line.trim(),
            fixable: false,
          });
        }
      }
    });

    return issues;
  }

  private checkComplexity(file: string, lines: string[]): CodeIssue[] {
    const issues: CodeIssue[] = [];
    let depth = 0;
    const DEPTH_THRESHOLD = 5;

    lines.forEach((line, i) => {
      const opens = (line.match(/\{/g) || []).length;
      const closes = (line.match(/\}/g) || []).length;
      depth += opens - closes;
      if (depth > DEPTH_THRESHOLD) {
        issues.push({
          id: randomUUID(),
          category: 'complexity',
          severity: 'medium',
          message: `Nesting depth ${depth} exceeds threshold of ${DEPTH_THRESHOLD} — consider refactoring`,
          location: { file, line: i + 1 },
          context: line.trim(),
          fixable: false,
        });
      }
    });

    return issues;
  }

  private checkTodoMarkers(file: string, lines: string[]): CodeIssue[] {
    const issues: CodeIssue[] = [];
    const re = /\/\/\s*(TODO|FIXME|HACK|XXX|BUG|TEMP)(\([^)]*\))?:?\s*(.*)/i;

    lines.forEach((line, i) => {
      const m = re.exec(line);
      if (m) {
        const tag = m[1].toUpperCase();
        const note = m[3].trim();
        issues.push({
          id: randomUUID(),
          category: 'dead-code',
          severity: tag === 'FIXME' || tag === 'BUG' ? 'high' : 'low',
          message: `${tag} marker: ${note || '(no description)'}`,
          location: { file, line: i + 1 },
          context: line.trim(),
          ruleId: `todo-marker/${tag.toLowerCase()}`,
          fixable: false,
        });
      }
    });

    return issues;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private detectDominantLanguage(files: string[]): Language {
    const counts: Partial<Record<Language, number>> = {};
    for (const f of files) {
      const ext = path.extname(f);
      const lang = DiagnosticEngine.LANGUAGE_MAP[ext] ?? 'unknown';
      counts[lang] = (counts[lang] ?? 0) + 1;
    }
    let dominant: Language = 'unknown';
    let max = 0;
    for (const [lang, count] of Object.entries(counts)) {
      if ((count ?? 0) > max) { max = count ?? 0; dominant = lang as Language; }
    }
    return dominant;
  }

  private buildSummary(issues: CodeIssue[]): DiagnosticReport['summary'] {
    const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const byCategory: Record<IssueCategory, number> = {
      syntax: 0, type: 0, logic: 0, security: 0, performance: 0,
      dependency: 0, style: 0, 'dead-code': 0, complexity: 0,
    };

    for (const issue of issues) {
      bySeverity[issue.severity]++;
      byCategory[issue.category]++;
    }

    return {
      total: issues.length,
      bySeverity,
      byCategory,
      fixable: issues.filter(i => i.fixable).length,
    };
  }
}
