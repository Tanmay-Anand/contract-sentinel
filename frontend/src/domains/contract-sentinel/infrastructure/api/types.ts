export interface ServiceDto {
  id: string
  name: string
  baseUrl: string
  specPath: string
  active: boolean
  createdAt: string
  status: "HEALTHY" | "DRIFTED" | "UNREACHABLE" | "PARSE_FAILED" | "UNKNOWN"
  breakingDriftCount: number
}

export interface SnapshotDto {
  id: string
  serviceId: string
  serviceName: string
  specHash: string
  fetchedAt: string
  fetchStatus: "FETCHED" | "UNREACHABLE" | "PARSE_FAILED"
}

export type ChangeType =
  | "PATH_REMOVED"
  | "RESPONSE_FIELD_REMOVED"
  | "RESPONSE_FIELD_TYPE_CHANGED"
  | "REQUEST_REQUIRED_FIELD_ADDED"
  | "PATH_ADDED"
  | "RESPONSE_FIELD_ADDED"
  | "REQUEST_OPTIONAL_FIELD_ADDED"

export type Severity = "BREAKING" | "SAFE"

export interface DriftEventDto {
  id: string
  serviceId: string
  serviceName: string
  changeType: ChangeType
  severity: Severity
  httpMethod: string | null
  apiPath: string | null
  detail: string | null
  detectedAt: string
  acknowledged: boolean
}

export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  pageNumber: number   // 1-based, matches backend PaginatedResponse convention
  pageSize: number
  first: boolean
  last: boolean
  empty: boolean
  from: number
  to: number
}

// API Catalogue
export interface ParameterInfo {
  name: string
  in: string
  required: boolean
  type: string | null
  description: string | null
}

export interface FieldInfo {
  name: string
  type: string | null
  required: boolean
  description: string | null
}

export interface CatalogueEntryDto {
  serviceId: string
  serviceName: string
  httpMethod: string
  path: string
  summary: string | null
  operationId: string | null
  tags: string[]
  parameters: ParameterInfo[]
  requestFields: FieldInfo[]
  responseFields: FieldInfo[]
}

// Alerting
export type AlertChannel = "SLACK" | "WEBHOOK"
export type AlertTriggerType = "BREAKING_CHANGE" | "UNREACHABLE" | "SAFE_CHANGE"

export interface AlertConfigDto {
  id: string
  name: string
  channel: AlertChannel
  destination: string
  triggerOnBreaking: boolean
  triggerOnUnreachable: boolean
  triggerOnSafe: boolean
  serviceFilter: string | null
  cooldownMinutes: number
  enabled: boolean
  createdAt: string
}

export interface AlertEventDto {
  id: string
  configId: string
  serviceId: string
  serviceName: string
  triggerType: AlertTriggerType
  message: string
  delivered: boolean
  errorMessage: string | null
  firedAt: string
}

export interface AlertConfigRequest {
  name: string
  channel: AlertChannel
  destination: string
  triggerOnBreaking: boolean
  triggerOnUnreachable: boolean
  triggerOnSafe: boolean
  serviceFilter: string | null
  cooldownMinutes: number
}

// Deployment
export interface DeploymentEventDto {
  id: string
  serviceId: string
  serviceName: string
  detectedAt: string
  buildVersion: string | null
  buildTime: string | null
  gitCommit: string | null
  gitBranch: string | null
  gitMessage: string | null
}

// Diff
export interface DiffChangeDto {
  changeType: string
  severity: string
  httpMethod: string | null
  apiPath: string | null
  detail: string | null
  detectedAt: string
  acknowledged: boolean
}

export interface DiffGroupDto {
  httpMethod: string
  path: string
  changes: DiffChangeDto[]
}

export interface SpecDiffDto {
  fromSnapshotId: string | null
  toSnapshotId: string
  detectedAt: string
  totalBreaking: number
  totalSafe: number
  groups: DiffGroupDto[]
}

// Latency
export interface LatencyMetricDto {
  id: string
  serviceId: string
  recordedAt: string
  specFetchMs: number | null
  p50Ms: number | null
  p95Ms: number | null
  p99Ms: number | null
  requestCount: number | null
  source: string
  dominantEndpointMethod: string | null
  dominantEndpointPath: string | null
}

// Usage
export interface UsageEntryDto {
  httpMethod: string
  path: string
  totalCount: number
  deltaCount: number
  sampledAt: string
  dead: boolean
}

export interface DeadEndpointDto {
  httpMethod: string
  path: string
  lastSeenCount: number
  consecutiveZeroSamples: number
  lastSampledAt: string
}

// Sampler
export interface SampledEndpointDto {
  id: string
  serviceId: string
  serviceName: string
  httpMethod: string
  path: string
  sampleUrl: string
  tenantId: string | null
  enabled: boolean
  sampleIntervalMinutes: number
  lastSampledAt: string | null
  createdAt: string
}

export interface SamplingResultDto {
  id: string
  endpointId: string
  sampledAt: string
  httpStatus: number
  actualFields: string[]
  specFields: string[]
  undocumentedFields: string[]
  missingFields: string[]
  matchScore: number
  responseSizeBytes: number | null
  durationMs: number | null
}

export interface CorrelationPoint {
  sizeBytes: number
  durationMs: number
}

export interface CorrelationResponse {
  sufficient: boolean
  n: number
  r: number | null
  slope: number | null
  classification: string
  points: CorrelationPoint[]
}

