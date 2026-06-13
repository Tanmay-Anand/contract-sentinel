# ContractSentinel

The problem you have right now: Suppose you have three services running. A field gets renamed in service 1, service 2 breaks, nobody finds out until a feature demo. You have no tester. You have Swagger docs but no enforcement.

A **Living API Contract Validator** that monitors OpenAPI specs from your microservices, diffs consecutive snapshots, and classifies every change as breaking or safe, displayed on a real-time React dashboard.

---

## What It Does

ContractSentinel polls each of your registered services' `/v3/api-docs` (or any OpenAPI endpoint) on a configurable schedule. When a spec changes it:

1. **Detects** what changed — path added/removed, response field added/removed, field type changed, required request field added
2. **Classifies** it — `BREAKING` (existing clients will break) or `SAFE` (additive / backward-compatible)
3. **Stores** a permanent snapshot and drift-event history in PostgreSQL
4. **Surfaces** unacknowledged breaking changes on the dashboard so nothing slips through

---

## Architecture

```
┌──────────────────────────────────────────┐
│  Your Microservices                      │
│  service-a:8080/v3/api-docs              │
│  service-b:8081/v3/api-docs  ──────────► │  ContractSentinel Backend (Spring Boot)
│  service-c:8082/v3/api-docs              │  • Polls & snapshots every 5 min
└──────────────────────────────────────────┘  • SHA-256 dedup
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
| Charts | Recharts v3 |

---

## Project Structure

```
contract-sentinel/
├── backend/          Spring Boot application
│   ├── pom.xml
│   ├── docker-compose.yml   PostgreSQL for local dev
│   └── src/
│       └── main/
│           ├── java/io/contractsentinel/
│           │   ├── config/      SentinelProperties, WebMvcConfig
│           │   ├── drift/       DriftEvent, DriftDetectionService, controller, repo
│           │   ├── registry/    ServiceRegistry, controller, service, repo
│           │   ├── seed/        DataSeeder (reads services from application.yaml)
│           │   └── snapshot/    SpecSnapshot, SpecFetcherScheduler, controller, repo
│           └── resources/
│               └── application.yaml
└── frontend/         React application
    ├── src/
    │   ├── api/      client.ts, types.ts
    │   ├── components/
    │   ├── pages/
    │   └── routes/
    └── package.json
```

---

## Quick Start

### 1. Start PostgreSQL

```bash
cd backend
docker-compose up -d
```

This starts PostgreSQL 17 on `localhost:5432`, database `contract_sentinel`.

### 2. Configure your services

Edit `backend/src/main/resources/application.yaml`:

```yaml
sentinel:
  services:
    - name: "user-service"
      baseUrl: "http://localhost:8080"
      specPath: "/v3/api-docs"
    - name: "order-service"
      baseUrl: "http://localhost:8081"
      specPath: "/v3/api-docs"
```

Services listed here are seeded into the database on startup (only once — duplicates are skipped).

### 3. Run the backend

Requires **Java 21** and **Maven 3.9+** (or run `mvn wrapper:wrapper` once to generate `./mvnw`).

```bash
cd backend
mvn spring-boot:run
# Backend available at http://localhost:8090
# Swagger UI at http://localhost:8090/swagger-ui.html
```

### 4. Run the frontend

Requires **Node.js 20+**.

```bash
cd frontend
npm install
npm run dev
# UI available at http://localhost:5173
```

Set `VITE_SENTINEL_API_URL` in `frontend/.env.local` if your backend runs on a different host/port (defaults to `http://localhost:8090`).

---

## Configuration Reference

All backend configuration lives in `application.yaml`:

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/contract_sentinel
    username: postgres
    password: your_password     # change in production

server:
  port: 8090                    # backend port

sentinel:
  poll:
    interval-ms: 300000         # how often to poll all services (ms)
    initial-delay-ms: 15000     # delay before first poll after startup (ms)
  services:                     # services to register on startup
    - name: "my-service"
      baseUrl: "http://localhost:8080"
      specPath: "/v3/api-docs"  # optional, this is the default
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/services` | List all services with health status |
| `GET` | `/api/services/{id}` | Single service detail |
| `GET` | `/api/services/{id}/snapshots` | Snapshot history for a service |
| `GET` | `/api/drift` | All drift events (filter: `serviceId`, `severity`) |
| `POST` | `/api/drift/{id}/acknowledge` | Mark a drift event as reviewed |
| `POST` | `/api/poll/now` | Trigger immediate poll for all services |
| `POST` | `/api/poll/{serviceId}` | Trigger immediate poll for one service |

Full interactive docs: `http://localhost:8090/swagger-ui.html`

---

## How Drift Detection Works

```
Poll /v3/api-docs
      │
      ▼
SHA-256 hash ──► same as last FETCHED snapshot? ──► skip
      │
      │ different
      ▼
Save new snapshot
      │
      ▼
Parse prev + curr with swagger-parser
      │
      ▼
Diff: paths, response schemas, request schemas
      │
      ▼
Save DriftEvent records (BREAKING / SAFE)
      │
      ▼
Dashboard shows unacknowledged breaking count per service
```

Unreachable services (connection refused, timeout) are stored as `UNREACHABLE` snapshots and never used as a diff baseline — preventing false positives.

---

## Adding ContractSentinel to an Existing Project

If you want to embed ContractSentinel monitoring into your own project rather than run it standalone:

1. **Register services** via the seeder config or directly via `ServiceRegistryRepository`
2. **Point** `baseUrl` at each service's host — ContractSentinel only needs read access to `/v3/api-docs`
3. Services do **not** need to know about ContractSentinel at all
