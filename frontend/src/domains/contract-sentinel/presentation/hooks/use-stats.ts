import { useQuery } from "@tanstack/react-query"
import { sentinelService } from "../../infrastructure/api/sentinel.service"

export function useCallCount() {
  return useQuery({
    queryKey: ["stats", "call-count"],
    queryFn: () => sentinelService.stats.callCount(),
    refetchInterval: 30_000,
  })
}