export interface EndpointSizeDto {
  serviceId: string
  httpMethod: string
  path: string
  responseSizeBytes: number
}

export interface SampledEndpointRequest {
  serviceId: string
  httpMethod: string
  path: string
  sampleUrl: string
  authHeader?: string
  tenantId?: string
  sampleIntervalMinutes: number
}

// Infrastructure
export interface ContainerDto {
  id: string
  name: string
  image: string
  status: string
  health: string
  running: boolean
  ports: string[]
}

export interface GatewayHealthDto {
  serviceId: string
  serviceName: string
  directUrl: string
  gatewayUrl: string | null
  directStatus: string
  gatewayStatus: string
  diagnosis: string
}

export interface NginxRoute {
  location: string
  upstream: string
  targetPort: number
  trailingSlashIssue: boolean
}

// Dependency Graph
export interface ServiceNodeDto {
  id: string
  name: string
  baseUrl: string
  status: string  // "FETCHED" | "UNREACHABLE" | "PARSE_FAILED" | "NEVER_POLLED"
  breakingChanges: number
  hasStaleEdges: boolean
}

export interface EndpointCall {
  method: string   // GET, POST, PUT, DELETE, â€¦
  path: string     // e.g. /cost-sheets/unit-config/{unitId}
  description: string
}

export interface ServiceEdgeDto {
  id: string
  sourceId: string
  sourceName: string
  targetId: string
  targetName: string
  detectionMethod: string  // "ACTUATOR_ENV" | "MANUAL"
  propertyName: string | null
  confidence: string
  verifiedAt: string
  scanFailedAt: string | null
  stale: boolean
  endpointCalls: EndpointCall[]
  avgLatencyMs: number | null
  latencyBand: string | null   // "fast" | "medium" | "slow"
}

export interface ServiceGraphDto {
  nodes: ServiceNodeDto[]
  edges: ServiceEdgeDto[]
  computedAt: string
}

export interface BlastRadiusDto {
  epicenterId: string
  epicenterName: string
  directlyImpactedIds: string[]
  transitivelyImpactedIds: string[]
  totalImpacted: number
}

export interface ColumnDto {
  name: string
  type: string
  nullable: boolean
}

export interface TableSchemaDto {
  tableName: string
  columns: ColumnDto[]
}

export interface ManualDependencyRequest {
  sourceServiceId: string
  targetServiceId: string
  label?: string
}

export interface ForeignKeyDto {
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
}

export interface DbSchemaGroupDto {
  serviceGroupName: string
  tables: TableSchemaDto[]
  foreignKeys: ForeignKeyDto[]
}

export interface CallCountDto {
  specPolls: number
  actuatorInfo: number
  actuatorEnv: number
  outboundScans: number
  samplerRuns: number
  actuatorMetrics: number
  total: number
  ingestRequests: number
  ingestSpans: number
  prodEquivalentRequests: number
}

export interface DbQueryResponse {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  executionMs: number
}

// JFR Profiler
export interface HotMethodDto {
  rank: number
  frame: string
  samples: number
  percentage: number
}

export interface ProfilingRunDto {
  id: string
  serviceId: string
  serviceName: string
  status: "REQUESTED" | "RECORDING" | "DOWNLOADING" | "PARSING" | "COMPLETE" | "FAILED"
  durationSeconds: number
  startedAt: string
  completedAt: string | null
  errorMessage: string | null
  totalSamples: number
  hotMethods: HotMethodDto[]
}

// Performance Registry
export interface EndpointPerformanceRow {
  serviceId: string
  serviceName: string
  httpMethod: string
  path: string
  countDelta: number
  p50Ms: number | null
  p95Ms: number | null
  p99Ms: number | null
  errorRatePct: number
  responseSizeBytes: number | null
  p99MedianRatio: number
  p95Sparkline: number[]
  volatilityCv: number | null
  volatilityRating: string
}

export interface EndpointPerformancePoint {
  recordedAt: string
  p50Ms: number | null
  p95Ms: number | null
  p99Ms: number | null
  countDelta: number
  errorCount: number
}

export interface EndpointPerformanceDetail {
  serviceId: string
  serviceName: string
  httpMethod: string
  path: string
  points: EndpointPerformancePoint[]
}

// Traces
export interface TraceSummaryDto {
  traceId: string
  rootName: string
  entryService: string
  totalDurationMicros: number
  spanCount: number
  hasError: boolean
  startEpochMicros: number
}

export interface TraceSpanNode {
  spanId: string
  parentSpanId: string | null
  serviceName: string
  name: string
  kind: string | null
  depth: number
  offsetMicros: number
  durationMicros: number
  httpMethod: string | null
  httpPath: string | null
  httpStatus: number | null
}

export interface TraceTreeDto {
  traceId: string
  rootName: string
  totalDurationMicros: number
  startEpochMicros: number
  spans: TraceSpanNode[]
}

// AI Agents
export interface AgentStep {
  seq: number
  type: string   // "thought" | "tool_call" | "tool_result"
  name: string | null
  summary: string | null
  at: string
}

export interface AgentRunDto {
  id: string
  agentType: "DIAGNOSE" | "SCHEMA_RISK"
  status: "RUNNING" | "COMPLETE" | "FAILED"
  steps: AgentStep[]
  resultMarkdown: string | null
  llmProvider: string | null
  iterations: number
  createdAt: string
  completedAt: string | null
}
