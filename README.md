<div align="center">
  <img src="frontend/src/assets/logo-white.png" alt="ContractSentinel" height="90">

  <h1>ContractSentinel</h1>

  <p>
    Living API contract monitor for microservices, detect breaking changes before they reach production.
  </p>
</div>

---

The problem you have right now: Suppose you have three services running. A field gets renamed in service 1, service 2 breaks, nobody finds out until a feature demo. You have no tester. You have Swagger docs but no enforcement.

**ContractSentinel** is a living API contract monitor that polls each of your microservices' OpenAPI specs, diffs them against their oldest-ever snapshot (the original contract), and classifies every change as breaking or safe — displayed on a real-time React dashboard.

---

## What It Does

- **Polls** each registered service's `/v3/api-docs` (or any OpenAPI endpoint) on a configurable schedule
- **Detects** what changed —> path added/removed, response field added/removed, field type changed, required request field added
- **Classifies** every change as `BREAKING` or `SAFE` using oldest-baseline drift detection
- **Stores** a permanent snapshot and drift history in PostgreSQL (SHA-256 dedup — no duplicate snapshots)
- **Maps** your service dependency graph: shared databases, REST calls, webhooks, external APIs
- **Explores** your database schema: foreign key relationships, cross-service table dependencies
- **Tracks** latency, endpoint usage, response samples, and dead endpoints
- **Analyses** schema changes with an AI agent (Claude or local Ollama) to assess migration risk
- **Alerts** via configured channels when breaking changes are detected

---

## Feature Overview

| Feature | Description |
|---|---|
| **Contract Changes feed** | Real-time list of all breaking and safe changes with severity, affected endpoint, old/new value |
| **Impact panel** | Per drift event: which services call the affected endpoint (direct hit vs indirect dependency) |
| **Mark as reviewed** | Toggle "Mark it" / "Marked" per drift event — bidirectional acknowledge/unacknowledge |
| **Dependency graph** | ELK.js-powered layered graph: services as nodes, shared DBs / REST calls / webhooks as relay cards |
| **DB schema explorer** | Click any table → see it + 1-hop FK neighbors; progressive expand; cross-service FKs highlighted |
| **API Catalogue** | Browse every endpoint across all services with request/response schemas and latency pills |
| **Infrastructure view** | Container health, gateway routes, uptime |
| **Performance tracking** | Per-endpoint p50/p95 latency scraped from Prometheus; sparklines and volatility over time |
| **Response sampler** | Configure and run live response samples; durationMs feeds latency pills when Prometheus has no data |
| **AI schema analysis** | LLM agent (Claude or Ollama) analyses schema diffs and scores migration risk |
| **Alert channels** | Webhook / email alerts on breaking contract changes |

---

## Architecture

```
┌──────────────────────────────┐
│  Your Microservices          │
│  service-a:8080/v3/api-docs  │            
│  service-b:8081/v3/api-docs  │ ──────────►  ContractSentinel Backend (Spring Boot) 
│  service-c:8082/v3/api-docs  │              • Polls & snapshots every 5 min
└──────────────────────────────┘              • SHA-256 dedup
                                              • OpenAPI diff engine
                                              • REST API on :8090
                                                     │
                                                     ▼
                                               ContractSentinel UI (React)
                                              • Overview dashboard + charts
                                              • Drift feed with severity filter
                                              • Service detail + snapshot history
                                              • One-click "Review" to acknowledge
```

**Change types detected:**

| Change Type | Severity |
|---|---|
| `PATH_REMOVED` | BREAKING |
| `RESPONSE_FIELD_REMOVED` | BREAKING |
| `RESPONSE_FIELD_TYPE_CHANGED` | BREAKING |
| `REQUEST_REQUIRED_FIELD_ADDED` | BREAKING |
| `PATH_ADDED` | SAFE |
| `RESPONSE_FIELD_ADDED` | SAFE |
| `REQUEST_OPTIONAL_FIELD_ADDED` | SAFE |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Spring Boot 4.0.1, Java 21 |
| Database | PostgreSQL 17 |
| OpenAPI parsing | swagger-parser 2.1.25 |
| Frontend | React 19, TypeScript 5 |
| Routing | TanStack Router v1 |
| Data fetching | TanStack Query v5 |
| Styling | Tailwind CSS v4 |
| Graph layout | React Flow + ELK.js (Eclipse Layout Kernel) |
| Charts | Recharts v3 |

---

## Project Structure

