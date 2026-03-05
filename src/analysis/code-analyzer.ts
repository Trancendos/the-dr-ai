/**
 * The Dr — Code Analyzer
 *
 * Analyzes code for issues, generates fixes, and validates repairs.
 * Integrates with the healing engine for autonomous code repair.
 *
 * Migrated from:
 *   server/services/theDrCodeHealing.ts
 *   server/services/theDrAdvancedHealing.ts
 *   server/intelligence/theDrToolsets.ts
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import { logger } from '../utils/logger';
import { ErrorCategory, Severity } from '../healing/healer';

// ============================================================================
// TYPES
// ============================================================================

export interface CodeIssue {
  id: string;
  file: string;
  line?: number;
  column?: number;
  category: ErrorCategory;
  severity: Severity;
  title: string;
  description: string;
  codeSnippet?: string;
  suggestion?: string;
  autoFixable: boolean;
  ruleId?: string;
}

export interface CodeFix {
  issueId: string;
  originalCode: string;
  fixedCode: string;
  explanation: string;
  confidence: number;
  linesChanged: number;
  status: 'pending' | 'applied' | 'rejected' | 'failed';
}

export interface ScanResult {
  id: string;
  timestamp: Date;
  filesScanned: number;
  issuesFound: number;
  issues: CodeIssue[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    autoFixable: number;
  };
  duration: number;
}

export interface AnalysisReport {
  timestamp: Date;
  totalIssues: number;
  fixedIssues: number;
  remainingIssues: number;
  codeQualityScore: number; // 0-100
  categories: Record<string, number>;
  topIssues: CodeIssue[];
  recommendations: string[];
}

// ============================================================================
// STATIC ANALYSIS RULES
// ============================================================================

interface AnalysisRule {
  id: string;
  name: string;
  category: ErrorCategory;
  severity: Severity;
  pattern: RegExp;
  message: string;
  suggestion: string;
  autoFixable: boolean;
}

const ANALYSIS_RULES: AnalysisRule[] = [
  // Security rules
  {
    id: 'SEC001',
    name: 'Hardcoded Secret',
    category: 'security_vulnerability',
    severity: 'critical',
    pattern: /(password|secret|api_key|apikey|token)\s*=\s*['"][^'"]{8,}['"]/i,
    message: 'Hardcoded secret detected — use environment variables',
    suggestion: 'Replace with process.env.SECRET_NAME',
    autoFixable: false,
  },
  {
    id: 'SEC002',
    name: 'SQL Injection Risk',
    category: 'security_vulnerability',
    severity: 'critical',
    pattern: /`SELECT.+\$\{.+\}`|`INSERT.+\$\{.+\}`|`UPDATE.+\$\{.+\}`|`DELETE.+\$\{.+\}`/,
    message: 'Potential SQL injection via template literal — use parameterized queries',
    suggestion: 'Use prepared statements or ORM query builders',
    autoFixable: false,
  },
  {
    id: 'SEC003',
    name: 'eval() Usage',
    category: 'security_vulnerability',
    severity: 'high',
    pattern: /\beval\s*\(/,
    message: 'eval() is dangerous and should be avoided',
    suggestion: 'Replace eval() with safer alternatives like JSON.parse() or Function()',
    autoFixable: false,
  },

  // Performance rules
  {
    id: 'PERF001',
    name: 'Synchronous File I/O',
    category: 'performance_issue',
    severity: 'medium',
    pattern: /fs\.(readFileSync|writeFileSync|appendFileSync|existsSync)\(/,
    message: 'Synchronous file I/O blocks the event loop',
    suggestion: 'Use async alternatives: fs.promises.readFile(), fs.promises.writeFile()',
    autoFixable: true,
  },
  {
    id: 'PERF002',
    name: 'Missing await in async function',
    category: 'performance_issue',
    severity: 'medium',
    pattern: /async\s+function[^{]+\{[^}]*(?<!await)\s+Promise\./,
    message: 'Promise not awaited in async function — potential unhandled rejection',
    suggestion: 'Add await before Promise calls',
    autoFixable: false,
  },
  {
    id: 'PERF003',
    name: 'console.log in production code',
    category: 'lint',
    severity: 'low',
    pattern: /console\.(log|debug|info)\(/,
    message: 'console.log should not be in production code',
    suggestion: 'Replace with structured logger (pino, winston)',
    autoFixable: true,
  },

  // TypeScript rules
  {
    id: 'TS001',
    name: 'any type usage',
    category: 'type_error',
    severity: 'medium',
    pattern: /:\s*any\b|as\s+any\b/,
    message: 'Avoid using `any` type — use specific types or `unknown`',
    suggestion: 'Replace `any` with a specific type or `unknown`',
    autoFixable: false,
  },
  {
    id: 'TS002',
    name: 'Non-null assertion',
    category: 'type_error',
    severity: 'low',
    pattern: /\w+!/,
    message: 'Non-null assertion operator (!) bypasses type safety',
    suggestion: 'Add proper null check instead of using !',
    autoFixable: false,
  },

  // Error handling rules
  {
    id: 'ERR001',
    name: 'Empty catch block',
    category: 'logic_error',
    severity: 'high',
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
    message: 'Empty catch block silently swallows errors',
    suggestion: 'Add error logging or re-throw the error',
    autoFixable: true,
  },
  {
    id: 'ERR002',
    name: 'Unhandled Promise rejection',
    category: 'runtime_error',
    severity: 'high',
    pattern: /\.then\([^)]+\)(?!\s*\.catch)/,
    message: 'Promise chain missing .catch() handler',
    suggestion: 'Add .catch() or use try/catch with async/await',
    autoFixable: true,
  },

  // Memory rules
  {
    id: 'MEM001',
    name: 'Event listener not removed',
    category: 'memory_leak',
    severity: 'medium',
    pattern: /addEventListener\([^)]+\)(?![^}]*removeEventListener)/,
    message: 'Event listener added without corresponding removeEventListener',
    suggestion: 'Store listener reference and call removeEventListener in cleanup',
    autoFixable: false,
  },
  {
    id: 'MEM002',
    name: 'setInterval without clearInterval',
    category: 'memory_leak',
    severity: 'medium',
    pattern: /setInterval\([^)]+\)(?![^}]*clearInterval)/,
    message: 'setInterval without clearInterval — potential memory leak',
    suggestion: 'Store interval ID and call clearInterval in cleanup',
    autoFixable: false,
  },
];

// ============================================================================
// CODE ANALYZER CLASS
// ============================================================================

export class CodeAnalyzer {
  private scanHistory: ScanResult[] = [];
  private fixHistory: CodeFix[] = [];

  /**
   * Scan code content for issues
   */
  scanCode(content: string, filename: string): CodeIssue[] {
    const issues: CodeIssue[] = [];
    const lines = content.split('\n');

    for (const rule of ANALYSIS_RULES) {
      // Check each line
      lines.forEach((line, lineIndex) => {
        const match = line.match(rule.pattern);
        if (match) {
          issues.push({
            id: `issue_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            file: filename,
            line: lineIndex + 1,
            column: match.index,
            category: rule.category,
            severity: rule.severity,
            title: rule.name,
            description: rule.message,
            codeSnippet: line.trim(),
            suggestion: rule.suggestion,
            autoFixable: rule.autoFixable,
            ruleId: rule.id,
          });
        }
      });
    }

    return issues;
  }

  /**
   * Scan multiple files
   */
  scanFiles(files: Array<{ path: string; content: string }>): ScanResult {
    const startTime = Date.now();
    const allIssues: CodeIssue[] = [];

    for (const file of files) {
      const issues = this.scanCode(file.content, file.path);
      allIssues.push(...issues);
    }

    const summary = {
      critical: allIssues.filter(i => i.severity === 'critical').length,
      high: allIssues.filter(i => i.severity === 'high').length,
      medium: allIssues.filter(i => i.severity === 'medium').length,
      low: allIssues.filter(i => i.severity === 'low').length,
      autoFixable: allIssues.filter(i => i.autoFixable).length,
    };

    const result: ScanResult = {
      id: `scan_${Date.now()}`,
      timestamp: new Date(),
      filesScanned: files.length,
      issuesFound: allIssues.length,
      issues: allIssues,
      summary,
      duration: Date.now() - startTime,
    };

    this.scanHistory.push(result);
    logger.info(`[CodeAnalyzer] Scanned ${files.length} files, found ${allIssues.length} issues`);

    return result;
  }

  /**
   * Generate a fix for a code issue (rule-based, no LLM required)
   */
  generateFix(issue: CodeIssue, fileContent: string): CodeFix | null {
    if (!issue.autoFixable) return null;

    const lines = fileContent.split('\n');
    let fixedLines = [...lines];
    let explanation = '';
    let confidence = 0.8;

    switch (issue.ruleId) {
      case 'PERF001': {
        // Replace sync fs calls with async
        if (issue.line) {
          const line = lines[issue.line - 1];
          fixedLines[issue.line - 1] = line
            .replace('readFileSync', 'readFile')
            .replace('writeFileSync', 'writeFile')
            .replace('appendFileSync', 'appendFile');
          explanation = 'Replaced synchronous fs call with async equivalent';
          confidence = 0.9;
        }
        break;
      }

      case 'PERF003': {
        // Replace console.log with logger
        if (issue.line) {
          const line = lines[issue.line - 1];
          fixedLines[issue.line - 1] = line
            .replace(/console\.log\(/, 'logger.info(')
            .replace(/console\.debug\(/, 'logger.debug(')
            .replace(/console\.info\(/, 'logger.info(');
          explanation = 'Replaced console.log with structured logger';
          confidence = 0.85;
        }
        break;
      }

      case 'ERR001': {
        // Add error logging to empty catch
        if (issue.line) {
          const line = lines[issue.line - 1];
          fixedLines[issue.line - 1] = line.replace(
            /catch\s*\((\w+)\)\s*\{\s*\}/,
            'catch ($1) { logger.error({ err: $1 }, \'Caught error\'); }'
          );
          explanation = 'Added error logging to empty catch block';
          confidence = 0.9;
        }
        break;
      }

      case 'ERR002': {
        // Add .catch() to promise chain
        if (issue.line) {
          const line = lines[issue.line - 1];
          fixedLines[issue.line - 1] = line + '.catch(err => logger.error({ err }, \'Promise rejected\'))';
          explanation = 'Added .catch() handler to promise chain';
          confidence = 0.75;
        }
        break;
      }

      default:
        return null;
    }

    const fixedCode = fixedLines.join('\n');
    if (fixedCode === fileContent) return null;

    const fix: CodeFix = {
      issueId: issue.id,
      originalCode: fileContent,
      fixedCode,
      explanation,
      confidence,
      linesChanged: 1,
      status: 'pending',
    };

    this.fixHistory.push(fix);
    return fix;
  }

  /**
   * Generate analysis report from scan results
   */
  generateReport(scanResult: ScanResult): AnalysisReport {
    const categories: Record<string, number> = {};
    for (const issue of scanResult.issues) {
      categories[issue.category] = (categories[issue.category] || 0) + 1;
    }

    // Quality score: start at 100, deduct for issues
    let score = 100;
    score -= scanResult.summary.critical * 20;
    score -= scanResult.summary.high * 10;
    score -= scanResult.summary.medium * 5;
    score -= scanResult.summary.low * 1;
    score = Math.max(0, score);

    const topIssues = scanResult.issues
      .sort((a, b) => {
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      })
      .slice(0, 10);

    const recommendations: string[] = [];
    if (scanResult.summary.critical > 0) {
      recommendations.push(`🚨 Fix ${scanResult.summary.critical} critical security/stability issues immediately`);
    }
    if (scanResult.summary.high > 0) {
      recommendations.push(`⚠️ Address ${scanResult.summary.high} high-severity issues before next release`);
    }
    if (scanResult.summary.autoFixable > 0) {
      recommendations.push(`🤖 ${scanResult.summary.autoFixable} issues can be auto-fixed by The Dr`);
    }

    return {
      timestamp: new Date(),
      totalIssues: scanResult.issuesFound,
      fixedIssues: 0,
      remainingIssues: scanResult.issuesFound,
      codeQualityScore: score,
      categories,
      topIssues,
      recommendations,
    };
  }

  getScanHistory(limit = 10): ScanResult[] {
    return this.scanHistory.slice(-limit);
  }

  getFixHistory(limit = 50): CodeFix[] {
    return this.fixHistory.slice(-limit);
  }
}

export const codeAnalyzer = new CodeAnalyzer();