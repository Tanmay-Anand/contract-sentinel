import { useQuery } from "@tanstack/react-query"
import { sentinelService } from "../../infrastructure/api/sentinel.service"

export const SNAPSHOT_KEYS = {
  list: (serviceId: string) => ["snapshots", serviceId] as const,
}

export function useSnapshots(serviceId: string, page = 0, size = 8) {
  return useQuery({
    queryKey: SNAPSHOT_KEYS.list(serviceId),
    queryFn:  () => sentinelService.snapshots.list(serviceId, page, size),
    enabled:  !!serviceId,
  })
}
