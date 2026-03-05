/**
 * The Dr — REST API Server
 *
 * Exposes healing, diagnostics, and code analysis capabilities
 * as HTTP endpoints for integration with infinity-portal and other services.
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { healer } from '../healing/healer';
import { codeAnalyzer } from '../analysis/code-analyzer';
import { diagnosticsEngine } from '../diagnostics/diagnostics';
import { logger } from '../utils/logger';

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));

// ── Health & Metrics ──────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'the-dr-ai',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/metrics', async (_req: Request, res: Response) => {
  const health = await healer.runHealthCheck();
  const perf = healer.analyzePerformance();
  const closedLoop = diagnosticsEngine.getClosedLoopStatus();
  res.json({ health, performance: perf, closedLoop, timestamp: new Date().toISOString() });
});

// ── Healing Endpoints ─────────────────────────────────────────────────────────

/**
 * POST /api/v1/heal
 * Diagnose and attempt to heal an error
 */
app.post('/api/v1/heal', async (req: Request, res: Response) => {
  try {
    const { error, context, mode } = req.body;
    if (!error) return res.status(400).json({ error: 'error message is required' });

    const diagnosis = healer.diagnose(error, context);
    const attempt = await healer.heal(diagnosis, mode || 'platform');

    return res.json({ diagnosis, attempt });
  } catch (err) {
    logger.error({ err }, 'Heal endpoint error');
    return res.status(500).json({ error: 'Healing failed', details: String(err) });
  }
});

/**
 * POST /api/v1/diagnose
 * Diagnose only — no healing attempt
 */
app.post('/api/v1/diagnose', (req: Request, res: Response) => {
  try {
    const { error, context } = req.body;
    if (!error) return res.status(400).json({ error: 'error message is required' });

    const diagnosis = healer.diagnose(error, context);
    return res.json(diagnosis);
  } catch (err) {
    logger.error({ err }, 'Diagnose endpoint error');
    return res.status(500).json({ error: 'Diagnosis failed', details: String(err) });
  }
});

/**
 * GET /api/v1/health-check
 * Full system health report
 */
app.get('/api/v1/health-check', async (_req: Request, res: Response) => {
  try {
    const report = await healer.runHealthCheck();
    return res.json(report);
  } catch (err) {
    return res.status(500).json({ error: 'Health check failed', details: String(err) });
  }
});

/**
 * GET /api/v1/anomalies
 * Get current anomalies
 */
app.get('/api/v1/anomalies', (req: Request, res: Response) => {
  const includeResolved = req.query.resolved === 'true';
  const anomalies = diagnosticsEngine.getAnomalies(includeResolved);
  res.json({ anomalies, count: anomalies.length });
});

/**
 * GET /api/v1/history/diagnoses
 * Diagnosis history
 */
app.get('/api/v1/history/diagnoses', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const history = healer.getDiagnosisHistory(limit);
  res.json({ history, count: history.length });
});

/**
 * GET /api/v1/history/healing
 * Healing attempt history
 */
app.get('/api/v1/history/healing', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const history = healer.getHealingHistory(limit);
  res.json({ history, count: history.length });
});

/**
 * GET /api/v1/stats
 * Healing statistics
 */
app.get('/api/v1/stats', (req: Request, res: Response) => {
  const stats = healer.getStats();
  const accuracy = diagnosticsEngine.calculateAccuracy(healer.getHealingHistory(1000));
  res.json({ stats, accuracy });
});

// ── Code Analysis Endpoints ───────────────────────────────────────────────────

/**
 * POST /api/v1/code-analysis
 * Scan code content for issues
 */
app.post('/api/v1/code-analysis', (req: Request, res: Response) => {
  try {
    const { content, filename } = req.body;
    if (!content || !filename) {
      return res.status(400).json({ error: 'content and filename are required' });
    }

    const issues = codeAnalyzer.scanCode(content, filename);
    const scanResult = {
      filename,
      issuesFound: issues.length,
      issues,
      summary: {
        critical: issues.filter(i => i.severity === 'critical').length,
        high: issues.filter(i => i.severity === 'high').length,
        medium: issues.filter(i => i.severity === 'medium').length,
        low: issues.filter(i => i.severity === 'low').length,
        autoFixable: issues.filter(i => i.autoFixable).length,
      },
    };

    return res.json(scanResult);
  } catch (err) {
    logger.error({ err }, 'Code analysis error');
    return res.status(500).json({ error: 'Code analysis failed', details: String(err) });
  }
});

/**
 * POST /api/v1/code-review
 * Scan multiple files and generate full report
 */
app.post('/api/v1/code-review', (req: Request, res: Response) => {
  try {
    const { files } = req.body;
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files array is required' });
    }

    const scanResult = codeAnalyzer.scanFiles(files);
    const report = codeAnalyzer.generateReport(scanResult);

    return res.json({ scanResult, report });
  } catch (err) {
    logger.error({ err }, 'Code review error');
    return res.status(500).json({ error: 'Code review failed', details: String(err) });
  }
});

/**
 * POST /api/v1/code-fix
 * Generate auto-fix for a code issue
 */
app.post('/api/v1/code-fix', (req: Request, res: Response) => {
  try {
    const { issue, fileContent } = req.body;
    if (!issue || !fileContent) {
      return res.status(400).json({ error: 'issue and fileContent are required' });
    }

    const fix = codeAnalyzer.generateFix(issue, fileContent);
    if (!fix) {
      return res.status(422).json({ error: 'No auto-fix available for this issue' });
    }

    return res.json(fix);
  } catch (err) {
    logger.error({ err }, 'Code fix error');
    return res.status(500).json({ error: 'Code fix generation failed', details: String(err) });
  }
});

// ── Diagnostics Endpoints ─────────────────────────────────────────────────────

/**
 * GET /api/v1/diagnostics/metrics
 * Current system metrics snapshot
 */
app.get('/api/v1/diagnostics/metrics', (req: Request, res: Response) => {
  const stats = healer.getStats();
  const snapshot = diagnosticsEngine.collectMetrics({
    totalDiagnoses: healer.getDiagnosisHistory(10000).length,
    totalHealingAttempts: healer.getHealingHistory(10000).length,
    successRate: stats.successRate,
  });
  res.json(snapshot);
});

/**
 * GET /api/v1/diagnostics/closed-loop
 * Closed-loop monitoring status
 */
app.get('/api/v1/diagnostics/closed-loop', (_req: Request, res: Response) => {
  res.json(diagnosticsEngine.getClosedLoopStatus());
});

/**
 * GET /api/v1/diagnostics/accuracy
 * Accuracy metrics
 */
app.get('/api/v1/diagnostics/accuracy', (req: Request, res: Response) => {
  const history = healer.getHealingHistory(1000);
  const accuracy = diagnosticsEngine.calculateAccuracy(history);
  res.json(accuracy);
});

/**
 * PATCH /api/v1/config
 * Update healer configuration
 */
app.patch('/api/v1/config', (req: Request, res: Response) => {
  try {
    healer.updateConfig(req.body);
    return res.json({ success: true, config: healer.getConfig() });
  } catch (err) {
    return res.status(500).json({ error: 'Config update failed', details: String(err) });
  }
});

// ── Error Handling ────────────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

export { app };