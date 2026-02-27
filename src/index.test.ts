import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import TheDrAiService, { DEFAULT_CONFIG, DiagnosticEngine, KnowledgeBase, ServiceManager } from './index';

// ─── TheDrAiService ───────────────────────────────────────────────────────────

describe('TheDrAiService', () => {
  it('starts and logs version info', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const service = new TheDrAiService();
    await service.start();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Starting'));
    spy.mockRestore();
  });

  it('stops without throwing', async () => {
    const service = new TheDrAiService();
    await expect(service.stop()).resolves.toBeUndefined();
  });

  it('getStatus returns expected shape', () => {
    const service = new TheDrAiService();
    const status = service.getStatus();
    expect(status.name).toBe('the-dr-ai');
    expect(status.status).toBe('active');
    expect(Array.isArray(status.capabilities)).toBe(true);
    expect(status.capabilities.length).toBeGreaterThan(0);
    expect(status.knowledge).toHaveProperty('total');
    expect(Array.isArray(status.services)).toBe(true);
  });

  it('exposes agent, serviceManager, and knowledge accessors', () => {
    const service = new TheDrAiService();
    expect(service.getAgent()).toBeDefined();
    expect(service.getServiceManager()).toBeDefined();
    expect(service.getKnowledge()).toBeDefined();
  });
});

// ─── DiagnosticEngine ────────────────────────────────────────────────────────

describe('DiagnosticEngine', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'the-dr-'));
  });

  const writeFile = (name: string, content: string) => {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, content, 'utf8');
    return p;
  };

  it('returns a report with correct structure', async () => {
    const file = writeFile('clean.ts', 'const x = 1;\n');
    const engine = new DiagnosticEngine();
    const report = await engine.analyse([file]);
    expect(report).toHaveProperty('id');
    expect(report).toHaveProperty('issues');
    expect(report).toHaveProperty('summary');
    expect(report.files).toContain(file);
  });

  it('detects console.log as dead-code', async () => {
    const file = writeFile('dirty.ts', 'console.log("debug");\nconst x = 1;\n');
    const engine = new DiagnosticEngine();
    const report = await engine.analyse([file]);
    const consolIssue = report.issues.find(i => i.message.includes('console statement'));
    expect(consolIssue).toBeDefined();
    expect(consolIssue?.category).toBe('dead-code');
    expect(consolIssue?.fixable).toBe(true);
  });

  it('detects debugger statement', async () => {
    const file = writeFile('debug.ts', 'function foo() {\n  debugger;\n}\n');
    const engine = new DiagnosticEngine();
    const report = await engine.analyse([file]);
    const dbgIssue = report.issues.find(i => i.message.includes('debugger'));
    expect(dbgIssue).toBeDefined();
    expect(dbgIssue?.severity).toBe('high');
  });

  it('detects eval() as security issue', async () => {
    const file = writeFile('eval.ts', 'const r = eval(userInput);\n');
    const engine = new DiagnosticEngine();
    const report = await engine.analyse([file]);
    const evalIssue = report.issues.find(i => i.category === 'security' && i.message.includes('eval'));
    expect(evalIssue).toBeDefined();
    expect(evalIssue?.severity).toBe('critical');
  });

  it('detects hardcoded secret', async () => {
    const file = writeFile('secret.ts', 'const apikey = "super-secret-123";\n');
    const engine = new DiagnosticEngine();
    const report = await engine.analyse([file]);
    const secretIssue = report.issues.find(i => i.message.includes('hardcoded secret'));
    expect(secretIssue).toBeDefined();
    expect(secretIssue?.severity).toBe('critical');
  });

  it('builds correct summary counts', async () => {
    const file = writeFile('multi.ts', [
      'console.log("x");',
      'debugger;',
      'eval(userInput);',
    ].join('\n'));
    const engine = new DiagnosticEngine();
    const report = await engine.analyse([file]);
    expect(report.summary.total).toBeGreaterThanOrEqual(3);
    expect(report.summary.fixable).toBeGreaterThanOrEqual(1);
  });

  it('handles missing file gracefully', async () => {
    const engine = new DiagnosticEngine();
    const report = await engine.analyse(['/nonexistent/file.ts']);
    expect(report.issues.length).toBe(1);
    expect(report.issues[0].message).toContain('Cannot read file');
  });
});

