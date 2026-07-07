import { useQuery } from "@tanstack/react-query"
import { sentinelService } from "../../infrastructure/api/sentinel.service"

export const CATALOGUE_KEYS = {
  all: ["catalogue"] as const,
  search: (params: object) => ["catalogue", params] as const,
}

export function useCatalogue(params: { q?: string; serviceId?: string; method?: string } = {}) {
  return useQuery({
    queryKey: CATALOGUE_KEYS.search(params),
    queryFn: () => sentinelService.catalogue.search(params),
    enabled: true,
  })
}
