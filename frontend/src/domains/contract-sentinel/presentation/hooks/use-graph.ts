import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { sentinelService } from "../../infrastructure/api/sentinel.service"
import { toast } from "sonner"
import type { DbSchemaGroupDto, ManualDependencyRequest, TableSchemaDto } from "../../infrastructure/api/types"

export const GRAPH_KEYS = {
  graph: ["graph"] as const,
  blastRadius: (id: string) => ["graph", "blast-radius", id] as const,
  dbSchema: (edgeId: string) => ["graph", "db-schema", edgeId] as const,
}

export function useGraph() {
  return useQuery({
    queryKey: GRAPH_KEYS.graph,
    queryFn: () => sentinelService.graph.get(),
    refetchInterval: 30_000,
  })
}

export function useScanGraph() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => sentinelService.graph.scan(),
    onSuccess: () => {
      toast.success("Dependency scan triggered")
      setTimeout(() => qc.invalidateQueries({ queryKey: GRAPH_KEYS.graph }), 2000)
    },
    onError: () => toast.error("Scan failed"),
  })
}

export function useBlastRadius(serviceId: string | null) {
  return useQuery({
    queryKey: GRAPH_KEYS.blastRadius(serviceId ?? ""),
    queryFn: () => sentinelService.graph.blastRadius(serviceId!),
    enabled: serviceId != null,
  })
}

export function useAddManualEdge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ManualDependencyRequest) => sentinelService.graph.addManual(data),
    onSuccess: () => {
      toast.success("Dependency added")
      qc.invalidateQueries({ queryKey: GRAPH_KEYS.graph })
    },
    onError: () => toast.error("Failed to add dependency"),
  })
}

export function useDbSchema(edgeId: string | null) {
  return useQuery<TableSchemaDto[]>({
    queryKey: GRAPH_KEYS.dbSchema(edgeId ?? ""),
    queryFn: () => sentinelService.graph.dbSchema(edgeId!),
    enabled: edgeId != null,
    staleTime: 60_000,
  })
}

export function useDbGraph() {
  return useQuery<DbSchemaGroupDto[]>({
    queryKey: ["graph", "db-graph"],
    queryFn: () => sentinelService.graph.dbGraph(),
    staleTime: 60_000,
  })
}

export function useRemoveEdge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => sentinelService.graph.removeEdge(id),
    onSuccess: () => {
      toast.success("Dependency removed")
      qc.invalidateQueries({ queryKey: GRAPH_KEYS.graph })
    },
    onError: () => toast.error("Failed to remove dependency"),
  })
}
