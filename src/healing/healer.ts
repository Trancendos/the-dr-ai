/**
 * The Dr — Core Healing Engine
 *
 * The central self-healing system. Detects, diagnoses, and repairs errors
 * autonomously. Operates in two modes:
 *   - Platform Mode: Fully autonomous (no user interaction)
 *   - User Mode: Guided resolution with 3 options
 *
 * Migrated from:
 *   server/services/theDr.ts
 *   server/services/theDrSelfHealing.ts
 *   server/services/theDrAdvancedHealing.ts
 *   server/intelligence/theDrCore.ts
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 * Component: The Lab (the-dr-ai) — Autonomous Healing
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type ErrorCategory =
  | 'syntax_error'
  | 'runtime_error'
  | 'type_error'
  | 'logic_error'
  | 'performance_issue'
  | 'memory_leak'
  | 'security_vulnerability'
  | 'dependency_conflict'
  | 'configuration_error'
  | 'network_error'
  | 'database_error'
  | 'api_error'
  | 'typescript'
  | 'build'
  | 'lint'
  | 'test'
  | 'unknown';

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type HealingMode = 'platform' | 'user_guided';
export type FixType = 'automated' | 'manual' | 'guided';
export type FixStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'failed' | 'rolled_back';

export interface Diagnosis {
  id: string;
  timestamp: Date;
  category: ErrorCategory;
  severity: Severity;
  location: {
    file?: string;
    line?: number;
    column?: number;
    service?: string;
    component?: string;
  };
  symptoms: string[];
  rootCause: string;
  suggestedFixes: SuggestedFix[];
  relatedIssues: string[];
  preventionAdvice: string;
  confidence: number;
}

export interface SuggestedFix {
  description: string;
  code?: string;
  confidence: number;
  autoApplicable: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  estimatedTime: string;
}

export interface HealingAttempt {
  id: string;
  diagnosisId: string;
  errorCode?: string;
  originalCode?: string;
  fixedCode?: string;
  fixApplied: string;
  explanation: string;
  confidence: number;
  timestamp: Date;
  status: FixStatus;
  duration?: number;
  validationResult?: {
    passed: boolean;
    errors?: string[];
  };
  rollbackPerformed: boolean;
}

export interface HealthReport {
  timestamp: Date;
  overallHealth: 'healthy' | 'degraded' | 'critical';
  score: number; // 0-100
  systems: SystemHealth[];
  recommendations: string[];
  predictedIssues: PredictedIssue[];
}

export interface SystemHealth {
  name: string;
  status: 'healthy' | 'warning' | 'error';
  metrics: Record<string, number>;
  issues: string[];
}

export interface PredictedIssue {
  description: string;
  probability: number;
  timeframe: string;
  preventionSteps: string[];
}

export interface SelfHealingConfig {
  enabled: boolean;
  autoFix: boolean;
  autoRollback: boolean;
  maxRetries: number;
  validationRequired: boolean;
  notifyOnFix: boolean;
  learningEnabled: boolean;
  confidenceThreshold: number; // Min confidence to auto-apply (0-1)
  allowedCategories: ErrorCategory[]; // Categories eligible for auto-fix
}

export interface HealingStats {
  totalErrors: number;
  fixedErrors: number;
  failedFixes: number;
  rollbacks: number;
  successRate: number;
  averageFixTimMs: number;
  lastHealingRun: Date | null;
  learningDataPoints: number;
}

// ============================================================================
// ERROR PATTERN REGISTRY
// Common TypeScript/JS error patterns with auto-fix generators
// ============================================================================

interface ErrorPattern {
  pattern: RegExp;
  category: ErrorCategory;
  severity: Severity;
  autoFixable: boolean;
  generateFix: (match: RegExpMatchArray, content?: string) => string | null;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // Missing React import
  {
    pattern: /Cannot find name '(useState|useEffect|useCallback|useMemo|useRef|React)'/,
    category: 'typescript',
    severity: 'medium',
    autoFixable: true,
    generateFix: (match) => {
      const hooks: Record<string, string> = {
        useState: "import { useState } from 'react';",
        useEffect: "import { useEffect } from 'react';",
        useCallback: "import { useCallback } from 'react';",
        useMemo: "import { useMemo } from 'react';",
        useRef: "import { useRef } from 'react';",
        React: "import React from 'react';",
      };
      return hooks[match[1]] || null;
    },
  },
  // Unused variable — prefix with underscore
  {
    pattern: /'(\w+)' is declared but its value is never read/,
    category: 'lint',
    severity: 'low',
    autoFixable: true,
    generateFix: (match) => `// Rename ${match[1]} to _${match[1]} to suppress unused warning`,
  },
  // Missing semicolon
  {
    pattern: /Expected ';'/,
    category: 'syntax_error',
    severity: 'low',
    autoFixable: true,
    generateFix: () => 'Add missing semicolon at end of statement',
  },
  // Null/undefined access
  {
    pattern: /Object is possibly '(null|undefined)'/,
    category: 'type_error',
    severity: 'medium',
    autoFixable: true,
    generateFix: (match) => `Add null check: if (value !== ${match[1]}) { ... } or use optional chaining ?.`,
  },
  // Type mismatch
  {
    pattern: /Type '(.+)' is not assignable to type '(.+)'/,
    category: 'type_error',
    severity: 'medium',
    autoFixable: false,
    generateFix: (match) => `Cast or convert type '${match[1]}' to '${match[2]}'`,
  },
  // Memory leak — missing cleanup
  {
    pattern: /Warning: Can't perform a React state update on an unmounted component/,
    category: 'memory_leak',
    severity: 'high',
    autoFixable: true,
    generateFix: () => 'Add cleanup function to useEffect: return () => { isMounted = false; }',
  },
  // Database connection error
  {
    pattern: /ECONNREFUSED|connection refused|ETIMEDOUT/i,
    category: 'database_error',
    severity: 'critical',
    autoFixable: true,
    generateFix: () => 'Retry database connection with exponential backoff',
  },
  // Out of memory
  {
    pattern: /JavaScript heap out of memory|ENOMEM/i,
    category: 'memory_leak',
    severity: 'critical',
    autoFixable: true,
    generateFix: () => 'Increase Node.js heap size: NODE_OPTIONS=--max-old-space-size=4096',
  },
];

// ============================================================================
// HEALER CLASS
// ============================================================================

export class TheDrHealer {
  private config: SelfHealingConfig;
  private stats: HealingStats;
  private diagnosisHistory: Diagnosis[] = [];
  private healingHistory: HealingAttempt[] = [];
  private learningData: Array<{ diagnosis: Diagnosis; resolution: HealingAttempt }> = [];

  constructor(config?: Partial<SelfHealingConfig>) {
    this.config = {
      enabled: true,
      autoFix: true,
      autoRollback: true,
      maxRetries: 3,
      validationRequired: true,
      notifyOnFix: true,
      learningEnabled: true,
      confidenceThreshold: 0.8,
      allowedCategories: ['database_error', 'performance_issue', 'memory_leak', 'configuration_error', 'lint', 'syntax_error'],
      ...config,
    };

    this.stats = {
      totalErrors: 0,
      fixedErrors: 0,
      failedFixes: 0,
      rollbacks: 0,
      successRate: 0,
      averageFixTimMs: 0,
      lastHealingRun: null,
      learningDataPoints: 0,
    };

    logger.info('[TheDr] 🩺 Healer initialized');
  }

  // ── Diagnosis ──────────────────────────────────────────────────────────────

  /**
   * Diagnose an error from its message and optional context
   */
  diagnose(
    errorMessage: string,
    context?: {
      file?: string;
      line?: number;
      stackTrace?: string;
      service?: string;
    }
  ): Diagnosis {
    const id = `diag_${uuidv4()}`;
    this.stats.totalErrors++;

    // Match against known patterns
    let matchedCategory: ErrorCategory = 'unknown';
    let matchedSeverity: Severity = 'medium';
    let suggestedFixes: SuggestedFix[] = [];
    let confidence = 0.5;

    for (const pattern of ERROR_PATTERNS) {
      const match = errorMessage.match(pattern.pattern);
      if (match) {
        matchedCategory = pattern.category;
        matchedSeverity = pattern.severity;
        confidence = pattern.autoFixable ? 0.85 : 0.6;

        const fixCode = pattern.generateFix(match, context?.stackTrace);
        if (fixCode) {
          suggestedFixes.push({
            description: fixCode,
            confidence: pattern.autoFixable ? 0.85 : 0.5,
            autoApplicable: pattern.autoFixable,
            riskLevel: matchedSeverity === 'critical' ? 'high' : matchedSeverity === 'high' ? 'medium' : 'low',
            estimatedTime: pattern.autoFixable ? '< 1 minute' : '5-15 minutes',
          });
        }
        break;
      }
    }

    // Check learning data for similar past resolutions
    const similarResolutions = this.findSimilarResolutions(errorMessage);
    if (similarResolutions.length > 0) {
      confidence = Math.min(confidence + 0.1 * similarResolutions.length, 0.99);
      for (const res of similarResolutions.slice(0, 2)) {
        suggestedFixes.push({
          description: `Previously resolved: ${res.resolution.fixApplied}`,
          confidence: 0.9,
          autoApplicable: true,
          riskLevel: 'low',
          estimatedTime: `~${Math.round((res.resolution.duration || 5000) / 1000)}s`,
        });
      }
    }

    const diagnosis: Diagnosis = {
      id,
      timestamp: new Date(),
      category: matchedCategory,
      severity: matchedSeverity,
      location: {
        file: context?.file,
        line: context?.line,
        service: context?.service,
      },
      symptoms: [errorMessage, ...(context?.stackTrace ? [context.stackTrace.split('\n')[0]] : [])],
      rootCause: this.inferRootCause(matchedCategory, errorMessage),
      suggestedFixes,
      relatedIssues: [],
      preventionAdvice: this.getPreventionAdvice(matchedCategory),
      confidence,
    };

    this.diagnosisHistory.push(diagnosis);
    logger.info(`[TheDr] 🔬 Diagnosed: ${id} — ${matchedCategory} (${matchedSeverity})`);

    return diagnosis;
  }

  /**
   * Attempt autonomous self-healing for a diagnosis
   */
  async heal(diagnosis: Diagnosis, mode: HealingMode = 'platform'): Promise<HealingAttempt> {
    const startTime = Date.now();
    const attemptId = `heal_${uuidv4()}`;

    logger.info(`[TheDr] 🩹 Starting heal attempt ${attemptId} for ${diagnosis.id}`);

    // Check if auto-fix is enabled and category is allowed
    if (!this.config.enabled) {
      return this.createFailedAttempt(attemptId, diagnosis.id, 'Healing disabled', startTime);
    }

    if (!this.config.allowedCategories.includes(diagnosis.category)) {
      return this.createFailedAttempt(
        attemptId,
        diagnosis.id,
        `Category '${diagnosis.category}' not in auto-fix allowlist`,
        startTime
      );
    }

    // Find best auto-applicable fix
    const autoFixes = diagnosis.suggestedFixes.filter(
      f => f.autoApplicable && f.confidence >= this.config.confidenceThreshold
    );

    if (autoFixes.length === 0) {
      logger.warn(`[TheDr] No high-confidence auto-fixes for ${diagnosis.id}`);
      return this.createFailedAttempt(
        attemptId,
        diagnosis.id,
        'No high-confidence auto-applicable fixes available',
        startTime
      );
    }

    const bestFix = autoFixes.sort((a, b) => b.confidence - a.confidence)[0];

    // Apply the fix
    let attempt: HealingAttempt = {
      id: attemptId,
      diagnosisId: diagnosis.id,
      fixApplied: bestFix.description,
      explanation: `Applied fix for ${diagnosis.category}: ${bestFix.description}`,
      confidence: bestFix.confidence,
      timestamp: new Date(),
      status: 'applied',
      rollbackPerformed: false,
    };

    try {
      // Execute the fix
      await this.applyFix(diagnosis, bestFix);

      // Validate if required
      if (this.config.validationRequired) {
        const validation = await this.validateFix(diagnosis);
        attempt.validationResult = validation;

        if (!validation.passed && this.config.autoRollback) {
          logger.warn(`[TheDr] Validation failed, rolling back ${attemptId}`);
          await this.rollback(diagnosis, attempt);
          attempt.status = 'rolled_back';
          attempt.rollbackPerformed = true;
          this.stats.rollbacks++;
        } else if (validation.passed) {
          attempt.status = 'applied';
          this.stats.fixedErrors++;
          logger.info(`[TheDr] ✅ Fix validated and applied: ${attemptId}`);
        }
      } else {
        attempt.status = 'applied';
        this.stats.fixedErrors++;
      }
    } catch (err) {
      logger.error({ err }, `[TheDr] Fix application failed: ${attemptId}`);
      attempt.status = 'failed';
      this.stats.failedFixes++;
    }

    attempt.duration = Date.now() - startTime;
    this.healingHistory.push(attempt);
    this.updateStats();

    // Learn from this attempt
    if (this.config.learningEnabled) {
      this.learn(diagnosis, attempt);
    }

    return attempt;
  }

  // ── Health Check ───────────────────────────────────────────────────────────

  /**
   * Run comprehensive system health check
   */
  async runHealthCheck(): Promise<HealthReport> {
    const systems: SystemHealth[] = [];
    let totalScore = 0;

    // Memory health
    const mem = process.memoryUsage();
    const heapUsedMB = mem.heapUsed / 1024 / 1024;
    const heapTotalMB = mem.heapTotal / 1024 / 1024;
    const memPct = (heapUsedMB / heapTotalMB) * 100;

    systems.push({
      name: 'Memory',
      status: memPct < 70 ? 'healthy' : memPct < 90 ? 'warning' : 'error',
      metrics: {
        heapUsedMB: Math.round(heapUsedMB),
        heapTotalMB: Math.round(heapTotalMB),
        usagePercent: Math.round(memPct),
        rssMB: Math.round(mem.rss / 1024 / 1024),
      },
      issues: memPct > 90 ? ['High memory usage — potential memory leak'] : [],
    });
    totalScore += memPct < 70 ? 100 : memPct < 90 ? 70 : 30;

    // Uptime health
    const uptimeHours = process.uptime() / 3600;
    systems.push({
      name: 'Process',
      status: 'healthy',
      metrics: {
        uptimeHours: Math.round(uptimeHours * 10) / 10,
        pid: process.pid,
      },
      issues: [],
    });
    totalScore += 100;

    // Healing engine health
    const healingHealthy = this.config.enabled;
    systems.push({
      name: 'Healing Engine',
      status: healingHealthy ? 'healthy' : 'warning',
      metrics: {
        totalErrors: this.stats.totalErrors,
        fixedErrors: this.stats.fixedErrors,
        successRate: Math.round(this.stats.successRate * 100),
        learningDataPoints: this.stats.learningDataPoints,
      },
      issues: healingHealthy ? [] : ['Healing engine disabled'],
    });
    totalScore += healingHealthy ? 100 : 50;

    const avgScore = totalScore / systems.length;
    const overallHealth: HealthReport['overallHealth'] =
      avgScore >= 80 ? 'healthy' : avgScore >= 50 ? 'degraded' : 'critical';

    return {
      timestamp: new Date(),
      overallHealth,
      score: Math.round(avgScore),
      systems,
      recommendations: systems
        .filter(s => s.status !== 'healthy')
        .flatMap(s => s.issues.map(i => `[${s.name}] ${i}`)),
      predictedIssues: this.predictIssues(),
    };
  }

  // ── Predictive Maintenance ─────────────────────────────────────────────────

  predictIssues(): PredictedIssue[] {
    const predictions: PredictedIssue[] = [];
    const mem = process.memoryUsage();
    const memPct = (mem.heapUsed / mem.heapTotal) * 100;

    if (memPct > 60) {
      predictions.push({
        description: 'Memory pressure increasing — potential OOM in high-load scenarios',
        probability: memPct / 100,
        timeframe: memPct > 80 ? '1-4 hours' : '24-48 hours',
        preventionSteps: [
          'Review recent code changes for memory leaks',
          'Implement LRU cache eviction',
          'Schedule service restart during low-traffic window',
        ],
      });
    }

    // Predict based on error rate trends
    const recentErrors = this.diagnosisHistory.filter(
      d => Date.now() - d.timestamp.getTime() < 3600_000 // last hour
    );
    if (recentErrors.length > 10) {
      predictions.push({
        description: `High error rate detected: ${recentErrors.length} errors in last hour`,
        probability: 0.8,
        timeframe: '1-2 hours',
        preventionSteps: [
          'Review recent deployments',
          'Check external service dependencies',
          'Enable circuit breakers',
        ],
      });
    }

    return predictions;
  }

  // ── Performance Analysis ───────────────────────────────────────────────────

  analyzePerformance(): {
    metrics: Record<string, number>;
    bottlenecks: string[];
    recommendations: string[];
  } {
    const mem = process.memoryUsage();
    const metrics: Record<string, number> = {
      uptimeSeconds: Math.round(process.uptime()),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
      externalMB: Math.round(mem.external / 1024 / 1024),
      healingSuccessRate: Math.round(this.stats.successRate * 100),
      totalDiagnoses: this.diagnosisHistory.length,
      totalHealingAttempts: this.healingHistory.length,
    };

    const bottlenecks: string[] = [];
    const recommendations: string[] = [];

    if (metrics.heapUsedMB > 500) {
      bottlenecks.push('High heap memory consumption');
      recommendations.push('Implement object pooling and reduce allocations');
    }

    if (this.stats.successRate < 0.7 && this.stats.totalErrors > 10) {
      bottlenecks.push('Low healing success rate');
      recommendations.push('Review error patterns and expand auto-fix rules');
    }

    return { metrics, bottlenecks, recommendations };
  }

  // ── Learning ───────────────────────────────────────────────────────────────

  private learn(diagnosis: Diagnosis, resolution: HealingAttempt): void {
    this.learningData.push({ diagnosis, resolution });
    this.stats.learningDataPoints = this.learningData.length;
    logger.debug(`[TheDr] 🧠 Learned from ${resolution.status} resolution of ${diagnosis.category}`);
  }

  private findSimilarResolutions(errorMessage: string): Array<{ diagnosis: Diagnosis; resolution: HealingAttempt }> {
    return this.learningData.filter(({ diagnosis, resolution }) => {
      if (resolution.status !== 'applied') return false;
      return diagnosis.symptoms.some(s =>
        s.toLowerCase().includes(errorMessage.toLowerCase().slice(0, 20))
      );
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async applyFix(diagnosis: Diagnosis, fix: SuggestedFix): Promise<void> {
    // In production this would apply actual code changes, restart services, etc.
    // For now we log the fix and simulate application
    logger.info(`[TheDr] Applying fix: ${fix.description}`);
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate async work
  }

  private async validateFix(diagnosis: Diagnosis): Promise<{ passed: boolean; errors?: string[] }> {
    // In production this would run tests, health checks, etc.
    await new Promise(resolve => setTimeout(resolve, 200));
    return { passed: true };
  }

  private async rollback(diagnosis: Diagnosis, attempt: HealingAttempt): Promise<void> {
    logger.warn(`[TheDr] Rolling back fix for ${diagnosis.id}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private createFailedAttempt(id: string, diagnosisId: string, reason: string, startTime: number): HealingAttempt {
    const attempt: HealingAttempt = {
      id,
      diagnosisId,
      fixApplied: 'none',
      explanation: reason,
      confidence: 0,
      timestamp: new Date(),
      status: 'failed',
      duration: Date.now() - startTime,
      rollbackPerformed: false,
    };
    this.healingHistory.push(attempt);
    this.stats.failedFixes++;
    this.updateStats();
    return attempt;
  }

  private inferRootCause(category: ErrorCategory, message: string): string {
    const causes: Record<ErrorCategory, string> = {
      syntax_error: 'Malformed code syntax — likely a typo or missing token',
      runtime_error: 'Error occurred during execution — check input validation and edge cases',
      type_error: 'Type mismatch — TypeScript type system violation',
      logic_error: 'Incorrect algorithm or business logic',
      performance_issue: 'Resource bottleneck — CPU, memory, or I/O bound operation',
      memory_leak: 'Object references not released — check event listeners and closures',
      security_vulnerability: 'Security policy violation — review OWASP guidelines',
      dependency_conflict: 'Package version incompatibility — check package.json',
      configuration_error: 'Invalid or missing configuration — check environment variables',
      network_error: 'Network connectivity or timeout issue',
      database_error: 'Database connection, query, or schema issue',
      api_error: 'External API failure or contract violation',
      typescript: 'TypeScript compilation error',
      build: 'Build pipeline failure',
      lint: 'Code style or quality rule violation',
      test: 'Test assertion failure',
      unknown: 'Root cause undetermined — manual investigation required',
    };
    return causes[category] || 'Unknown root cause';
  }

  private getPreventionAdvice(category: ErrorCategory): string {
    const advice: Record<ErrorCategory, string> = {
      syntax_error: 'Enable editor syntax highlighting and use a linter (ESLint)',
      runtime_error: 'Add input validation, error boundaries, and comprehensive tests',
      type_error: 'Use strict TypeScript mode and avoid `any` types',
      logic_error: 'Write unit tests for all business logic paths',
      performance_issue: 'Profile regularly and set performance budgets',
      memory_leak: 'Use WeakMap/WeakRef for caches, always clean up event listeners',
      security_vulnerability: 'Run SAST tools in CI/CD, follow OWASP Top 10',
      dependency_conflict: 'Pin dependency versions and use lockfiles',
      configuration_error: 'Validate all env vars at startup with Zod',
      network_error: 'Implement retry logic with exponential backoff and circuit breakers',
      database_error: 'Use connection pooling and implement health checks',
      api_error: 'Implement API versioning and contract testing',
      typescript: 'Run tsc --noEmit in CI/CD pipeline',
      build: 'Test builds locally before pushing',
      lint: 'Run ESLint as pre-commit hook',
      test: 'Maintain >80% test coverage',
      unknown: 'Add comprehensive logging and monitoring',
    };
    return advice[category] || 'Follow software engineering best practices';
  }

  private updateStats(): void {
    const total = this.stats.fixedErrors + this.stats.failedFixes;
    this.stats.successRate = total > 0 ? this.stats.fixedErrors / total : 0;
    this.stats.lastHealingRun = new Date();

    const completedAttempts = this.healingHistory.filter(h => h.duration !== undefined);
    if (completedAttempts.length > 0) {
      this.stats.averageFixTimMs =
        completedAttempts.reduce((sum, h) => sum + (h.duration || 0), 0) / completedAttempts.length;
    }
  }

  // ── Public Accessors ───────────────────────────────────────────────────────

  getStats(): HealingStats { return { ...this.stats }; }
  getConfig(): SelfHealingConfig { return { ...this.config }; }
  updateConfig(updates: Partial<SelfHealingConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('[TheDr] Config updated', updates);
  }
  getDiagnosisHistory(limit = 50): Diagnosis[] {
    return this.diagnosisHistory.slice(-limit);
  }
  getHealingHistory(limit = 50): HealingAttempt[] {
    return this.healingHistory.slice(-limit);
  }
  clearHistory(): void {
    this.diagnosisHistory = [];
    this.healingHistory = [];
    logger.info('[TheDr] History cleared');
  }
}

// Singleton
export const healer = new TheDrHealer();