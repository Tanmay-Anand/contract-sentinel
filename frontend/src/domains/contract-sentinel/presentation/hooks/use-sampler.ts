import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { sentinelService } from "../../infrastructure/api/sentinel.service"
import type { SampledEndpointRequest } from "../../infrastructure/api/types"

const SAMPLER_ENDPOINTS_KEY = ["sampler-endpoints"] as const

const SAMPLER_KEYS = {
  all: SAMPLER_ENDPOINTS_KEY,
  results: (endpointId: string, page: number) => ["sampler-results", endpointId, page] as const,
  sizes: ["sampler-sizes"] as const,
  heaviest: (serviceId: string) => ["sampler-heaviest", serviceId] as const,
}

export function useSampledEndpoints() {
  return useQuery({
    queryKey: SAMPLER_KEYS.all,
    queryFn: sentinelService.sampler.list,
    refetchInterval: 60_000,
  })
}

export function useCreateSampledEndpoint() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: SampledEndpointRequest) => sentinelService.sampler.create(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SAMPLER_KEYS.all })
    },
  })
}

export function useDeleteSampledEndpoint() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => sentinelService.sampler.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SAMPLER_KEYS.all })
    },
  })
}

export function useRunSample() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => sentinelService.sampler.run(id),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: ["sampler-results", id] })
      void queryClient.invalidateQueries({ queryKey: SAMPLER_KEYS.all })
      void queryClient.invalidateQueries({ queryKey: SAMPLER_KEYS.sizes })
    },
  })
}

export function useSamplingResults(endpointId: string, page = 0) {
  return useQuery({
    queryKey: SAMPLER_KEYS.results(endpointId, page),
    queryFn: () => sentinelService.sampler.results(endpointId, page),
    enabled: !!endpointId,
  })
}

export function useEndpointSizes() {
  return useQuery({
    queryKey: SAMPLER_KEYS.sizes,
    queryFn: sentinelService.sampler.sizes,
    staleTime: 30_000,
  })
}

export function useCorrelation(endpointId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["sampler-correlation", endpointId],
    queryFn: () => sentinelService.sampler.correlation(endpointId),
    enabled: enabled && !!endpointId,
  })
}

export function useHeaviestEndpoints(serviceId: string) {
  return useQuery({
    queryKey: SAMPLER_KEYS.heaviest(serviceId),
    queryFn: () => sentinelService.sampler.heaviest(serviceId),
    enabled: !!serviceId,
  })
}
