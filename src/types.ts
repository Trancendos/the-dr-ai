/**
 * Core types for The Dr AI - Autonomous Healing and Code Repair
 * Part of the Luminous-MastermindAI Ecosystem
 */

// ─── Severity & Language ────────────────────────────────────────────────────

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type Language =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'css'
  | 'html'
  | 'json'
  | 'yaml'
  | 'unknown';

export type IssueCategory =
  | 'syntax'
  | 'type'
  | 'logic'
  | 'security'
  | 'performance'
  | 'dependency'
  | 'style'
  | 'dead-code'
  | 'complexity';

// ─── Code Issues ─────────────────────────────────────────────────────────────

export interface CodeLocation {
  file: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface CodeIssue {
  id: string;
  category: IssueCategory;
  severity: Severity;
  message: string;
  location: CodeLocation;
  context?: string;       // surrounding code snippet
  ruleId?: string;        // e.g. 'no-unused-vars'
  fixable: boolean;
}

// ─── Repair Actions ──────────────────────────────────────────────────────────

export type RepairActionType =
  | 'replace'     // replace a range of text
  | 'insert'      // insert text at a position
  | 'delete'      // delete a range of text
  | 'rename'      // rename a symbol
  | 'addImport'   // add an import statement
  | 'command';    // run a shell command (e.g. npm install)

export interface TextEdit {
  location: CodeLocation;
  type: RepairActionType;
  oldText?: string;
  newText?: string;
  command?: string;
}

export interface RepairAction {
  issueId: string;
  description: string;
  edits: TextEdit[];
  confidence: number;       // 0–1
  requiresReview: boolean;
  strategyName: string;
}

// ─── Diagnostic Report ───────────────────────────────────────────────────────

export interface DiagnosticReport {
  id: string;
  timestamp: Date;
  files: string[];
  language: Language;
  issues: CodeIssue[];
  summary: {
    total: number;
    bySeverity: Record<Severity, number>;
    byCategory: Record<IssueCategory, number>;
    fixable: number;
  };
  durationMs: number;
}

// ─── Healing Session ─────────────────────────────────────────────────────────

export type SessionStatus =
  | 'idle'
  | 'diagnosing'
  | 'planning'
  | 'repairing'
  | 'reviewing'
  | 'complete'
  | 'failed';

export interface HealingSession {
  id: string;
  startedAt: Date;
  completedAt?: Date;
  status: SessionStatus;
  report?: DiagnosticReport;
  repairs: RepairAction[];
  appliedRepairs: string[];   // issueIds successfully fixed
  failedRepairs: string[];
  notes: string[];
}

// ─── Knowledge / Learning ────────────────────────────────────────────────────

export interface RepairPattern {
  id: string;
  name: string;
  description: string;
  category: IssueCategory;
  language: Language | 'any';
  matchRegex?: string;
  successCount: number;
  failureCount: number;
  lastUsed?: Date;
  templateFix?: string;
}

export interface KnowledgeEntry {
  pattern: RepairPattern;
  examples: Array<{ before: string; after: string }>;
  tags: string[];
}

// ─── Agent Configuration ─────────────────────────────────────────────────────

export interface AgentConfig {
  name: string;
  version: string;
  maxConcurrentRepairs: number;
  autoApplyBelow: Severity;   // auto-apply fixes below this severity
  requireReviewAbove: Severity;
  learningEnabled: boolean;
  ecosystemEndpoint?: string; // URL of Luminous-MastermindAI coordinator
  services: ServiceConfig[];
  supportedLanguages: Language[];
}

export interface ServiceConfig {
  name: string;
  type: 'linter' | 'formatter' | 'compiler' | 'test-runner' | 'ai-model' | 'vcs';
  enabled: boolean;
  command?: string;
  endpoint?: string;
  options?: Record<string, unknown>;
}

// ─── Capability Manifest ─────────────────────────────────────────────────────

export interface AgentCapability {
  name: string;
  description: string;
  languages: Language[];
  categories: IssueCategory[];
  canAutoFix: boolean;
}
