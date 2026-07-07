import { useQuery } from "@tanstack/react-query"
import { sentinelService } from "../../infrastructure/api/sentinel.service"

export const LATENCY_KEYS = {
  get: (serviceId: string, limit: number) => ["latency", serviceId, limit] as const,
}

export function useLatency(serviceId: string, limit = 50) {
  return useQuery({
    queryKey: LATENCY_KEYS.get(serviceId, limit),
    queryFn: () => sentinelService.latency.get(serviceId, limit),
    enabled: !!serviceId,
    refetchInterval: 60_000,
  })
}
