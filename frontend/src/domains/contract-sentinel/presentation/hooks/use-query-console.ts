import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { sentinelService } from "../../infrastructure/api/sentinel.service"
import type { DbQueryResponse } from "../../infrastructure/api/types"

export function useDbQuery() {
  return useMutation<DbQueryResponse, Error, { serviceId: string; sql: string }>({
    mutationFn: ({ serviceId, sql }) => sentinelService.db.query(serviceId, sql),
    onError: (err) => toast.error(err.message),
  })
}
