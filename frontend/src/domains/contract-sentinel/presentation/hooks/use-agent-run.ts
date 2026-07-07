import { useMutation, useQuery } from "@tanstack/react-query"
import { sentinelService } from "../../infrastructure/api/sentinel.service"

const TERMINAL = new Set(["COMPLETE", "FAILED"])

export function useDiagnose() {
  return useMutation({
    mutationFn: (body: { serviceId: string; method: string; path: string; mode?: string }) =>
      sentinelService.agents.diagnose(body),
  })
}

export function useSchemaRisk() {
  return useMutation({
    mutationFn: (migrationSql: string) => sentinelService.agents.schemaRisk(migrationSql),
  })
}

export function useAgentRun(runId: string | null) {
  return useQuery({
    queryKey: ["agent-run", runId],
    queryFn: () => sentinelService.agents.getRun(runId as string),
    enabled: !!runId,
    refetchInterval: (query) => (query.state.data && TERMINAL.has(query.state.data.status) ? false : 1500),
  })
}