```
contract-sentinel/
├── backend/
│   ├── pom.xml
│   ├── docker-compose.yml          PostgreSQL 17 for local dev
│   └── src/main/
│       ├── java/io/contractsentinel/
│       │   ├── config/             SentinelProperties, CORS, request ID filter
│       │   ├── core/               Shared types (PaginatedResponse)
│       │   ├── exception/          SentinelException, HttpExceptionHandler
│       │   ├── seed/               DataSeeder (reads services from application.yaml)
│       │   ├── registry/           ServiceRegistry — register/list monitored services
│       │   ├── snapshot/           SpecSnapshot — fetch & store OpenAPI specs
│       │   ├── drift/              DriftEvent — detect & classify contract changes
│       │   ├── graph/              ServiceDependency — dependency graph, DB schema
│       │   ├── catalogue/          ApiCatalogue — browse all endpoints
│       │   ├── sampler/            ResponseSampler — live response samples
│       │   ├── latency/            LatencyMetric — per-endpoint latency history
│       │   ├── usage/              EndpointUsage — dead endpoint detection
│       │   ├── deployment/         DeploymentEvent — deployment tracking
│       │   ├── alert/              AlertConfig — webhook/email alert channels
│       │   ├── infrastructure/     Container health, gateway routes
│       │   └── stats/              OutboundCallCounter
│       └── resources/
│           └── application.yaml    All configuration lives here
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── domains/contract-sentinel/
        │   ├── infrastructure/api/ sentinel.service.ts, types.ts
        │   └── presentation/
        │       ├── components/     drift-event-row, dependency-card-node, db-schema-explorer, …
        │       ├── hooks/          use-drift, use-graph, use-services, use-stats, …
        │       └── pages/          graph-page, drift-feed-page, overview-page, …
        └── routes/                 __root.tsx, TanStack Router file-based routes
```

---

## Quick Start

### Prerequisites