// ─── KnowledgeBase ───────────────────────────────────────────────────────────

describe('KnowledgeBase', () => {
  it('seeds built-in patterns on construction', () => {
    const kb = new KnowledgeBase();
    expect(kb.stats().total).toBeGreaterThan(0);
  });

  it('finds patterns by category and language', () => {
    const kb = new KnowledgeBase();
    const results = kb.find('dead-code', 'typescript');
    expect(results.length).toBeGreaterThan(0);
  });

  it('records success and updates counts', () => {
    const kb = new KnowledgeBase();
    const entry = kb.list()[0];
    const before = entry.pattern.successCount;
    kb.recordSuccess(entry.pattern.id);
    expect(kb.getPattern(entry.pattern.id)?.pattern.successCount).toBe(before + 1);
  });

  it('records failure and updates counts', () => {
    const kb = new KnowledgeBase();
    const entry = kb.list()[0];
    const before = entry.pattern.failureCount;
    kb.recordFailure(entry.pattern.id);
    expect(kb.getPattern(entry.pattern.id)?.pattern.failureCount).toBe(before + 1);
  });

  it('exports and re-imports cleanly', () => {
    const kb = new KnowledgeBase();
    const json = kb.export();
    const kb2 = new KnowledgeBase();
    const countBefore = kb2.list().length;
    kb2.import(json);
    // After import, built-ins will be duplicated (expected in this test scenario)
    expect(kb2.list().length).toBeGreaterThanOrEqual(countBefore);
  });

  it('allows adding custom patterns', () => {
    const kb = new KnowledgeBase();
    const before = kb.stats().total;
    kb.addPattern(
      { name: 'Test pattern', description: 'desc', category: 'style', language: 'any', successCount: 0, failureCount: 0 },
      [],
      ['test'],
    );
    expect(kb.stats().total).toBe(before + 1);
  });
});

// ─── ServiceManager ──────────────────────────────────────────────────────────

describe('ServiceManager', () => {
  it('registers services', () => {
    const sm = new ServiceManager();
    sm.register({ name: 'my-linter', type: 'linter', enabled: true, command: 'echo ok' });
    expect(sm.getService('my-linter')).toBeDefined();
  });

  it('lists only enabled services', () => {
    const sm = new ServiceManager();
    sm.registerMany([
      { name: 'enabled', type: 'linter', enabled: true, command: 'echo ok' },
      { name: 'disabled', type: 'formatter', enabled: false, command: 'echo bad' },
    ]);
    const enabled = sm.enabledServices();
    expect(enabled.some(s => s.name === 'enabled')).toBe(true);
    expect(enabled.some(s => s.name === 'disabled')).toBe(false);
  });

  it('throws when running an unregistered service', async () => {
    const sm = new ServiceManager();
    await expect(sm.run('ghost')).rejects.toThrow("Service 'ghost' is not registered");
  });

  it('throws when running a disabled service', async () => {
    const sm = new ServiceManager();
    sm.register({ name: 'off', type: 'linter', enabled: false, command: 'echo x' });
    await expect(sm.run('off')).rejects.toThrow("Service 'off' is disabled");
  });

  it('defaultConfigs returns the expected services', () => {
    const configs = ServiceManager.defaultConfigs();
    const names = configs.map(c => c.name);
    expect(names).toContain('eslint');
    expect(names).toContain('vitest');
    expect(names).toContain('git');
  });
});

// ─── DEFAULT_CONFIG ───────────────────────────────────────────────────────────

describe('DEFAULT_CONFIG', () => {
  it('has the right shape', () => {
    expect(DEFAULT_CONFIG.name).toBe('the-dr-ai');
    expect(DEFAULT_CONFIG.learningEnabled).toBe(true);
    expect(DEFAULT_CONFIG.supportedLanguages.length).toBeGreaterThan(0);
    expect(Array.isArray(DEFAULT_CONFIG.services)).toBe(true);
  });
});
