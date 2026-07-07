import { useQuery } from "@tanstack/react-query"
import { sentinelService } from "../../infrastructure/api/sentinel.service"

export function usePerformanceRegistry(params: { serviceId?: string; method?: string; q?: string } = {}) {
  return useQuery({
    queryKey: ["performance-registry", params],
    queryFn: () => sentinelService.performance.registry(params),
    refetchInterval: 30_000,
  })
}

export function usePerformanceHistory(serviceId: string, method: string, path: string, days = 7) {
  return useQuery({
    queryKey: ["performance-history", serviceId, method, path, days],
    queryFn: () => sentinelService.performance.history(serviceId, method, path, days),
    enabled: !!serviceId && !!method && !!path,
  })
}
