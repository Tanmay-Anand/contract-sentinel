import { useQuery } from "@tanstack/react-query"
import { sentinelService } from "../../infrastructure/api/sentinel.service"

export const USAGE_KEYS = {
  summary: (serviceId: string) => ["usage", serviceId, "summary"] as const,
  deadEndpoints: (serviceId: string) => ["usage", serviceId, "dead"] as const,
}

export function useUsageSummary(serviceId: string) {
  return useQuery({
    queryKey: USAGE_KEYS.summary(serviceId),
    queryFn: () => sentinelService.usage.summary(serviceId),
    enabled: !!serviceId,
    refetchInterval: 60_000,
  })
}

export function useDeadEndpoints(serviceId: string) {
  return useQuery({
    queryKey: USAGE_KEYS.deadEndpoints(serviceId),
    queryFn: () => sentinelService.usage.deadEndpoints(serviceId),
    enabled: !!serviceId,
    refetchInterval: 60_000,
  })
}
