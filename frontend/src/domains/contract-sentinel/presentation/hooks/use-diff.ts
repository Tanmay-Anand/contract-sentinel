import { useQuery } from "@tanstack/react-query"
import { sentinelService } from "../../infrastructure/api/sentinel.service"

export const DIFF_KEYS = {
  get: (snapshotId: string) => ["diff", snapshotId] as const,
}

export function useSpecDiff(toSnapshotId: string | null) {
  return useQuery({
    queryKey: DIFF_KEYS.get(toSnapshotId ?? ""),
    queryFn: () => sentinelService.diff.get(toSnapshotId!),
    enabled: toSnapshotId !== null,
  })
}
