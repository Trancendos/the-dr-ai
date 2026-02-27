import { EventEmitter } from 'events';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ServiceConfig } from '../types';

const execFileAsync = promisify(execFile);

export interface ServiceResult {
  service: string;
  success: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * ServiceManager
 *
 * Manages connections to external tools in The Dr's ecosystem:
 *   - Linters (eslint, pylint, ruff)
 *   - Formatters (prettier, black)
 *   - Compilers / type checkers (tsc, mypy)
 *   - Test runners (vitest, pytest, jest)
 *   - VCS (git)
 *
 * Each service exposes a `run()` call with optional args.
 * Results are emitted as events so the HealingAgent can react.
 *
 * Future: ecosystem endpoint registration so services from other
 * Luminous-MastermindAI repos can register themselves here.
 */
export class ServiceManager extends EventEmitter {
  private services: Map<string, ServiceConfig> = new Map();

  // ─── Registration ─────────────────────────────────────────────────────────

  register(config: ServiceConfig): void {
    this.services.set(config.name, config);
    this.emit('registered', config);
  }

  registerMany(configs: ServiceConfig[]): void {
    for (const c of configs) this.register(c);
  }

  getService(name: string): ServiceConfig | undefined {
    return this.services.get(name);
  }

  listServices(): ServiceConfig[] {
    return [...this.services.values()];
  }

  enabledServices(): ServiceConfig[] {
    return this.listServices().filter(s => s.enabled);
  }

  // ─── Execution ────────────────────────────────────────────────────────────

  async run(name: string, args: string[] = [], cwd = process.cwd()): Promise<ServiceResult> {
    const service = this.services.get(name);
    if (!service) throw new Error(`Service '${name}' is not registered`);
    if (!service.enabled) throw new Error(`Service '${name}' is disabled`);
    if (!service.command) throw new Error(`Service '${name}' has no command configured`);

    const [cmd, ...baseArgs] = service.command.split(' ');
    const allArgs = [...baseArgs, ...args];
    const start = Date.now();

    let result: ServiceResult;
    try {
      const { stdout, stderr } = await execFileAsync(cmd, allArgs, { cwd, timeout: 60_000 });
      result = { service: name, success: true, stdout, stderr, durationMs: Date.now() - start };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string };
      result = {
        service: name,
        success: false,
        stdout: e.stdout ?? '',
        stderr: e.stderr ?? String(err),
        durationMs: Date.now() - start,
      };
    }

    this.emit('result', result);
    return result;
  }

  /** Run all enabled services of a given type in parallel. */
  async runByType(type: ServiceConfig['type'], args: string[] = [], cwd = process.cwd()): Promise<ServiceResult[]> {
    const matching = this.enabledServices().filter(s => s.type === type);
    return Promise.all(matching.map(s => this.run(s.name, args, cwd)));
  }

  // ─── Built-in ecosystem presets ───────────────────────────────────────────

  static defaultConfigs(): ServiceConfig[] {
    return [
      {
        name: 'eslint',
        type: 'linter',
        enabled: false,   // enable when eslint is installed in the project
        command: 'npx eslint --format json',
      },
      {
        name: 'prettier',
        type: 'formatter',
        enabled: false,
        command: 'npx prettier --check',
      },
      {
        name: 'tsc',
        type: 'compiler',
        enabled: false,
        command: 'npx tsc --noEmit',
      },
      {
        name: 'vitest',
        type: 'test-runner',
        enabled: false,
        command: 'npx vitest run',
      },
      {
        name: 'git',
        type: 'vcs',
        enabled: true,
        command: 'git',
      },
    ];
  }
}
