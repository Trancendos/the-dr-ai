/**
 * The Dr — Diagnostics Engine
 *
 * System-level diagnostics: health checks, anomaly detection,
 * performance profiling, and closed-loop monitoring.
 *
 * Migrated from:
 *   server/services/theDrEnhanced.ts
 *   server/services/theDrAccuracyTracking.ts
 *   server/intelligence/theDrCore.ts
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import { logger } from '../utils/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface AnomalyEvent {
  id: string;
  timestamp: Date;
  type: 'memory_spike' | 'cpu_spike' | 'error_rate_spike' | 'latency_spike' | 'custom';
  severity: 'low' | 'medium' | 'high' | 'critical';
  metric: string;
  value: number;
  threshold: number;
  description: string;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface MetricSnapshot {
  timestamp: Date;
  memory: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
    externalMB: number;
    usagePercent: number;
  };
  process: {
    uptimeSeconds: number;
    pid: number;
    cpuUserMs: number;
    cpuSystemMs: number;
  };
  healing: {
    totalDiagnoses: number;
    totalHealingAttempts: number;
    successRate: number;
    activeAnomalies: number;
  };
}

export interface ClosedLoopStatus {
  enabled: boolean;
  monitoringInterval: number;
  lastCheck: Date | null;
  checksPerformed: number;
  anomaliesDetected: number;
  anomaliesResolved: number;
  currentAnomalies: AnomalyEvent[];
}

export interface AccuracyMetrics {
  diagnosisAccuracy: number;    // % of diagnoses that led to successful fixes
  fixSuccessRate: number;       // % of applied fixes that passed validation
  falsePositiveRate: number;    // % of diagnoses that were incorrect
  meanTimeToHeal: number;       // Average ms from detection to resolution
  learningVelocity: number;     // Rate of improvement over time
}

// ============================================================================
// DIAGNOSTICS ENGINE
// ============================================================================

export class DiagnosticsEngine {
  private anomalies: AnomalyEvent[] = [];
  private metricHistory: MetricSnapshot[] = [];
  private closedLoopInterval: NodeJS.Timeout | null = null;
  private checksPerformed = 0;

  // Thresholds for anomaly detection
  private thresholds = {
    memoryUsagePercent: 85,
    errorRatePerHour: 20,
    healingSuccessRateMin: 0.5,
  };

  constructor() {
    logger.info('[Diagnostics] 🔭 Diagnostics engine initialized');
  }

  // ── Metric Collection ──────────────────────────────────────────────────────

  /**
   * Collect current system metrics snapshot
   */
  collectMetrics(healingStats?: {
    totalDiagnoses: number;
    totalHealingAttempts: number;
    successRate: number;
  }): MetricSnapshot {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();

    const snapshot: MetricSnapshot = {
      timestamp: new Date(),
      memory: {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
        externalMB: Math.round(mem.external / 1024 / 1024),
        usagePercent: Math.round((mem.heapUsed / mem.heapTotal) * 100),
      },
      process: {
        uptimeSeconds: Math.round(process.uptime()),
        pid: process.pid,
        cpuUserMs: Math.round(cpu.user / 1000),
        cpuSystemMs: Math.round(cpu.system / 1000),
      },
      healing: {
        totalDiagnoses: healingStats?.totalDiagnoses || 0,
        totalHealingAttempts: healingStats?.totalHealingAttempts || 0,
        successRate: healingStats?.successRate || 0,
        activeAnomalies: this.anomalies.filter(a => !a.resolved).length,
      },
    };

    // Keep last 1000 snapshots
    this.metricHistory.push(snapshot);
    if (this.metricHistory.length > 1000) {
      this.metricHistory.shift();
    }

    return snapshot;
  }

  // ── Anomaly Detection ──────────────────────────────────────────────────────

  /**
   * Detect anomalies from current metrics
   */
  detectAnomalies(snapshot: MetricSnapshot): AnomalyEvent[] {
    const newAnomalies: AnomalyEvent[] = [];

    // Memory spike
    if (snapshot.memory.usagePercent > this.thresholds.memoryUsagePercent) {
      const existing = this.anomalies.find(
        a => a.type === 'memory_spike' && !a.resolved
      );
      if (!existing) {
        const anomaly = this.createAnomaly(
          'memory_spike',
          snapshot.memory.usagePercent > 95 ? 'critical' : 'high',
          'memory.usagePercent',
          snapshot.memory.usagePercent,
          this.thresholds.memoryUsagePercent,
          `Memory usage at ${snapshot.memory.usagePercent}% — threshold is ${this.thresholds.memoryUsagePercent}%`
        );
        newAnomalies.push(anomaly);
        logger.warn(`[Diagnostics] 🚨 Memory anomaly detected: ${snapshot.memory.usagePercent}%`);
      }
    } else {
      // Resolve existing memory anomaly
      this.resolveAnomaly('memory_spike');
    }

    // Healing success rate drop
    if (
      snapshot.healing.totalHealingAttempts > 10 &&
      snapshot.healing.successRate < this.thresholds.healingSuccessRateMin
    ) {
      const existing = this.anomalies.find(
        a => a.type === 'error_rate_spike' && !a.resolved
      );
      if (!existing) {
        const anomaly = this.createAnomaly(
          'error_rate_spike',
          'medium',
          'healing.successRate',
          snapshot.healing.successRate,
          this.thresholds.healingSuccessRateMin,
          `Healing success rate dropped to ${Math.round(snapshot.healing.successRate * 100)}%`
        );
        newAnomalies.push(anomaly);
        logger.warn(`[Diagnostics] ⚠️ Low healing success rate: ${snapshot.healing.successRate}`);
      }
    }

    return newAnomalies;
  }

  /**
   * Start closed-loop monitoring
   */
  startClosedLoop(
    intervalMs = 30_000,
    onAnomaly?: (anomaly: AnomalyEvent) => void,
    getHealingStats?: () => { totalDiagnoses: number; totalHealingAttempts: number; successRate: number }
  ): void {
    if (this.closedLoopInterval) {
      logger.warn('[Diagnostics] Closed loop already running');
      return;
    }

    logger.info(`[Diagnostics] 🔄 Starting closed-loop monitoring (${intervalMs}ms interval)`);

    this.closedLoopInterval = setInterval(() => {
      this.checksPerformed++;
      const stats = getHealingStats?.();
      const snapshot = this.collectMetrics(stats);
      const newAnomalies = this.detectAnomalies(snapshot);

      for (const anomaly of newAnomalies) {
        onAnomaly?.(anomaly);
      }
    }, intervalMs);
  }

  /**
   * Stop closed-loop monitoring
   */
  stopClosedLoop(): void {
    if (this.closedLoopInterval) {
      clearInterval(this.closedLoopInterval);
      this.closedLoopInterval = null;
      logger.info('[Diagnostics] Closed-loop monitoring stopped');
    }
  }

  /**
   * Get closed-loop status
   */
  getClosedLoopStatus(): ClosedLoopStatus {
    return {
      enabled: this.closedLoopInterval !== null,
      monitoringInterval: 30_000,
      lastCheck: this.metricHistory.length > 0
        ? this.metricHistory[this.metricHistory.length - 1].timestamp
        : null,
      checksPerformed: this.checksPerformed,
      anomaliesDetected: this.anomalies.length,
      anomaliesResolved: this.anomalies.filter(a => a.resolved).length,
      currentAnomalies: this.anomalies.filter(a => !a.resolved),
    };
  }

  // ── Accuracy Tracking ──────────────────────────────────────────────────────

  /**
   * Calculate accuracy metrics from healing history
   */
  calculateAccuracy(healingHistory: Array<{
    status: string;
    confidence: number;
    duration?: number;
    validationResult?: { passed: boolean };
  }>): AccuracyMetrics {
    if (healingHistory.length === 0) {
      return {
        diagnosisAccuracy: 0,
        fixSuccessRate: 0,
        falsePositiveRate: 0,
        meanTimeToHeal: 0,
        learningVelocity: 0,
      };
    }

    const applied = healingHistory.filter(h => h.status === 'applied');
    const failed = healingHistory.filter(h => h.status === 'failed');
    const validated = applied.filter(h => h.validationResult?.passed);

    const fixSuccessRate = applied.length > 0 ? validated.length / applied.length : 0;
    const diagnosisAccuracy = healingHistory.length > 0
      ? applied.length / healingHistory.length
      : 0;
    const falsePositiveRate = healingHistory.length > 0
      ? failed.length / healingHistory.length
      : 0;

    const completedWithDuration = applied.filter(h => h.duration !== undefined);
    const meanTimeToHeal = completedWithDuration.length > 0
      ? completedWithDuration.reduce((sum, h) => sum + (h.duration || 0), 0) / completedWithDuration.length
      : 0;

    // Learning velocity: improvement in success rate over time (simplified)
    const recentHalf = healingHistory.slice(Math.floor(healingHistory.length / 2));
    const recentApplied = recentHalf.filter(h => h.status === 'applied');
    const recentSuccessRate = recentHalf.length > 0 ? recentApplied.length / recentHalf.length : 0;
    const learningVelocity = recentSuccessRate - diagnosisAccuracy;

    return {
      diagnosisAccuracy: Math.round(diagnosisAccuracy * 100) / 100,
      fixSuccessRate: Math.round(fixSuccessRate * 100) / 100,
      falsePositiveRate: Math.round(falsePositiveRate * 100) / 100,
      meanTimeToHeal: Math.round(meanTimeToHeal),
      learningVelocity: Math.round(learningVelocity * 100) / 100,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private createAnomaly(
    type: AnomalyEvent['type'],
    severity: AnomalyEvent['severity'],
    metric: string,
    value: number,
    threshold: number,
    description: string
  ): AnomalyEvent {
    const anomaly: AnomalyEvent = {
      id: `anomaly_${Date.now()}`,
      timestamp: new Date(),
      type,
      severity,
      metric,
      value,
      threshold,
      description,
      resolved: false,
    };
    this.anomalies.push(anomaly);
    return anomaly;
  }

  private resolveAnomaly(type: AnomalyEvent['type']): void {
    const anomaly = this.anomalies.find(a => a.type === type && !a.resolved);
    if (anomaly) {
      anomaly.resolved = true;
      anomaly.resolvedAt = new Date();
      logger.info(`[Diagnostics] ✅ Anomaly resolved: ${type}`);
    }
  }

  getAnomalies(includeResolved = false): AnomalyEvent[] {
    return includeResolved ? this.anomalies : this.anomalies.filter(a => !a.resolved);
  }

  getMetricHistory(limit = 100): MetricSnapshot[] {
    return this.metricHistory.slice(-limit);
  }

  updateThresholds(updates: Partial<typeof this.thresholds>): void {
    this.thresholds = { ...this.thresholds, ...updates };
    logger.info('[Diagnostics] Thresholds updated', updates);
  }
}

export const diagnosticsEngine = new DiagnosticsEngine();