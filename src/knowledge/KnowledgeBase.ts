import { randomUUID } from 'crypto';
import type { IssueCategory, KnowledgeEntry, Language, RepairPattern } from '../types';

/**
 * KnowledgeBase
 *
 * In-memory store of repair patterns that The Dr learns from.
 * Each successful or failed repair updates the pattern's success/failure
 * counters so future decisions can be weighted by track record.
 *
 * In production, `export()` / `import()` allow persistence to disk or a DB.
 */
export class KnowledgeBase {
  private entries: Map<string, KnowledgeEntry> = new Map();

  constructor() {
    this.seedBuiltins();
  }

  // ─── Querying ─────────────────────────────────────────────────────────────

  find(category: IssueCategory, language: Language): KnowledgeEntry[] {
    const results: KnowledgeEntry[] = [];
    for (const entry of this.entries.values()) {
      const lang = entry.pattern.language;
      if (entry.pattern.category === category && (lang === 'any' || lang === language)) {
        results.push(entry);
      }
    }
    // Sort by success rate desc, then by successCount desc for tie-breaking
    return results.sort((a, b) => {
      const rateA = this.successRate(a.pattern);
      const rateB = this.successRate(b.pattern);
      return rateB - rateA || b.pattern.successCount - a.pattern.successCount;
    });
  }

  findByTag(tag: string): KnowledgeEntry[] {
    return [...this.entries.values()].filter(e => e.tags.includes(tag));
  }

  getPattern(id: string): KnowledgeEntry | undefined {
    return this.entries.get(id);
  }

  list(): KnowledgeEntry[] {
    return [...this.entries.values()];
  }

  // ─── Learning ─────────────────────────────────────────────────────────────

  recordSuccess(patternId: string): void {
    const entry = this.entries.get(patternId);
    if (!entry) return;
    entry.pattern.successCount++;
    entry.pattern.lastUsed = new Date();
  }

  recordFailure(patternId: string): void {
    const entry = this.entries.get(patternId);
    if (!entry) return;
    entry.pattern.failureCount++;
    entry.pattern.lastUsed = new Date();
  }

  addPattern(pattern: Omit<RepairPattern, 'id'>, examples: KnowledgeEntry['examples'] = [], tags: string[] = []): string {
    const id = randomUUID();
    this.entries.set(id, {
      pattern: { ...pattern, id },
      examples,
      tags,
    });
    return id;
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  export(): string {
    return JSON.stringify([...this.entries.values()], null, 2);
  }

  import(json: string): void {
    const entries: KnowledgeEntry[] = JSON.parse(json);
    for (const entry of entries) {
      this.entries.set(entry.pattern.id, entry);
    }
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  stats() {
    const patterns = [...this.entries.values()].map(e => e.pattern);
    const total = patterns.length;
    const totalUses = patterns.reduce((s, p) => s + p.successCount + p.failureCount, 0);
    const overallSuccessRate = totalUses
      ? patterns.reduce((s, p) => s + p.successCount, 0) / totalUses
      : 0;

    return { total, totalUses, overallSuccessRate };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private successRate(p: RepairPattern): number {
    const uses = p.successCount + p.failureCount;
    return uses ? p.successCount / uses : 0.5; // neutral prior for unused patterns
  }

  private seedBuiltins(): void {
    const builtins: Array<[Omit<RepairPattern, 'id'>, KnowledgeEntry['examples'], string[]]> = [
      [
        {
          name: 'Remove console.log',
          description: 'Strip console.log/debug/info calls from production code',
          category: 'dead-code',
          language: 'any',
          matchRegex: 'console\\.(log|debug|info|warn)\\(',
          successCount: 42,
          failureCount: 0,
        },
        [{ before: 'console.log("hello");', after: '' }],
        ['cleanup', 'dead-code', 'console'],
      ],
      [
        {
          name: 'Remove debugger',
          description: 'Remove debugger; statements from production code',
          category: 'dead-code',
          language: 'any',
          matchRegex: '\\bdebugger\\s*;',
          successCount: 18,
          failureCount: 0,
        },
        [{ before: 'debugger;', after: '' }],
        ['cleanup', 'dead-code', 'debugger'],
      ],
      [
        {
          name: 'Replace eval()',
          description: 'Replace eval() with safer alternatives',
          category: 'security',
          language: 'javascript',
          matchRegex: '\\beval\\s*\\(',
          successCount: 5,
          failureCount: 2,
        },
        [{ before: "const v = eval(userInput);", after: "const v = JSON.parse(userInput);" }],
        ['security', 'eval', 'injection'],
      ],
      [
        {
          name: 'Parameterize SQL query',
          description: 'Replace string-concatenated SQL with parameterized queries',
          category: 'security',
          language: 'any',
          matchRegex: 'query\\s*\\+\\s*(req\\.|params\\.|query\\.)',
          successCount: 8,
          failureCount: 1,
        },
        [
          {
            before: "db.query('SELECT * FROM users WHERE id = ' + req.params.id)",
            after: "db.query('SELECT * FROM users WHERE id = $1', [req.params.id])",
          },
        ],
        ['security', 'sql', 'injection'],
      ],
    ];

    for (const [pattern, examples, tags] of builtins) {
      this.addPattern(pattern, examples, tags);
    }
  }
}