- **Java 21** (e.g. via [SDKMAN](https://sdkman.io/): `sdk install java 21-tem`)
- **Maven 3.9+** (or use the included `./mvnw` wrapper)
- **Node.js 20+** and npm
- **Docker** (for the local PostgreSQL instance)

### 1. Start PostgreSQL

```bash
cd backend
docker-compose up -d
```

This starts PostgreSQL 17 on `localhost:5432`, database `contract_sentinel`, user `postgres`, password `password`.

### 2. Configure your services

Edit `backend/src/main/resources/application.yaml`:

```yaml
sentinel:
  services:
    - name: "user-service"
      baseUrl: "http://localhost:8080"
      specPath: "/v3/api-docs"          # optional — this is the default
    - name: "order-service"
      baseUrl: "http://localhost:8081"
      specPath: "/v3/api-docs"
```

Services listed here are seeded into the database on startup. Duplicates are skipped — safe to restart without re-seeding.

### 3. Run the backend

```bash
cd backend
./mvnw spring-boot:run
# Backend: http://localhost:8090
# Swagger UI: http://localhost:8090/swagger-ui.html
```

On first startup, the scheduler fires after 15 seconds and polls all configured services. Check the logs to confirm snapshots are being fetched.

### 4. Run the frontend

```bash
cd frontend
npm install
npm run dev
# UI: http://localhost:5173
```

If your backend runs on a different host or port, create `frontend/.env.local`:

```
VITE_SENTINEL_API_URL=http://your-host:8090
```

---

## Full Configuration Reference

All backend configuration lives in `backend/src/main/resources/application.yaml`:

```yaml
spring:
  datasource:
    url: ${SENTINEL_DB_URL:jdbc:postgresql://localhost:5432/contract_sentinel}
    username: postgres
    password: password             # change in production
  jpa:
    hibernate:
      ddl-auto: update             # auto-migrates schema on startup (dev/staging only)

server:
  port: 8090

sentinel:
  # How often to poll all services
  poll:
    interval-ms: 300000            # 5 minutes (in ms)
    initial-delay-ms: 15000        # grace period before first poll

  # Services to register and monitor (seeded once on startup)
  services:
    - name: "my-service"
      baseUrl: "http://localhost:8080"
      specPath: "/v3/api-docs"     # path to OpenAPI JSON spec

  # Manual service dependencies (edges in the dependency graph)
  # Use this for connections that cannot be auto-detected via actuator/env
  manual-dependencies:
    - source: "service-a"
      target: "service-b"
      propertyName: "shared-database"
      endpointCallsJson: null
    - source: "service-a"
      target: "service-c"
      propertyName: "internal-rest"
      endpointCallsJson: '[{"method":"GET","path":"/api/users/{id}"}]'

  # Docker integration (optional —> for infrastructure view)
  docker:
    enabled: false                 # set true if Docker socket is accessible

  # API gateway integration (optional —> for infrastructure view)
  gateway:
    url: ""                        # e.g. http://nginx:80

  # Database schema introspection (for DB schema explorer tab)
  db:
    schema: public                 # PostgreSQL schema to inspect

  # AI-powered schema risk analysis (optional)
  llm:
    provider: ${SENTINEL_LLM_PROVIDER:ollama}   # ollama | claude
    ollama:
      base-url: ${OLLAMA_BASE_URL:http://localhost:11434}
      model: ${OLLAMA_MODEL:qwen2.5:14b}
    claude:
      model: ${SENTINEL_LLM_CLAUDE_MODEL:claude-sonnet-4-5}
      api-key: ${SENTINEL_LLM_CLAUDE_API_KEY:}  # never commit a real key
```

**Environment variables summary:**

| Variable | Default | Purpose |
|---|---|---|
| `SENTINEL_DB_URL` | `jdbc:postgresql://localhost:5432/contract_sentinel` | Override the database JDBC URL |
| `SENTINEL_LLM_PROVIDER` | `ollama` | AI provider: `ollama` or `claude` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `qwen2.5:14b` | Ollama model to use |
| `SENTINEL_LLM_CLAUDE_MODEL` | `claude-sonnet-4-5` | Claude model ID |
| `SENTINEL_LLM_CLAUDE_API_KEY` | _(empty)_ | Anthropic API key — set via env, never in yaml |

---

## API Endpoints

### Services

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/services` | List all registered services with health status |
| `GET` | `/api/services/{id}` | Single service detail |
| `POST` | `/api/services` | Register a new service |
| `DELETE` | `/api/services/{id}` | Remove a service |
| `GET` | `/api/services/{id}/snapshots` | Snapshot history for a service |

### Drift Events

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/drift` | All drift events (filter: `serviceId`, `severity`, `acknowledged`) |
| `GET` | `/api/drift/{id}` | Single drift event |
| `POST` | `/api/drift/{id}/acknowledge` | Mark a drift event as reviewed |
| `POST` | `/api/drift/{id}/unacknowledge` | Unmark a previously reviewed event |
| `GET` | `/api/drift/{id}/diff` | Full OpenAPI diff for a drift event |

### Polling

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/poll/now` | Trigger immediate poll for all services |
| `POST` | `/api/poll/{serviceId}` | Trigger immediate poll for one service |

### Dependency Graph

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/graph` | Full service dependency graph (nodes + edges) |
| `GET` | `/api/graph/blast-radius/{serviceId}` | Services that would break if this service changes |
| `POST` | `/api/graph/dependency` | Add a manual dependency edge |
| `DELETE` | `/api/graph/dependency/{id}` | Remove a dependency edge |
| `GET` | `/api/graph/db-schema/{edgeId}` | DB schema tables for a shared-DB edge |

### Catalogue, Latency, Usage

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/catalogue` | All endpoints across all services |
| `GET` | `/api/latency` | Latency metrics (filter: `serviceId`, `path`) |
| `GET` | `/api/sampler` | Response samples (filter: `serviceId`, `path`) |
| `GET` | `/api/usage/dead-endpoints` | Endpoints with zero observed traffic |

### Alerts

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/alerts/channels` | List alert channels |
| `POST` | `/api/alerts/channels` | Create an alert channel (webhook/email) |
| `DELETE` | `/api/alerts/channels/{id}` | Remove an alert channel |

Full interactive docs: `http://localhost:8090/swagger-ui.html`

---

## Adding ContractSentinel to an Existing Project

ContractSentinel works as a **passive observer** — your services don't need to know about it. Requirements:

1. Your services expose an OpenAPI spec endpoint (Spring Boot's `springdoc-openapi` does this automatically at `/v3/api-docs`)
2. ContractSentinel can reach that endpoint over the network
3. Add an entry to `sentinel.services` in `application.yaml` for each service

For the dependency graph to show REST call edges automatically, your services should expose Spring Boot Actuator's `/actuator/env` endpoint — ContractSentinel scans it for URLs referencing other known services.

For manual dependencies (shared databases, webhooks, external APIs), add entries to `sentinel.manual-dependencies` in `application.yaml`.

---

## Dependency Graph

The **Graph** tab shows a layered ELK.js graph of your service dependencies:

- **Service nodes** — each registered service with its health status and drift count
- **Dependency relay nodes** — each edge between services becomes an intermediate node showing:
  - **Shared DB** — lists the shared tables with column counts
  - **Internal REST** — lists the specific endpoints being called (method + path)
  - **Webhook** — shows the webhook relationship
  - **External API** — shows the platform API dependency

Click any relay node to open a sidebar with full details. Click any service node to see its endpoints, drift count, and blast radius.

---

## Database Schema Explorer

The **Graph → Database Schema** tab gives you a focused exploration view:

1. **Left panel** — scrollable list of all tables, grouped by service, with search and filter (All / per-service / Cross-FK only)
2. **Right panel** — click any table to see it + its 1-hop FK neighbors via an ELK-powered mini graph
3. **Expand** — click `+` on any neighbor node to pin it and expand its own neighbors
4. **Cross-service FKs** — FK relationships that cross service boundaries are highlighted in amber

---

## Production Notes

- Set `spring.jpa.hibernate.ddl-auto: validate` in production (not `update`)
- Use a connection pool (`spring.datasource.hikari.*`) sized for your load
- The poller runs on a single thread per service — for 50+ services consider increasing `poll.interval-ms`
- All outbound HTTP calls (spec fetching, actuator polling, response sampling) go through a tracked `RestTemplate` — the UI shows the total call count in the nav bar

---

## License

There are to (at least) ways we can go:

* I don't care about licensing: I want people to use this, and I don't care how.

* I don't care about licensing: I don't care how people use this, I don't even care if you don't use it at all.
