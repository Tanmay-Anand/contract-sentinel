import { toast } from "sonner"
import type {
  AlertConfigDto,
  AlertConfigRequest,
  AlertEventDto,
  BlastRadiusDto,
  CallCountDto,
  CatalogueEntryDto,
  ContainerDto,
  DbSchemaGroupDto,
  DeadEndpointDto,
  DeploymentEventDto,
  DriftEventDto,
  GatewayHealthDto,
  LatencyMetricDto,
  ManualDependencyRequest,
  NginxRoute,
  PageResponse,
  SampledEndpointDto,
  SampledEndpointRequest,
  SamplingResultDto,
  ServiceDto,
  ServiceEdgeDto,
  ServiceGraphDto,
  SnapshotDto,
  TableSchemaDto,
  SpecDiffDto,
  UsageEntryDto,
} from "./types"

const BASE_URL = (import.meta.env["VITE_SENTINEL_API_URL"] as string | undefined) ?? "http://localhost:8090"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    let message = `Request failed (${res.status})`
    try {
      const json = JSON.parse(text) as { message?: string }
      if (json.message) message = json.message
    } catch { /* use status message */ }
    toast.error(message)
    throw new Error(message)
  }

  const text = await res.text()
  return text ? (JSON.parse(text) as T) : ({} as T)
}

export const sentinelService = {
  services: {
    list: () => request<ServiceDto[]>("/api/services"),
    get:  (id: string) => request<ServiceDto>(`/api/services/${id}`),
  },

  snapshots: {
    list: (serviceId: string, page = 0, size = 10) =>
      request<PageResponse<SnapshotDto>>(
        `/api/services/${serviceId}/snapshots?page=${page}&size=${size}`,
      ),
  },

  drift: {
    list: (params: { serviceId?: string; severity?: string; page?: number; size?: number } = {}) => {
      const q = new URLSearchParams()
      if (params.serviceId) q.set("serviceId", params.serviceId)
      if (params.severity)  q.set("severity",  params.severity)
      q.set("page", String(params.page ?? 0))
      q.set("size", String(params.size ?? 20))
      return request<PageResponse<DriftEventDto>>(`/api/drift?${q.toString()}`)
    },
    acknowledge: (id: string) =>
      request<DriftEventDto>(`/api/drift/${id}/acknowledge`, { method: "POST" }),
    unacknowledge: (id: string) =>
      request<DriftEventDto>(`/api/drift/${id}/unacknowledge`, { method: "POST" }),
  },

  poll: {
    all:      ()                  => request<string>("/api/poll/now",                       { method: "POST" }),
    one:      (serviceId: string) => request<string>(`/api/poll/${serviceId}`,              { method: "POST" }),
    redetect: (serviceId: string) => request<string>(`/api/services/${serviceId}/redetect`, { method: "POST" }),
  },

  catalogue: {
    search: (params: { q?: string; serviceId?: string; method?: string } = {}) => {
      const q = new URLSearchParams()
      if (params.q) q.set("q", params.q)
      if (params.serviceId) q.set("serviceId", params.serviceId)
      if (params.method) q.set("method", params.method)
      return request<CatalogueEntryDto[]>(`/api/catalogue?${q}`)
    },
  },

  alerts: {
    listConfigs: () => request<AlertConfigDto[]>("/api/alerts/configs"),
    createConfig: (data: AlertConfigRequest) =>
      request<AlertConfigDto>("/api/alerts/configs", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    updateConfig: (id: string, data: AlertConfigRequest) =>
      request<AlertConfigDto>(`/api/alerts/configs/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    deleteConfig: (id: string) =>
      request<void>(`/api/alerts/configs/${id}`, { method: "DELETE" }),
    testConfig: (id: string) =>
      request<AlertConfigDto>(`/api/alerts/configs/${id}/test`, { method: "POST" }),
    listEvents: () => request<AlertEventDto[]>("/api/alerts/events"),
  },

  deployments: {
    list: (serviceId: string, page = 0, size = 20) =>
      request<PageResponse<DeploymentEventDto>>(
        `/api/services/${serviceId}/deployments?page=${page}&size=${size}`,
      ),
    latest: (serviceId: string) =>
      request<DeploymentEventDto>(`/api/services/${serviceId}/deployments/latest`),
  },

  diff: {
    get: (toSnapshotId: string) =>
      request<SpecDiffDto>(`/api/drift/diff/${toSnapshotId}`),
  },

  latency: {
    get: (serviceId: string, limit = 50) =>
      request<LatencyMetricDto[]>(`/api/services/${serviceId}/latency?limit=${limit}`),
  },

  usage: {
    summary: (serviceId: string) =>
      request<UsageEntryDto[]>(`/api/services/${serviceId}/usage/summary`),
    deadEndpoints: (serviceId: string) =>
      request<DeadEndpointDto[]>(`/api/services/${serviceId}/usage/dead-endpoints`),
  },

  sampler: {
    list: () => request<SampledEndpointDto[]>("/api/sampler/endpoints"),
    create: (data: SampledEndpointRequest) =>
      request<SampledEndpointDto>("/api/sampler/endpoints", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    delete: (id: string) =>
      request<void>(`/api/sampler/endpoints/${id}`, { method: "DELETE" }),
    run: (id: string) =>
      request<SamplingResultDto>(`/api/sampler/endpoints/${id}/run`, { method: "POST" }),
    results: (id: string, page = 0) =>
      request<PageResponse<SamplingResultDto>>(
        `/api/sampler/endpoints/${id}/results?page=${page}&size=10`,
      ),
  },

  infrastructure: {
    containers: () => request<ContainerDto[]>("/api/infrastructure/containers"),
    gatewayHealth: () => request<GatewayHealthDto[]>("/api/infrastructure/gateway-health"),
    parseNginx: (config: string) =>
      request<NginxRoute[]>("/api/infrastructure/nginx/parse", {
        method: "POST",
        body: config,
        headers: { "Content-Type": "text/plain" },
      }),
  },

  graph: {
    get: () => request<ServiceGraphDto>("/api/graph"),
    scan: () => request<string>("/api/graph/scan", { method: "POST" }),
    addManual: (data: ManualDependencyRequest) => request<ServiceEdgeDto>("/api/dependencies", {
      method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" },
    }),
    removeEdge: (id: string) => request<void>(`/api/dependencies/${id}`, { method: "DELETE" }),
    blastRadius: (serviceId: string) => request<BlastRadiusDto>(`/api/graph/blast-radius/${serviceId}`),
    driftBlastRadius: (driftEventId: string) => request<BlastRadiusDto>(`/api/drift/${driftEventId}/blast-radius`),
    dbSchema: (edgeId: string) => request<TableSchemaDto[]>(`/api/dependencies/${edgeId}/db-schema`),
    dbGraph: () => request<DbSchemaGroupDto[]>("/api/graph/db-graph"),
  },

  stats: {
    callCount: () => request<CallCountDto>("/api/stats/call-count"),
  },
}
