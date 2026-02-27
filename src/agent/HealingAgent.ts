import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import type {
  AgentCapability,
  AgentConfig,
  HealingSession,
  RepairAction,
  Severity,
} from '../types';
import { DiagnosticEngine } from '../diagnostic/DiagnosticEngine';
import { KnowledgeBase } from '../knowledge/KnowledgeBase';
import { RepairPlanner } from '../repair/RepairPlanner';
import type { RepairStrategy } from '../repair/RepairStrategy';

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 5, high: 4, medium: 3, low: 2, info: 1,
};

/**
 * HealingAgent — The Dr's core orchestrator.
 *
 * Usage:
 *   const dr = new HealingAgent(config);
 *   const session = await dr.heal(['src/index.ts', 'src/api.ts']);
 *   console.log(session.appliedRepairs);
 *
 * Events:
 *   'status'   (session: HealingSession)      — whenever session status changes
 *   'issue'    (issue, actions)               — each issue with proposed repairs
 *   'applied'  (repairAction)                 — a repair was applied
 *   'skipped'  (repairAction, reason: string) — a repair was skipped
 *   'complete' (session: HealingSession)      — session finished
 */
export class HealingAgent extends EventEmitter {
  readonly config: AgentConfig;

  private readonly diagnostics: DiagnosticEngine;
  private readonly knowledge: KnowledgeBase;
  private readonly planner: RepairPlanner;

  private activeSessions: Map<string, HealingSession> = new Map();

  constructor(config: AgentConfig, extraStrategies: RepairStrategy[] = []) {
    super();
    this.config = config;
    this.diagnostics = new DiagnosticEngine();
    this.knowledge = new KnowledgeBase();
    this.planner = new RepairPlanner(extraStrategies);
  }

  // ─── Main entry point ─────────────────────────────────────────────────────

  async heal(filePaths: string[]): Promise<HealingSession> {
    const session = this.createSession();

    try {
      // 1. Diagnose
      this.transition(session, 'diagnosing');
      const report = await this.diagnostics.analyse(filePaths);
      session.report = report;
      session.notes.push(
        `Diagnosed ${filePaths.length} file(s): ${report.summary.total} issues found ` +
        `(${report.summary.bySeverity.critical} critical, ${report.summary.bySeverity.high} high)`,
      );

      // 2. Plan repairs
      this.transition(session, 'planning');
      const actions = await this.planner.plan(report);
      session.repairs = actions;
      session.notes.push(`Planned ${actions.length} repair action(s)`);

      // 3. Apply repairs
      this.transition(session, 'repairing');
      await this.applyRepairs(session, actions);

      // 4. Done
      this.transition(session, 'complete');
      session.completedAt = new Date();
      this.emit('complete', session);
    } catch (err) {
      session.status = 'failed';
      session.notes.push(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
      session.completedAt = new Date();
      this.emit('complete', session);
    }

    return session;
  }

  // ─── Repair application ───────────────────────────────────────────────────

  private async applyRepairs(session: HealingSession, actions: RepairAction[]): Promise<void> {
    for (const action of actions) {
      const issue = session.report?.issues.find(i => i.id === action.issueId);
      if (!issue) continue;

      this.emit('issue', issue, [action]);

      // Skip if severity is above the auto-apply threshold
      const autoApplyWeight = SEVERITY_WEIGHT[this.config.autoApplyBelow];
      const issueWeight = SEVERITY_WEIGHT[issue.severity];

      if (action.requiresReview || issueWeight > autoApplyWeight) {
        session.notes.push(
          `Skipped (requires review): ${action.description}`,
        );
        this.emit('skipped', action, 'requires human review');
        continue;
      }

      // Apply the edit
      try {
        this.applyTextEdits(action);
        session.appliedRepairs.push(action.issueId);
        this.knowledge.recordSuccess(action.strategyName);
        this.emit('applied', action);
        session.notes.push(`Applied: ${action.description}`);
      } catch (err) {
        session.failedRepairs.push(action.issueId);
        this.knowledge.recordFailure(action.strategyName);
        session.notes.push(`Failed to apply: ${action.description} — ${String(err)}`);
      }
    }
  }

  private applyTextEdits(action: RepairAction): void {
    for (const edit of action.edits) {
      const filePath = edit.location.file;
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const lineIdx = (edit.location.line ?? 1) - 1;

      if (edit.type === 'delete' && edit.oldText !== undefined) {
        if (lines[lineIdx]?.trim() === edit.oldText?.trim()) {
          lines.splice(lineIdx, 1);
        }
      } else if (edit.type === 'replace' && edit.oldText && edit.newText !== undefined) {
        lines[lineIdx] = lines[lineIdx].replace(edit.oldText, edit.newText);
      } else if (edit.type === 'insert' && edit.newText) {
        lines.splice(lineIdx, 0, edit.newText);
      }

      fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    }
  }

  // ─── Capabilities ─────────────────────────────────────────────────────────

  capabilities(): AgentCapability[] {
    return [
      {
        name: 'Dead-code removal',
        description: 'Automatically removes console.log, debugger, and other dead-code markers',
        languages: this.config.supportedLanguages,
        categories: ['dead-code'],
        canAutoFix: true,
      },
      {
        name: 'Security advisory',
        description: 'Detects eval, XSS, SQL injection, and hardcoded secrets; provides remediation guidance',
        languages: this.config.supportedLanguages,
        categories: ['security'],
        canAutoFix: false,
      },
      {
        name: 'Syntax analysis',
        description: 'Detects unclosed brackets and other structural syntax issues',
        languages: this.config.supportedLanguages,
        categories: ['syntax'],
        canAutoFix: false,
      },
      {
        name: 'Complexity analysis',
        description: 'Flags deeply nested code that should be refactored',
        languages: this.config.supportedLanguages,
        categories: ['complexity'],
        canAutoFix: false,
      },
    ];
  }

  // ─── Knowledge access ─────────────────────────────────────────────────────

  getKnowledge(): KnowledgeBase {
    return this.knowledge;
  }

  // ─── Session management ───────────────────────────────────────────────────

  getSession(id: string): HealingSession | undefined {
    return this.activeSessions.get(id);
  }

  listSessions(): HealingSession[] {
    return [...this.activeSessions.values()];
  }

  private createSession(): HealingSession {
    const session: HealingSession = {
      id: randomUUID(),
      startedAt: new Date(),
      status: 'idle',
      repairs: [],
      appliedRepairs: [],
      failedRepairs: [],
      notes: [],
    };
    this.activeSessions.set(session.id, session);
    return session;
  }

  private transition(session: HealingSession, status: HealingSession['status']): void {
    session.status = status;
    this.emit('status', session);
  }
}
