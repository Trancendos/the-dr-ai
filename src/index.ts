/**
 * the-dr-ai — Autonomous Healing and Code Repair
 * Part of the Luminous-MastermindAI Ecosystem
 *
 * "The Dr" is a software development engineer experienced in multiple coding
 * strategies. It quickly learns and adapts, and is designed to manage services
 * more effectively and efficiently over time.
 *
 * Architecture:
 *   DiagnosticEngine   — analyses source files for issues
 *   RepairPlanner      — selects and orders repair strategies
 *   RepairStrategy     — individual fix algorithms (pluggable)
 *   KnowledgeBase      — learns from repair success/failure
 *   HealingAgent       — orchestrates the full diagnosis → repair loop
 *   ServiceManager     — integrates linters, compilers, test-runners, VCS
 */

import { HealingAgent } from './agent/HealingAgent';
import { KnowledgeBase } from './knowledge/KnowledgeBase';
import { ServiceManager } from './services/ServiceManager';
import type { AgentConfig } from './types';

// ─── Re-exports (public API) ─────────────────────────────────────────────────

export { HealingAgent } from './agent/HealingAgent';
export { DiagnosticEngine } from './diagnostic/DiagnosticEngine';
export { KnowledgeBase } from './knowledge/KnowledgeBase';
export { RepairPlanner } from './repair/RepairPlanner';
export { ServiceManager } from './services/ServiceManager';

export type { RepairStrategy } from './repair/RepairStrategy';
export type {
  AgentCapability,
  AgentConfig,
  CodeIssue,
  CodeLocation,
  DiagnosticReport,
  HealingSession,
  IssueCategory,
  KnowledgeEntry,
  Language,
  RepairAction,
  RepairPattern,
  ServiceConfig,
  Severity,
  TextEdit,
} from './types';

// ─── Default configuration ───────────────────────────────────────────────────

export const DEFAULT_CONFIG: AgentConfig = {
  name: 'the-dr-ai',
  version: '1.0.0',
  maxConcurrentRepairs: 5,
  autoApplyBelow: 'medium',   // auto-apply fixes for low/info severity
  requireReviewAbove: 'low',  // human review required for medium+
  learningEnabled: true,
  supportedLanguages: [
    'typescript', 'javascript', 'python', 'rust', 'go',
    'java', 'css', 'html', 'json', 'yaml',
  ],
  services: ServiceManager.defaultConfigs(),
};

// ─── TheDrAiService — primary service class ──────────────────────────────────

export class TheDrAiService {
  private readonly agent: HealingAgent;
  private readonly services: ServiceManager;
  private readonly config: AgentConfig;

  constructor(config: AgentConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.agent = new HealingAgent(config);
    this.services = new ServiceManager();
    this.services.registerMany(config.services);
    this.attachLogging();
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  async start(): Promise<void> {
    console.log(`[${this.config.name}] Starting — version ${this.config.version}`);
    console.log(`[${this.config.name}] Supported languages: ${this.config.supportedLanguages.join(', ')}`);
    console.log(`[${this.config.name}] Knowledge base loaded: ${this.agent.getKnowledge().stats().total} patterns`);
  }

  async stop(): Promise<void> {
    console.log(`[${this.config.name}] Shutting down`);
  }

  // ─── Core operation ──────────────────────────────────────────────────────

  /** Diagnose and heal a list of files. Returns the completed HealingSession. */
  async heal(filePaths: string[]) {
    return this.agent.heal(filePaths);
  }

  /** Register an external repair strategy. Enables extensibility. */
  registerStrategy(strategy: import('./repair/RepairStrategy').RepairStrategy): void {
    (this.agent as unknown as { planner: import('./repair/RepairPlanner').RepairPlanner })
      .planner.registerStrategy(strategy);
  }

  // ─── Introspection ───────────────────────────────────────────────────────

  getStatus() {
    const kb = this.agent.getKnowledge().stats();
    const sessions = this.agent.listSessions();
    return {
      name: this.config.name,
      version: this.config.version,
      status: 'active' as const,
      capabilities: this.agent.capabilities().map(c => c.name),
      sessions: {
        total: sessions.length,
        complete: sessions.filter(s => s.status === 'complete').length,
        failed: sessions.filter(s => s.status === 'failed').length,
      },
      knowledge: kb,
      services: this.services.listServices().map(s => ({
        name: s.name,
        type: s.type,
        enabled: s.enabled,
      })),
    };
  }

  // ─── Accessors ───────────────────────────────────────────────────────────

  getAgent(): HealingAgent { return this.agent; }
  getServiceManager(): ServiceManager { return this.services; }
  getKnowledge(): KnowledgeBase { return this.agent.getKnowledge(); }

  // ─── Private ─────────────────────────────────────────────────────────────

  private attachLogging(): void {
    const tag = `[${this.config.name}]`;
    this.agent.on('status', (s: import('./types').HealingSession) =>
      console.log(`${tag} Session ${s.id.slice(0, 8)}: ${s.status}`),
    );
    this.agent.on('applied', (a: import('./types').RepairAction) =>
      console.log(`${tag} + Applied: ${a.description}`),
    );
    this.agent.on('skipped', (a: import('./types').RepairAction, reason: string) =>
      console.log(`${tag} - Skipped (${reason}): ${a.description}`),
    );
  }
}

export default TheDrAiService;

// ─── CLI entry-point ─────────────────────────────────────────────────────────

if (require.main === module) {
  const service = new TheDrAiService();
  const files = process.argv.slice(2);

  service.start().then(async () => {
    if (files.length > 0) {
      console.log(`\nHealing ${files.length} file(s)...`);
      const session = await service.heal(files);
      console.log('\n── Session Report ───────────────────────────────');
      console.log(`Status   : ${session.status}`);
      console.log(`Issues   : ${session.report?.summary.total ?? 0}`);
      console.log(`Applied  : ${session.appliedRepairs.length}`);
      console.log(`Skipped  : ${session.repairs.length - session.appliedRepairs.length - session.failedRepairs.length}`);
      console.log(`Failed   : ${session.failedRepairs.length}`);
      console.log('\nNotes:');
      session.notes.forEach((n: string) => console.log(`  • ${n}`));
    } else {
      console.log('\nNo files specified. Pass file paths as arguments:');
      console.log('  node dist/index.js src/myFile.ts\n');
      console.log('Status:', JSON.stringify(service.getStatus(), null, 2));
    }
  });
}
