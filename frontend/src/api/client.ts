import type { DriftEventDto, PageResponse, ServiceDto, SnapshotDto } from "./types"

const BASE_URL =
  (import.meta.env["VITE_SENTINEL_API_URL"] as string | undefined) ?? "http://localhost:8090"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  const text = await res.text()
  return text ? (JSON.parse(text) as T) : ({} as T)
}

export const sentinelApi = {
  services: {
    list: () => request<ServiceDto[]>("/api/services"),
    get: (id: string) => request<ServiceDto>(`/api/services/${id}`),
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
      if (params.severity) q.set("severity", params.severity)
      q.set("page", String(params.page ?? 0))
      q.set("size", String(params.size ?? 20))
      return request<PageResponse<DriftEventDto>>(`/api/drift?${q.toString()}`)
    },
    acknowledge: (id: string) =>
      request<DriftEventDto>(`/api/drift/${id}/acknowledge`, { method: "POST" }),
  },

  poll: {
    all: () => request<string>("/api/poll/now", { method: "POST" }),
    one: (serviceId: string) => request<string>(`/api/poll/${serviceId}`, { method: "POST" }),
  },
}
