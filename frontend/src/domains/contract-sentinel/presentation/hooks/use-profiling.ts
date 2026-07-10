import { useMutation, useQuery } from "@tanstack/react-query"
import { sentinelService } from "../../infrastructure/api/sentinel.service"

const TERMINAL = new Set(["COMPLETE", "FAILED"])

export function useStartProfiling() {
  return useMutation({
    mutationFn: ({ serviceId, durationSeconds }: { serviceId: string; durationSeconds: number }) =>
      sentinelService.profiling.start(serviceId, durationSeconds),
  })
}

export function useProfilingRun(runId: string | null) {
  return useQuery({
    queryKey: ["profiling-run", runId],
    queryFn: () => sentinelService.profiling.getRun(runId as string),
    enabled: !!runId,
    refetchInterval: (query) => (query.state.data && TERMINAL.has(query.state.data.status) ? false : 2000),
  })
}
