# Contract Sentinel — Architecture Design

**Status:** Living document · **Owner:** Tanmay Anand
**Scope:** End-to-end architecture of Contract Sentinel — a self-hosted API observability platform that watches microservices by polling their OpenAPI specs, collecting distributed traces, scraping Prometheus metrics, scanning service dependencies, and running an LLM agent to diagnose and explain what it finds.

---

## 1. Design principles

These are the non-negotiables the rest of the design serves.

1. **Pull, never push (for contracts).** CS fetches OpenAPI specs on a schedule rather than requiring services to register or emit events. A service needs zero CS-specific code — it only needs to expose `/v3/api-docs`.
2. **Oldest snapshot as the immutable baseline.** Drift is always compared against the *first-ever* known spec for a service, not the previous one. This means no breaking change is silently forgotten across restarts or re-polls.
3. **Deduplication at every boundary.** Hash-based dedup for snapshots, `(service, changeType, method, path)` dedup for drift events, `spanId`-based dedup for traces. The scheduler can repeat the same work safely.
4. **Write-ahead cache for hot reads.** Spans are written to both the in-memory hot cache and the database simultaneously. Recent queries hit the cache; the DB is the durable fallback. This keeps the UI reactive without hammering the database.
5. **Filter noise at the source.** CS's own polling calls (actuator, api-docs) are stripped from the trace store before `saveAll()` — they never touch the DB. A display-layer filter that runs after a DB read would still accumulate rows.
6. **LLM as analyst, not executor.** The agent loop calls LLM-backed tools against CS's own APIs and services. It never executes raw SQL or arbitrary code — every tool is a bounded call into an existing service method.
7. **Broadcast failures are swallowed.** WebSocket pushes are best-effort. A failed broadcast never propagates up to a DB write path and rolls back a transaction.

---

## 2. High-level architecture

Contract Sentinel is a single Spring Boot 4.0 application. All subsystems run in-process; PostgreSQL is the only external dependency at runtime.

```
┌────────────────────────────────────────────────────────────────────┐
│                    Contract Sentinel  (port 8090)                  │
│                                                                    │
│  ┌─────────────┐   ┌──────────────────────────────────────────┐   │
│  │   Scheduler  │   │             REST API (Tomcat)            │   │
│  │ (every 5 min)│   │  /api/registry  /api/v2/spans  /api/... │   │
│  └──────┬───────┘   └──────────────────┬───────────────────────┘  │
│         │                              │                           │
│         ▼                              ▼                           │
│  SpecFetcherScheduler          Controllers (thin)                  │
│         │                              │                           │
│    ┌────┴────────────────────┐         │                           │
│    │                         │         │                           │
│    ▼                         ▼         ▼                           │
│  SnapshotService      TraceService  ServiceImpl (business logic)   │
│  DriftDetection       HotCache                                     │
│  PerformanceSvc       SpanRepository                               │
│  DependencyGraph                                                   │
│  AlertService                                                      │
│  LatencyService                                                     │
│         │                              │                           │
│         └──────────────┬───────────────┘                           │
│                        │                                           │
│                        ▼                                           │
│               WebSocketEventPublisher ──► connected frontends      │
│                                                                    │
└───────────────────────────┬────────────────────────────────────────┘
                            │
                    PostgreSQL (port 5402)
                    contract_sentinel DB
```

### Planes at a glance

| Plane | What lives here | Key classes |
|---|---|---|
| **Registry** | Master list of monitored services | `ServiceRegistry`, `ServiceRegistryServiceImpl` |
| **Poll loop** | Scheduled fetch + dispatch | `SpecFetcherScheduler` |
| **Snapshot** | Raw spec history + health | `SpecSnapshot`, `SpecSnapshotServiceImpl` |
| **Drift** | OpenAPI contract diff + events | `DriftDetectionServiceImpl`, `DriftEvent` |
| **Trace** | Zipkin-compatible ingestion + query | `TraceServiceImpl`, `TraceHotCache`, `TraceSpan` |
| **Performance** | Prometheus scrape → p50/p95/p99 | `EndpointPerformanceServiceImpl`, `HttpServerMetricsParser` |
| **Graph** | Service dependency discovery | `DependencyGraphServiceImpl`, `ServiceDependency` |
| **Alert** | Rule evaluation + channel dispatch | `AlertService`, `AlertConfig`, `AlertEvent` |
| **Agent** | Autonomous LLM diagnostic loop | `AgentLoop`, `AgentTool`, `DiagnosisAgent`, `SchemaRiskAgent` |
| **WebSocket** | Real-time push to frontend | `SentinelWebSocketHandler`, `WebSocketEventPublisher` |
| **Config** | Cross-cutting infrastructure | `GzipBodyDecompressingFilter`, `RequestContext`, `HttpExceptionHandler` |

---

## 3. The poll cycle — the heartbeat of everything

`SpecFetcherScheduler.pollAll()` is the single driver of the entire observation loop. It fires every 5 minutes (configurable via `sentinel.poll.interval-ms`) with a `fixedDelay` — meaning the next cycle starts 5 minutes *after the last one finishes*, so polls never overlap regardless of how long they take.

