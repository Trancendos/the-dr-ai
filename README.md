# The Dr — Autonomous Healing & Code Repair Agent

> **The Lab** — Self-Healing Component of the Trancendos Industry 6.0 Platform

*"The mad scientist of the platform — wielding both the flask of innovation and the wrench of repair. Where others see errors, The Dr sees opportunities for evolution."*

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        THE DR — AI                              │
│                Autonomous Healing & Code Repair                 │
├──────────────────┬──────────────────┬───────────────────────────┤
│  Healing Engine  │  Code Analyzer   │   Diagnostics Engine      │
│  (diagnose+heal) │  (static scan)   │   (anomaly detection)     │
├──────────────────┴──────────────────┴───────────────────────────┤
│                      REST API (Express)                         │
└─────────────────────────────────────────────────────────────────┘
```

### Components

| Component | File | Description |
|-----------|------|-------------|
| Healing Engine | `src/healing/healer.ts` | Core diagnose + heal + learn loop |
| Code Analyzer | `src/analysis/code-analyzer.ts` | Static analysis + auto-fix generation |
| Diagnostics Engine | `src/diagnostics/diagnostics.ts` | Anomaly detection + closed-loop monitoring |
| API Server | `src/api/server.ts` | REST interface (14 endpoints) |
| Logger | `src/utils/logger.ts` | Pino structured logging |

---

## Capabilities

### 🔬 Core Healing
- Error detection & diagnosis (13 error categories)
- Pattern-based root cause analysis
- Auto-applicable fix generation
- Fix validation + rollback on failure
- Learning from successful resolutions

### 🧪 Code Analysis
- Static analysis with 12 built-in rules
- Security scanning (SEC001-003): hardcoded secrets, SQL injection, eval()
- Performance rules (PERF001-003): sync I/O, missing await, console.log
- TypeScript rules (TS001-002): any type, non-null assertions
- Error handling rules (ERR001-002): empty catch, unhandled promises
- Memory rules (MEM001-002): event listener leaks, setInterval leaks
- Auto-fix generation for applicable rules

### 🔭 Diagnostics
- Real-time metric collection (memory, CPU, process)
- Anomaly detection with configurable thresholds
- Closed-loop monitoring (configurable interval)
- Accuracy tracking: diagnosis accuracy, fix success rate, MTTH
- Predictive issue detection

---

## API Reference

### Health & Metrics
```
GET  /health                          — Service health
GET  /metrics                         — Full metrics snapshot
```

### Healing
```
POST /api/v1/heal                     — Diagnose + heal an error
POST /api/v1/diagnose                 — Diagnose only (no healing)
GET  /api/v1/health-check             — Full system health report
GET  /api/v1/anomalies                — Current anomalies
GET  /api/v1/history/diagnoses        — Diagnosis history
GET  /api/v1/history/healing          — Healing attempt history
GET  /api/v1/stats                    — Healing statistics + accuracy
```

### Code Analysis
```
POST /api/v1/code-analysis            — Scan single file
POST /api/v1/code-review              — Scan multiple files + report
POST /api/v1/code-fix                 — Generate auto-fix for issue
```

### Diagnostics
```
GET  /api/v1/diagnostics/metrics      — Current metrics snapshot
GET  /api/v1/diagnostics/closed-loop  — Closed-loop monitoring status
GET  /api/v1/diagnostics/accuracy     — Accuracy metrics
PATCH /api/v1/config                  — Update healer configuration
```

---

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev       # Development with hot reload
npm run build     # Production build
npm start         # Run production build
npm run typecheck # Type check
npm test          # Run tests
```

---

## Example Usage

### Heal an error
```bash
curl -X POST http://localhost:4001/api/v1/heal \
  -H "Content-Type: application/json" \
  -d '{"error": "ECONNREFUSED database connection refused", "context": {"service": "api"}}'
```

### Scan code for issues
```bash
curl -X POST http://localhost:4001/api/v1/code-analysis \
  -H "Content-Type: application/json" \
  -d '{"content": "const x = eval(userInput);", "filename": "app.ts"}'
```

---

## Zero-Cost Mandate

The Dr operates entirely without LLM API calls by default:
- Pattern-based diagnosis uses regex matching (zero cost)
- Static analysis uses rule-based scanning (zero cost)
- LLM integration is optional — set `LLM_PROVIDER=openai` to enable AI-powered diagnosis

---

## Related Repositories

| Repo | Component | Description |
|------|-----------|-------------|
| [cornelius-ai](https://github.com/Trancendos/cornelius-ai) | Luminous | Master orchestrator |
| [infinity-portal](https://github.com/Trancendos/infinity-portal) | Infinity Portal | Main gateway |
| [norman-ai](https://github.com/Trancendos/norman-ai) | Norman | Security intelligence |
| [guardian-ai](https://github.com/Trancendos/guardian-ai) | Guardian | IAM & zero-trust |

---

*Part of the Trancendos Industry 6.0 / 2060 Standard platform.*