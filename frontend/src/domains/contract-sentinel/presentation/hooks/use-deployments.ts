import { useQuery } from "@tanstack/react-query"
import { sentinelService } from "../../infrastructure/api/sentinel.service"

export const DEPLOYMENT_KEYS = {
  all: ["deployments"] as const,
  list: (serviceId: string, page: number) => ["deployments", serviceId, page] as const,
  latest: (serviceId: string) => ["deployments", serviceId, "latest"] as const,
}

export function useDeployments(serviceId: string, page = 0) {
  return useQuery({
    queryKey: DEPLOYMENT_KEYS.list(serviceId, page),
    queryFn: () => sentinelService.deployments.list(serviceId, page),
    enabled: !!serviceId,
  })
}

export function useLatestDeployment(serviceId: string) {
  return useQuery({
    queryKey: DEPLOYMENT_KEYS.latest(serviceId),
    queryFn: () => sentinelService.deployments.latest(serviceId),
    enabled: !!serviceId,
  })
}