```
pollAll()
│
├── for each active ServiceRegistry:
│       pollService(service)
│           │
│           ├── GET {baseUrl}{specPath}   (10 s connect / 30 s read timeout)
│           │
│           ├── [success]
│           │     ├── callCounter.incSpecPolls()
│           │     ├── latencyService.recordSpecFetch(service, durationMs)
│           │     ├── SHA-256 hash the spec JSON
│           │     ├── compare hash to latest FETCHED snapshot
│           │     │       └── hash unchanged → return early (skip diff)
│           │     ├── snapshotRepository.save(new FETCHED snapshot)
│           │     ├── driftDetectionService.detectAndPersist(oldest, new)
│           │     ├── pollActuatorInfo(service)
│           │     │       └── GET /actuator/info → deploymentService.detectAndRecord()
│           │     ├── dependencyGraphService.scanDependencies(service)
│           │     │       └── GET /actuator/env → upsert ServiceDependency edges
│           │     ├── outboundCallScannerService.scanAndEnrich(service)
│           │     ├── endpointPerformanceService.collectForService(service)
│           │     │       └── GET /actuator/prometheus → parse + store p50/p95/p99
│           │     └── publish "health.changed" WS event (if recovered from UNREACHABLE)
│           │
│           └── [failure / empty body]
│                 ├── snapshotRepository.save(new UNREACHABLE snapshot)
│                 ├── alertService.evaluateUnreachable(...)
│                 └── publish "health.changed" WS event (if was FETCHED)
│
├── endpointPerformanceService.purgeOlderThan(performanceRetentionDays)
└── traceService.purgeOlderThan(traceRetentionHours)
```

**Why `fixedDelay` over `fixedRate`:** `fixedRate` fires on a wall-clock interval regardless of the previous run's duration. If polling 10 services takes 6 minutes, you'd get overlapping polls. `fixedDelay` is the safe choice for I/O-heavy schedulers.

---

## 4. Service Registry

The registry is the master list of everything CS monitors. Every other subsystem — snapshots, drift, traces, performance — is keyed to a `ServiceRegistry` row.

**Entity:** `cs_service_registry`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | Generated |
| `name` | VARCHAR(100) UNIQUE | Human label |
| `baseUrl` | VARCHAR(200) | e.g. `http://localhost:8080` |
| `specPath` | VARCHAR(100) | Default `/v3/api-docs`, appended to baseUrl on every poll |
| `active` | BOOLEAN | Soft-delete flag; all queries use `findAllByActiveTrue()` |
| `createdAt` | TIMESTAMP | Immutable |

**Key design decision — `active` over hard delete:** Deregistering a service preserves all its historical snapshots, drift events, and traces. You can re-enable it and its history is intact.

