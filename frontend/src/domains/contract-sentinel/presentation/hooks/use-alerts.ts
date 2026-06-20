import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { sentinelService } from "../../infrastructure/api/sentinel.service"
import type { AlertConfigRequest } from "../../infrastructure/api/types"

const ALERT_CONFIG_KEY = ["alert-configs"] as const
const ALERT_EVENTS_KEY = ["alert-events"] as const

export function useAlertConfigs() {
  return useQuery({
    queryKey: ALERT_CONFIG_KEY,
    queryFn: sentinelService.alerts.listConfigs,
  })
}

export function useAlertEvents() {
  return useQuery({
    queryKey: ALERT_EVENTS_KEY,
    queryFn: sentinelService.alerts.listEvents,
    refetchInterval: 30_000,
  })
}

export function useCreateAlertConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: AlertConfigRequest) => sentinelService.alerts.createConfig(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ALERT_CONFIG_KEY })
    },
  })
}

export function useUpdateAlertConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AlertConfigRequest }) =>
      sentinelService.alerts.updateConfig(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ALERT_CONFIG_KEY })
    },
  })
}

export function useDeleteAlertConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => sentinelService.alerts.deleteConfig(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ALERT_CONFIG_KEY })
    },
  })
}

export function useTestAlertConfig() {
  return useMutation({
    mutationFn: (id: string) => sentinelService.alerts.testConfig(id),
  })
}
