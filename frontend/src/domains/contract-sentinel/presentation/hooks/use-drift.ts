import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { sentinelService } from "../../infrastructure/api/sentinel.service"

export const DRIFT_KEYS = {
  all:  ["drift"] as const,
  list: (params: object) => ["drift", params] as const,
}

interface DriftListParams {
  serviceId?: string
  severity?:  string
  page?:      number
  size?:      number
}

export function useDriftEvents(params: DriftListParams = {}) {
  return useQuery({
    queryKey: DRIFT_KEYS.list(params),
    queryFn:  () => sentinelService.drift.list(params),
    refetchInterval: 60_000,
  })
}

export function useAcknowledgeDrift(invalidateKey: unknown[]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => sentinelService.drift.acknowledge(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: invalidateKey })
      void queryClient.invalidateQueries({ queryKey: DRIFT_KEYS.all })
    },
  })
}

export function useUnacknowledgeDrift(invalidateKey: unknown[]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => sentinelService.drift.unacknowledge(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: invalidateKey })
      void queryClient.invalidateQueries({ queryKey: DRIFT_KEYS.all })
    },
  })
}
