/**
 * The Dr — Autonomous Healing & Code Repair Agent
 *
 * Entry point for the self-healing system. Wires together:
 *   - Healing Engine (diagnose, heal, learn)
 *   - Code Analyzer (static analysis, auto-fix)
 *   - Diagnostics Engine (anomaly detection, closed-loop monitoring)
 *   - REST API server
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 * Component: The Lab (the-dr-ai) — Autonomous Healing
 *
 * "The mad scientist of the platform — wielding both the flask of innovation
 *  and the wrench of repair. Where others see errors, The Dr sees opportunities
 *  for evolution."
 */

import { createServer } from 'http';
import { app } from './api/server';
import { healer } from './healing/healer';
import { diagnosticsEngine } from './diagnostics/diagnostics';
import { logger } from './utils/logger';

const PORT = parseInt(process.env.PORT || '4001');
const HOST = process.env.HOST || '0.0.0.0';

async function bootstrap(): Promise<void> {
  logger.info('╔══════════════════════════════════════════════════════════╗');
  logger.info('║           THE DR — AUTONOMOUS HEALING AGENT              ║');
  logger.info('║           Self-Healing & Code Repair v1.0                ║');
  logger.info('╚══════════════════════════════════════════════════════════╝');

  // ── 1. Run initial health check ────────────────────────────────────────────
  const initialHealth = await healer.runHealthCheck();
  logger.info(`Initial health: ${initialHealth.overallHealth.toUpperCase()} (${initialHealth.score}/100)`);

  if (initialHealth.recommendations.length > 0) {
    for (const rec of initialHealth.recommendations) {
      logger.warn(`[TheDr] Recommendation: ${rec}`);
    }
  }

  // ── 2. Start closed-loop monitoring ───────────────────────────────────────
  const monitoringInterval = parseInt(process.env.MONITORING_INTERVAL_MS || '30000');
  diagnosticsEngine.startClosedLoop(
    monitoringInterval,
    (anomaly) => {
      logger.warn(`[TheDr] 🚨 Anomaly detected: ${anomaly.type} — ${anomaly.description}`);
      // Auto-heal anomalies
      const diagnosis = healer.diagnose(anomaly.description, { service: 'the-dr-ai' });
      healer.heal(diagnosis, 'platform').catch(err => {
        logger.error({ err }, 'Auto-heal failed for anomaly');
      });
    },
    () => {
      const stats = healer.getStats();
      return {
        totalDiagnoses: healer.getDiagnosisHistory(10000).length,
        totalHealingAttempts: healer.getHealingHistory(10000).length,
        successRate: stats.successRate,
      };
    }
  );
  logger.info(`Closed-loop monitoring started (${monitoringInterval}ms interval)`);

  // ── 3. Start HTTP server ───────────────────────────────────────────────────
  const httpServer = createServer(app);

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(PORT, HOST, () => resolve());
    httpServer.on('error', reject);
  });

  logger.info(`✅ The Dr listening on http://${HOST}:${PORT}`);
  logger.info(`   REST API:    http://${HOST}:${PORT}/api/v1`);
  logger.info(`   Health:      http://${HOST}:${PORT}/health`);
  logger.info(`   Metrics:     http://${HOST}:${PORT}/metrics`);
  logger.info(`   Heal:        POST http://${HOST}:${PORT}/api/v1/heal`);
  logger.info(`   Code Review: POST http://${HOST}:${PORT}/api/v1/code-review`);

  // ── 4. Graceful shutdown ───────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal} — shutting down...`);
    diagnosticsEngine.stopClosedLoop();
    httpServer.close(() => {
      logger.info('The Dr shut down gracefully');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
    shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection');
  });
}

// ── Exports (library mode) ────────────────────────────────────────────────────

export { healer } from './healing/healer';
export { codeAnalyzer } from './analysis/code-analyzer';
export { diagnosticsEngine } from './diagnostics/diagnostics';
export type {
  Diagnosis,
  HealingAttempt,
  HealthReport,
  SelfHealingConfig,
  HealingStats,
  ErrorCategory,
  Severity,
} from './healing/healer';
export type {
  CodeIssue,
  CodeFix,
  ScanResult,
  AnalysisReport,
} from './analysis/code-analyzer';
export type {
  AnomalyEvent,
  MetricSnapshot,
  ClosedLoopStatus,
  AccuracyMetrics,
} from './diagnostics/diagnostics';

// ── Main ──────────────────────────────────────────────────────────────────────

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});