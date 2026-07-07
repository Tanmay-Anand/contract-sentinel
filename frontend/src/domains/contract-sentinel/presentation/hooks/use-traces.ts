import { useQuery } from "@tanstack/react-query"
import { sentinelService } from "../../infrastructure/api/sentinel.service"

export function useTraces(params: { serviceName?: string; minDurationMs?: number; sinceMinutes?: number } = {}) {
  return useQuery({
    queryKey: ["traces", params],
    queryFn: () => sentinelService.traces.list(params),
    refetchInterval: 10_000,
  })
}

export function useTrace(traceId: string | null) {
  return useQuery({
    queryKey: ["trace", traceId],
    queryFn: () => sentinelService.traces.get(traceId as string),
    enabled: !!traceId,
  })
}
