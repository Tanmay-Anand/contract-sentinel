import { useQuery } from "@tanstack/react-query"
import { sentinelService } from "../../infrastructure/api/sentinel.service"

export const INFRA_KEYS = {
  containers: ["infrastructure", "containers"] as const,
  gatewayHealth: ["infrastructure", "gateway-health"] as const,
}

export function useContainers() {
  return useQuery({
    queryKey: INFRA_KEYS.containers,
    queryFn: sentinelService.infrastructure.containers,
    refetchInterval: 30_000,
  })
}

export function useGatewayHealth() {
  return useQuery({
    queryKey: INFRA_KEYS.gatewayHealth,
    queryFn: sentinelService.infrastructure.gatewayHealth,
    refetchInterval: 30_000,
  })
}