**What `ServiceRegistryServiceImpl.findAll()` returns:** Each DTO is enriched with two derived fields at query time — `status` (derived from the most-recent snapshot's `FetchStatus`) and `breakingChangeCount` (unacknowledged BREAKING drift events). These are computed per-service with small targeted queries rather than a single complex join.

---

## 5. Spec Snapshots

Every spec fetch result (success or failure) is persisted as a `SpecSnapshot`. Snapshots are the raw historical record and the source of truth for both health status and drift comparisons.

**Entity:** `cs_spec_snapshots`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `service_id` | UUID (FK → registry) | |
| `specJson` | TEXT | Full OpenAPI JSON; null when UNREACHABLE |
| `specHash` | VARCHAR(64) | SHA-256 hex of specJson |
| `fetchedAt` | TIMESTAMP | |
| `fetchStatus` | ENUM | `FETCHED`, `UNREACHABLE`, `PARSE_FAILED` |
| `fetchDurationMs` | BIGINT | Round-trip latency to the service |

**Two critical repository queries:**

```
findTopByServiceAndFetchStatusOrderByFetchedAtDesc  → latest FETCHED (hash comparison)
findTopByServiceAndFetchStatusOrderByFetchedAtAsc   → oldest FETCHED (drift baseline)
```

**Why oldest-as-baseline:** If you compare consecutive snapshots, a field removed in snapshot 3 and re-added in snapshot 4 looks like no change by snapshot 4. Comparing against the oldest means that removal is permanently on record regardless of what happened later.

**Manual re-detection:** `POST /api/snapshots/{serviceId}/redetect` triggers a fresh drift comparison between the oldest and newest snapshots without re-polling the service. Useful when a new change-type detector is added and you want to scan historical data.

---

## 6. Contract Drift Detection

After saving a new snapshot, the scheduler immediately calls `DriftDetectionServiceImpl.detectAndPersist(oldest, new)`. This is the core value proposition of Contract Sentinel — knowing *what* changed in an API contract, classified by severity.

### 6.1 Detection pipeline

```
prev.specJson + curr.specJson
         │
         ▼
  OpenAPIV3Parser.readContents()       ← resolves all $ref pointers
  (swagger-parser library)
         │
         ▼
  extractOperations()                  → Map<"METHOD:path", Operation>
         │
    ┌────┴──────────────────────────┐
    │                               │
    ▼                               ▼
  PATH_REMOVED (BREAKING)       PATH_ADDED (SAFE)
  for every op in prev           for every op in curr
  missing from curr              missing from prev
         │
         ▼
  diffSchemas() for each surviving operation:
    ├── response field removed      → RESPONSE_FIELD_REMOVED (BREAKING)
    ├── response field added        → RESPONSE_FIELD_ADDED (SAFE)
    ├── response field type changed → RESPONSE_FIELD_TYPE_CHANGED (BREAKING)
    └── new required request field  → REQUEST_REQUIRED_FIELD_ADDED (BREAKING)
         │
         ▼
  Dedup filter:
  existsByServiceAndChangeTypeAndHttpMethodAndApiPath()
  → only persist events not already in DB
         │
         ▼
  driftEventRepository.saveAll(newEvents)
  alertService.evaluateBreaking(...)   ← for each BREAKING event
  eventPublisher.publish("drift.detected", ...)
```

**Entity:** `cs_drift_events`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `service_id` | UUID (FK) | |
| `from_snapshot_id` | UUID (FK) | The baseline |
| `to_snapshot_id` | UUID (FK) | The new snapshot |
| `detectedAt` | TIMESTAMP | |
| `changeType` | ENUM | `PATH_REMOVED`, `RESPONSE_FIELD_REMOVED`, etc. |
| `severity` | ENUM | `BREAKING` or `SAFE` |
| `httpMethod` | VARCHAR(10) | `GET`, `POST`, … |
| `apiPath` | VARCHAR(300) | e.g. `/api/bookings/{id}` |
| `detail` | TEXT | JSON blob with field name, old/new types |
| `acknowledged` | BOOLEAN | Operator-dismissable in the UI |

**Why swagger-parser over raw JSON diff:** OpenAPI specs use `$ref` pointers extensively (`$ref: '#/components/schemas/BookingResponse'`). A JSON diff would see two identical `$ref` strings and conclude nothing changed, even if the referenced schema is completely different. `OpenAPIV3Parser` resolves all refs before comparison, so the diff operates on fully-expanded schemas.

---

## 7. Trace Ingestion Pipeline

CS accepts Zipkin v2 JSON spans at `POST /api/v2/spans` — the same URL format that Spring Boot's Brave/Micrometer tracing auto-configures. Registered services point `management.tracing.export.zipkin.endpoint` at CS and their traces flow in automatically.

### 7.1 Gzip decompression filter

Spring Boot 4.0's `ZipkinHttpClientSender` gzip-compresses span batches above 1 KB and sets `Content-Encoding: gzip`. Tomcat does not automatically decompress gzip request bodies — it only decompresses gzip *response* bodies. Without intervention, Jackson receives raw gzip bytes and throws a 400.

`GzipBodyDecompressingFilter` runs at `@Order(HIGHEST_PRECEDENCE)` — before any Spring MVC processing. It intercepts requests with `Content-Encoding: gzip`, decompresses the body with `GZIPInputStream`, and wraps the request in a `GzipBodyRequestWrapper` that overrides `getInputStream()`, `getHeader()`, and `getContentLength()`. Downstream code sees plain JSON.

### 7.2 Ingest flow (`TraceServiceImpl.ingest`)

```
List<ZipkinSpanDto> spans (already decompressed JSON)
         │
         ▼
[Pass 1 — noise filter]
For each span in batch:
  extract httpPath from tags ("http.path", "http.route", "uri")
  if path starts with any noise prefix (e.g. /actuator, /v3/api-docs):
      add span's traceId to noiseSet
         │
         ▼
[Pass 2 — entity build]
For each span in batch:
  skip if traceId ∈ noiseSet             ← entire noise trace dropped
  skip if hotCache.isDuplicate(spanId)   ← Brave retry dedup
  skip if traceId == null || spanId == null
  build TraceSpan entity from ZipkinSpanDto fields
         │
         ▼
  spanRepository.saveAll(entities)
  entities.forEach(hotCache::put)
  counter.incIngestSpans(entities.size())
  eventPublisher.publish("trace.received", { count, traceIds })
```

**Two-pass design:** A single pass can't safely classify noise because the span with the HTTP path tag may not be the first in the batch. The root span and child spans (security filter, auth) of a noise trace may arrive in the same batch — pass 1 identifies all of them, pass 2 drops all of them together.

### 7.3 `listTraces()` read strategy

```
sinceMinutes ≤ hotCacheWindowMinutes (15)       → cache only
sinceMinutes ≤ hotCacheWindowMinutes + 5 (20)   → merge cache + DB (dedup by spanId)
sinceMinutes > 20                               → DB only
```

Results are grouped by `traceId`, the root span is found (no parent, or parent not in this trace's span set), and traces whose root has no `httpMethod` or `httpPath` are skipped — this removes background scheduler spans that slipped through the noise filter (same job, different batch).

### 7.4 ZipkinSpanDto → TraceSpan mapping

| Zipkin field | TraceSpan column | Notes |
|---|---|---|
| `traceId` | `traceId` | 16 or 32 hex chars |
| `id` | `spanId` | 16 hex chars |
| `parentId` | `parentSpanId` | null for root spans |
| `localEndpoint.serviceName` | `serviceName` | Defaults to "unknown" |
| `name` | `spanName` | e.g. "GET /api/bookings" |
| `kind` | `kind` | CLIENT, SERVER, PRODUCER, CONSUMER |
| `timestamp` | `startEpochMicros` | Microseconds since epoch |
| `duration` | `durationMicros` | |
| `tags["http.method"]` | `httpMethod` | Falls back to `tags["method"]` |
| `tags["http.path"]` | `httpPath` | Falls back to `http.route`, `uri` |
| `tags["http.status_code"]` | `httpStatus` | Parsed as Integer |
| `tags` (all) | `tagsJson` | Full tags as JSON blob |

---

## 8. Hot Cache (Write-ahead Layer)

`TraceHotCache` is an in-memory cache for recently ingested spans. It enables near-instant reads for the common case (Traces page refresh triggered by a `trace.received` WebSocket event) without touching the database.

### 8.1 Internal structure

```java
ConcurrentHashMap<String traceId, ConcurrentLinkedQueue<TraceSpan>> spansByTrace
AtomicInteger totalSpans                     // cap guard (default 10,000)
LinkedHashSet<String> recentSpanIds          // LRU dedup set (max 1,000 entries)
Object dedupLock                             // guards recentSpanIds
```

`ConcurrentHashMap` + `ConcurrentLinkedQueue` allow concurrent `put()` and `getSpansAfter()` from multiple HTTP threads without explicit locking. `LinkedHashSet` preserves insertion order so the oldest entry is always at `iterator().next()` — O(1) eviction.

### 8.2 Eviction

Two independent triggers:
- **Capacity:** if `totalSpans ≥ maxSpans`, evict the trace group whose head span has the oldest `receivedAt` before each `put()`.
- **Time:** the retention scheduler calls `evictBefore(cutoff)` on every poll cycle, removing all spans older than `traceRetentionHours`.

### 8.3 Overlap-zone merge

When `sinceMinutes` falls in the overlap zone (between `hotCacheWindowMinutes` and `hotCacheWindowMinutes + OVERLAP_MINUTES`), some spans are in cache and some are only in DB. The merge:

```
Set<spanId> cacheIds = fromCache.stream().map(getSpanId).collect(toSet())
fromDb.stream()
      .filter(s -> !cacheIds.contains(s.getSpanId()))  // DB-only spans
      .forEach(merged::add)
```

This prevents double-counting spans that happen to be in both (possible if spans were written to DB and also still in cache).

---

## 9. Performance & Metrics

Every poll cycle, CS scrapes `/actuator/prometheus` from each registered service and extracts per-endpoint latency percentiles from the Micrometer HTTP server duration histograms.

### 9.1 Pipeline

```
GET /actuator/prometheus  (raw Prometheus text format)
         │
         ▼
HttpServerMetricsParser.parse()
  reads: http_server_requests_seconds_bucket{method=..., uri=..., le=...}
  reads: http_server_requests_seconds_count{method=..., uri=..., status=...}
  computes: p50, p95, p99 from cumulative buckets
  returns: List<ParsedEndpointMetric>
         │
         ▼
For each ParsedEndpointMetric:
  previousTotal = last snapshot's totalCount (0 if first)
  countDelta = max(0, currentCount - previousTotal)
  save EndpointPerformanceSnapshot(p50, p95, p99, totalCount, countDelta, errorCount)
         │
         ▼
eventPublisher.publish("metric.updated", { serviceName })
```

**Entity:** `cs_endpoint_performance_snapshots`

| Column | Type | Notes |
|---|---|---|
| `service_id` | UUID (FK) | |
| `httpMethod` | VARCHAR(10) | |
| `path` | VARCHAR(400) | Templated URI (e.g. `/api/bookings/{id}`) |
| `p50Ms` | DOUBLE | 50th percentile latency |
| `p95Ms` | DOUBLE | 95th percentile latency |
| `p99Ms` | DOUBLE | 99th percentile latency |
| `totalCount` | BIGINT | Cumulative counter from Prometheus |
| `countDelta` | BIGINT | Requests since previous snapshot |
| `errorCount` | BIGINT | HTTP 5xx count |
| `recordedAt` | TIMESTAMP | |

### 9.2 Volatility calculation

`VolatilityCalculator.compute(List<Double> p95Series)` computes the **coefficient of variation** (CV = stddev / mean) over the last 7 days of p95 samples for each endpoint. The CV is dimensionless — it makes volatility comparable across endpoints with very different baseline latencies.

CV thresholds → rating: `stable` (<0.15), `variable` (0.15–0.40), `erratic` (>0.40).

### 9.3 The "vs p50" badge in Traces

`listTraces()` returns traces. The frontend builds a `p50Map` keyed by `"serviceName:METHOD:path"` from the performance registry. For each trace row it looks up p50 and classifies:

```
durationMs < p50Ms         → "Fast"   (green)
durationMs < p50Ms × 2.5  → "Normal" (amber)
otherwise                  → "Slow"   (red)
```

---

## 10. Dependency Graph

CS automatically discovers which services call which other services by inspecting their Spring environment properties, then models the result as a directed graph.

### 10.1 Discovery (`scanDependencies`)

```
GET {baseUrl}/actuator/env
         │
         ▼
Parse propertySources → flatten to Map<key, value>
         │
         ▼
For each other active registered service (target):
  extract port from target.baseUrl
  look for any property value containing "localhost:{port}" or "127.0.0.1:{port}"
  if found:
      upsertEdge(source, target, propertyName, ACTUATOR_ENV, HIGH confidence, now)
```

**Upsert logic:** If an edge already exists, only `verifiedAt` and `propertyName` are updated — no duplicate edges. If the env scan *fails*, `scanFailedAt` is stamped on all existing edges from that service (shown as "stale" in the UI).

### 10.2 Blast radius (BFS)

```
getBlastRadius(serviceId):
  direct  = Set of services that have an edge pointing TO epicenter
  visited = {epicenter}
  queue   = direct

  while queue not empty:
      current = queue.poll()
      for each service with edge → current (not yet visited):
          transitive.add(service)
          queue.add(service)

  return { direct, transitive, total = |direct| + |transitive| }
```

**Entity:** `cs_service_dependencies`

| Column | Type | Notes |
|---|---|---|
| `source_service_id` | UUID (FK) | The caller |
| `target_service_id` | UUID (FK) | The callee |
| `detectionMethod` | ENUM | `ACTUATOR_ENV`, `MANUAL` |
| `confidence` | ENUM | `HIGH`, `MEDIUM`, `LOW` |
| `propertyName` | VARCHAR | The Spring property that revealed the edge |
| `verifiedAt` | TIMESTAMP | Updated on each confirmed scan |
| `scanFailedAt` | TIMESTAMP | Set when env scan fails |
| `stale` | BOOLEAN (derived) | `scanFailedAt != null` |

---

## 11. Alert System

Alerts are evaluated lazily — by the subsystem that detects the triggering condition — rather than running a separate polling loop. Two trigger paths exist:

- **Drift detection** calls `alertService.evaluateBreaking(serviceId, name, changeType, path)` after persisting each BREAKING event.
- **Poll engine** calls `alertService.evaluateUnreachable(serviceId, name)` after saving an UNREACHABLE snapshot.

Each evaluation queries `AlertConfig` for enabled rules matching the condition and (optionally) the specific service, then:
1. Applies the `cooldownMinutes` window — skip if the same rule already fired within the cooldown period.
2. Creates an `AlertEvent` record (permanent audit trail).
3. Dispatches to the configured channel (`WEBHOOK`, `SLACK`, `EMAIL`).

**`AlertConfig` fields:**

| Field | Type | Notes |
|---|---|---|
| `name` | VARCHAR | Human label for the rule |
| `channel` | ENUM | `WEBHOOK`, `SLACK`, `EMAIL` |
| `destination` | VARCHAR(500) | URL or email address |
| `triggerOnBreaking` | BOOLEAN | Fire on BREAKING drift events |
| `triggerOnUnreachable` | BOOLEAN | Fire when service goes down |
| `triggerOnSafe` | BOOLEAN | Fire on SAFE (informational) changes |
| `serviceFilter` | UUID (nullable) | Scope to one service; null = all |
| `cooldownMinutes` | INT | Default 30 — prevents alert storms |
| `enabled` | BOOLEAN | Toggle without deleting |

---

## 12. LLM Agent

The agent subsystem provides two capabilities: **diagnosis** ("why is this service slow / erroring?") and **schema risk assessment** ("is this DB migration safe?"). Both use the same underlying autonomous tool-calling loop.

### 12.1 The `AgentLoop`

```
AgentLoop.run(runId, systemPrompt, userPrompt, tools)  [@Async("agentExecutor")]
│
├── Build message list: [system, user]
├── Build LlmToolSpec list from tools
│
└── Iteration loop (max: sentinel.llm.max-iterations, default 10)
    ├── If wall-clock > 5 min deadline → store.fail(runId, "time budget exceeded")
    ├── llmClient.chat(messages, specs)  → LlmResponse
    ├── store.incrementIteration(runId)
    │
    ├── [no tool calls] → store.complete(runId, response.content())  ← done
    │
    └── [tool calls]
        ├── If response has a "thought" text → store.appendStep("thought")
        ├── messages.add(LlmMessage.assistant(content, toolCalls))
        └── for each toolCall:
                store.appendStep("tool_call", name, args)
                result = tool.execute(args)          ← bounded tool
                result = truncate(result, 4000 chars)
                store.appendStep("tool_result", name, result)
                messages.add(LlmMessage.toolResult(callId, result))
```

**Async + dedicated thread pool:** A run can take minutes. `@Async("agentExecutor")` routes it to a bounded dedicated thread pool so it never blocks HTTP request threads. The HTTP endpoint returns the `runId` immediately; the frontend polls `GET /api/agent/runs/{id}` for live progress.

**Every step is persisted immediately** (`AgentRun` + `AgentRunStep` entities) — not buffered until completion. This makes live streaming possible and means a server restart during a run shows all steps completed before the restart.

### 12.2 Available tools

| Tool | Wraps | Description |
|---|---|---|
| `CatalogueSearchTool` | `ApiCatalogueService` | Search endpoints by path/method |
| `LatencyTrendTool` | `EndpointPerformanceService` | Last N days of p50/p95/p99 for an endpoint |
| `UsageTrendTool` | `UsageAnalyticsService` | Request volume trend, dead endpoints |
| `DeploymentHistoryTool` | `DeploymentService` | Recent deployments for a service |
| `RowCountTool` | `DbQueryService` | Approximate row count for a table |
| `ExplainQueryTool` | `DbQueryService` | EXPLAIN ANALYZE output for a query |
| `FkLookupTool` | `SharedDbSchemaService` | FK relationships for a table |
| `FrontendGrepTool` | File system grep | Search frontend source for column references |
| `ConnectionPoolTool` | Actuator metrics | Current DB connection pool stats |

### 12.3 LLM provider abstraction

`LlmClient` is an interface. Two implementations are provided:

| Provider | Class | Config |
|---|---|---|
| **Ollama** (local, free) | `OllamaClient` | `sentinel.llm.provider: ollama`, `sentinel.llm.ollama.model: qwen2.5:14b` |
| **Claude** (Anthropic API) | `ClaudeClient` | `sentinel.llm.provider: claude`, `sentinel.llm.claude.api-key: ${...}` |

The active implementation is selected by `LlmConfig` based on the `provider` property. All agent code depends only on `LlmClient` — no provider-specific imports escape the `llm` package.

### 12.4 Tool result truncation

Each tool result is truncated to 4,000 characters before being added to the message list. LLMs have context limits; a tool that returns thousands of database rows would exhaust it and cause the run to fail or hallucinate. Truncation is conservative but safe — 4,000 characters is enough context for the model to reason from.

---

## 13. WebSocket Push Layer

CS maintains persistent WebSocket connections to all open frontend tabs and pushes structured events whenever observable state changes. The frontend reacts by invalidating specific React Query caches.

### 13.1 Session management

`SentinelWebSocketHandler` extends `TextWebSocketHandler`:

```java
CopyOnWriteArraySet<WebSocketSession> sessions
```

`CopyOnWriteArraySet` is used because iteration (broadcast) happens far more often than mutation (connect/disconnect). Iteration reads a stable snapshot — thread-safe without a lock. Writes (connect/disconnect) copy the whole array — O(n) but rare.

Each send is `synchronized(session)` — WebSocket sessions are not thread-safe for concurrent writes; the lock prevents garbled frames if two broadcasts fire simultaneously to the same session.

### 13.2 Event types

| Event type | Fired by | Frontend reaction |
|---|---|---|
| `connected` | On WS handshake | None (ack) |
| `trace.received` | `TraceServiceImpl.ingest()` | Invalidate `["traces"]` query |
| `drift.detected` | `DriftDetectionServiceImpl` | Invalidate `["drift"]` query |
| `health.changed` | `SpecFetcherScheduler` | Invalidate `["services"]` query |
| `metric.updated` | `EndpointPerformanceServiceImpl` | Invalidate `["performance"]` query |

### 13.3 `WebSocketEventPublisher` — error isolation

```java
public void publish(String type, Object payload) {
    try {
        handler.broadcast(SentinelEvent.of(type, payload));
    } catch (Exception e) {
        log.warn("WebSocket broadcast suppressed for event '{}': {}", type, e.getMessage());
    }
}
```

Swallows all exceptions. A broadcast failure must never propagate up to a DB write path (e.g., `TraceServiceImpl.ingest()`) and cause a transaction rollback that loses data. The frontend will catch up on its next regular poll.

---

## 14. Cross-cutting infrastructure

### 14.1 Request correlation ID

`RequestIdFilter` (runs before all Spring MVC processing):
1. Reads `X-Request-ID` header from the incoming request (or generates a UUID if absent).
2. Stores it in `RequestContext.setRequestId()` — a `static ThreadLocal<String>`.
3. Adds it to the response via `X-Request-ID` header.
4. Clears it in a `finally` block to prevent ThreadLocal leaks across pooled threads.

All error responses include the request ID, making it straightforward to correlate a frontend error with a server log line.

### 14.2 Global exception handling

`HttpExceptionHandler` (`@RestControllerAdvice`) is the single location for all exception-to-HTTP-response translation. Controllers contain zero try/catch. Handled types:

| Exception | Status | Notes |
|---|---|---|
| `SentinelException` | Varies | Domain exceptions carry their own status |
| `MethodArgumentNotValidException` | 400 | Bean Validation failures; field errors joined |
| `HandlerMethodValidationException` | 400 | Constraint violations on method parameters |
| `HttpMessageNotReadableException` | 400 | Malformed request body (e.g. bad JSON) |
| `MissingServletRequestParameterException` | 400 | Missing required query param |
| `MethodArgumentTypeMismatchException` | 400 | e.g. string where UUID expected |
| `IllegalArgumentException` / `IllegalStateException` | 400 | |
| `NoSuchElementException` / `NoResourceFoundException` | 404 | |
| `HttpRequestMethodNotSupportedException` | 405 | |
| `Exception` (catch-all) | 500 | Logs with full stack trace |

### 14.3 Pagination response wrapping

`PaginationResponseAdvice` (`@RestControllerAdvice` implementing `ResponseBodyAdvice`) intercepts any controller return value that is a `Page<?>` and wraps it in `PaginatedResponse<T>` before serialisation. Controllers return `Page<T>`; clients always receive the wrapped form. No controller needs to wrap manually.

---

## 15. Database schema overview

All tables are prefixed `cs_` to avoid collisions if CS is deployed alongside other services in the same PostgreSQL instance. `ddl-auto: update` applies schema changes automatically in dev and staging.

| Table | Primary key | Key FKs |
|---|---|---|
| `cs_service_registry` | `id` (UUID) | — |
| `cs_spec_snapshots` | `id` (UUID) | `service_id` |
| `cs_drift_events` | `id` (UUID) | `service_id`, `from_snapshot_id`, `to_snapshot_id` |
| `cs_trace_spans` | `id` (UUID) | — (no FK, service name is a string) |
| `cs_endpoint_performance_snapshots` | `id` (UUID) | `service_id` |
| `cs_service_dependencies` | `id` (UUID) | `source_service_id`, `target_service_id` |
| `cs_alert_configs` | `id` (UUID) | — |
| `cs_alert_events` | `id` (UUID) | `config_id`, `service_id` |
| `cs_deployment_events` | `id` (UUID) | `service_id` |
| `cs_latency_metrics` | `id` (UUID) | `service_id` |
| `cs_endpoint_usage_samples` | `id` (UUID) | `service_id` |
| `cs_sampled_endpoints` | `id` (UUID) | `service_id` |
| `cs_sampling_results` | `id` (UUID) | `endpoint_id` |
| `cs_agent_runs` | `id` (UUID) | — |
| `cs_hot_methods` | `id` (UUID) | `service_id` |
| `cs_profiling_runs` | `id` (UUID) | `service_id` |

**Indexes of note:**
- `cs_trace_spans`: `idx_trace_spans_trace (traceId)`, `idx_trace_spans_received (receivedAt)` — the two most common query patterns.
- No compound indexes are defined; consider `(service_id, recordedAt)` on `cs_endpoint_performance_snapshots` as data grows.

---

## 16. Tech stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Language | Java | 21 | Virtual threads available |
| Framework | Spring Boot | 4.0.1 | Includes Spring MVC, Spring Data JPA, Spring WebSocket |
| Jackson | `tools.jackson` (Jackson 3) | 3.0.3 | Bundled with Spring Boot 4.0; package `tools.jackson.*` not `com.fasterxml.jackson.*` |
| ORM | Spring Data JPA + Hibernate 7 | Boot-managed | |
| Database | PostgreSQL | 17 | `cs_*` tables; `jdbc:postgresql://localhost:5432/contract_sentinel` in dev |
| OpenAPI parsing | `swagger-parser` | 2.1.25 | `OpenAPIV3Parser` resolves `$ref` before diff |
| WebSocket | Spring WebSocket | Boot-managed | Raw WebSocket (not STOMP) |
| HTTP client | Spring `RestClient` | Boot-managed | Used by scheduler for outbound polls |
| API docs (own) | `springdoc-openapi-starter-webmvc-ui` | 3.0.1 | Swagger UI at `/swagger-ui.html` |
| Build | Maven | 3.x | No `mvnw` in repo; use system `mvn` |
| Boilerplate reduction | Lombok | Latest | `@Builder`, `@Getter`, `@Setter`, `@RequiredArgsConstructor` |
| Validation | Jakarta Bean Validation | Boot-managed | `@Valid` + `@NotBlank` etc. on DTOs |
| LLM | Ollama (local) / Anthropic Claude | — | Pluggable via `sentinel.llm.provider` |

---

## 17. Configuration reference

All CS-specific properties live under `sentinel.*` in `application.yaml`.

```yaml
sentinel:
  poll:
    interval-ms: 300000          # How often to poll all services (fixedDelay)
    initial-delay-ms: 15000      # Grace period before first poll on startup

  traces:
    retention-hours: 24          # How long spans are kept in the DB
    hot-cache-window-minutes: 15 # Spans younger than this are served from cache
    hot-cache-max-spans: 10000   # Cap before oldest trace group is evicted
    prod-batch-size: 50          # Max traces returned by listTraces()
    noise-path-prefixes:         # Paths whose traces are dropped at ingest
      - /actuator
      - /v3/api-docs
      - /swagger-ui
      - /swagger-resources
      - /webjars
      - /scalar

  performance:
    retention-days: 30           # How long performance snapshots are kept

  docker:
    enabled: true                # Enables docker ps integration for infra view

  gateway:
    url: http://localhost:8080   # Used for gateway-vs-direct health comparison

  frontend:
    source-dir: /path/to/your/frontend/src   # For FrontendGrepTool

  llm:
    provider: ollama             # ollama | claude
    max-iterations: 10           # Agent loop hard stop
    request-timeout-seconds: 120
    ollama:
      base-url: http://localhost:11434
      model: qwen2.5:14b
      native-tools: true
    claude:
      base-url: https://api.anthropic.com
      model: claude-sonnet-4-5
      max-tokens: 2048
      api-key: ${SENTINEL_LLM_CLAUDE_API_KEY:}
```

Environment variable overrides for deployment:

| Variable | Property overridden |
|---|---|
| `SENTINEL_DB_URL` | `spring.datasource.url` |
| `SENTINEL_LLM_PROVIDER` | `sentinel.llm.provider` |
| `SENTINEL_LLM_CLAUDE_API_KEY` | `sentinel.llm.claude.api-key` |
| `SENTINEL_LLM_CLAUDE_MODEL` | `sentinel.llm.claude.model` |
| `OLLAMA_BASE_URL` | `sentinel.llm.ollama.base-url` |
| `OLLAMA_MODEL` | `sentinel.llm.ollama.model` |
| `SENTINEL_FRONTEND_SOURCE_DIR` | `sentinel.frontend.source-dir` |

---

## 18. Infrastructure & deployment

### 18.1 Dev (local)

```
docker-compose (infra/dev-postgresql/):
  ├── PostgreSQL 17    localhost:5432   DB: contract_sentinel
  └── (Redis not required for CS — no caching layer yet)

Spring Boot app:    localhost:8090
Swagger UI:         http://localhost:8090/swagger-ui.html
WebSocket:          ws://localhost:8090/ws/events
Zipkin endpoint:    http://localhost:8090/api/v2/spans   (pointed to by monitored services)
```

### 18.2 OSS fork package name

The root package is `io.contractsentinel`. Package structure, class names, and behavior are otherwise identical to the reference implementation.

### 18.3 Production considerations (not yet implemented)

- Extract CS to its own dedicated PostgreSQL instance.
- The `hot-cache-max-spans` cap (10,000) is sized for a few services at low traffic; raise or add Redis-backed caching for higher trace volume.
- Add compound index `(service_id, recordedAt)` on `cs_endpoint_performance_snapshots` before the table exceeds ~1M rows.
- Consider a dedicated thread pool for `RestClient` outbound calls (currently uses default fork-join) if polling latency becomes a bottleneck.

---

## 19. Invariants & things not to break

1. **The oldest snapshot is never deleted.** Drift detection's correctness depends on the baseline surviving. If you add a retention policy for snapshots, exempt `findTopByServiceAndFetchStatusOrderByFetchedAtAsc` results.
2. **Drift dedup key is `(service, changeType, httpMethod, apiPath)`.** If you add a new `ChangeType` enum value, the dedup check handles it automatically. If you change an existing value's name, all existing events with that type lose their dedup protection.
3. **Noise filter runs before `hotCache.isDuplicate()`.** The order matters — a span for a noise trace must be dropped before it can be recorded in the dedup set, or it would prevent a future real span with the same ID from being stored.
4. **WebSocket `broadcast()` is synchronized per session.** Do not remove this lock without understanding that `WebSocketSession.sendMessage()` is not thread-safe.
5. **`TraceHotCache` is not backed by the DB.** Spans in cache but not yet in DB (impossible in current code — `saveAll` and `put` happen in the same transaction block) would be lost on restart. The current design writes to DB first, then cache, so a restart loses only the cache warm-up window, not data.

---

## 20. Open decisions / known gaps

1. **Snapshot retention** — snapshots currently accumulate indefinitely. Only the oldest and latest matter for drift; everything in between is dead storage. A retention job that keeps oldest + last-N + UNREACHABLE records would reduce DB growth significantly.
2. **`cs_trace_spans` has no service FK** — `serviceName` is a plain string, not a FK to `cs_service_registry`. This is intentional (CS doesn't require that a traced service be registered) but means you can't join traces to registry data in SQL.
3. **No authentication** — CS has no login, session, or API key mechanism. It is assumed to be deployed on a private network accessible only to the team. Add Spring Security if the deployment surface changes.
4. **Agent run cleanup** — `AgentRun` records accumulate. There is currently no retention job or cleanup endpoint for completed/failed runs.
5. **`RestClient` for outbound polls has no connection pool config** — each `SpecFetcherScheduler` and `EndpointPerformanceServiceImpl` creates its own `RestClient` with default `SimpleClientHttpRequestFactory` (one connection per request). Under high service counts this may become a bottleneck; switching to `HttpComponentsClientHttpRequestFactory` with a connection pool would help.
6. **Dedup set size (1,000 spanIds) is fixed** — if a service emits more than 1,000 unique spans in a single Brave batch (unlikely but possible under load testing), the oldest dedup entries are evicted and a small number of spans could be double-processed. Raising `DEDUP_MAX` or making it configurable addresses this.
