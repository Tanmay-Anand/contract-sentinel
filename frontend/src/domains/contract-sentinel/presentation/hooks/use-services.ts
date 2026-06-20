import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { sentinelService } from "../../infrastructure/api/sentinel.service"

export const SERVICE_KEYS = {
  all:    ["services"]             as const,
  detail: (id: string) => ["services", id] as const,
}

export function useServices() {
  return useQuery({
    queryKey: SERVICE_KEYS.all,
    queryFn:  sentinelService.services.list,
    refetchInterval: 60_000,
  })
}

export function useService(id: string) {
  return useQuery({
    queryKey: SERVICE_KEYS.detail(id),
    queryFn:  () => sentinelService.services.get(id),
    refetchInterval: 30_000,
  })
}

export function usePollAll() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: sentinelService.poll.all,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SERVICE_KEYS.all })
    },
  })
}

export function usePollOne(serviceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => sentinelService.poll.one(serviceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SERVICE_KEYS.all })
      void queryClient.invalidateQueries({ queryKey: SERVICE_KEYS.detail(serviceId) })
    },
  })
}

export function useRedetect(serviceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => sentinelService.poll.redetect(serviceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SERVICE_KEYS.all })
      void queryClient.invalidateQueries({ queryKey: SERVICE_KEYS.detail(serviceId) })
      void queryClient.invalidateQueries({ queryKey: ["drift"] })
    },
  })
}
