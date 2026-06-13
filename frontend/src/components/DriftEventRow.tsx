import { CheckCheck } from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { sentinelApi } from "@/api/client"
import { SeverityBadge } from "./SeverityBadge"
import type { DriftEventDto } from "@/api/types"

const CHANGE_TYPE_LABELS: Record<string, string> = {
  PATH_REMOVED: "Path Removed",
  RESPONSE_FIELD_REMOVED: "Response Field Removed",
  RESPONSE_FIELD_TYPE_CHANGED: "Field Type Changed",
  REQUEST_REQUIRED_FIELD_ADDED: "Required Field Added",
  PATH_ADDED: "Path Added",
  RESPONSE_FIELD_ADDED: "Response Field Added",
  REQUEST_OPTIONAL_FIELD_ADDED: "Optional Field Added",
}

interface Props {
  event: DriftEventDto
  queryKey: unknown[]
}

export function DriftEventRow({ event, queryKey }: Props) {
  const queryClient = useQueryClient()

  const { mutate: acknowledge, isPending } = useMutation({
    mutationFn: () => sentinelApi.drift.acknowledge(event.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  let detailObj: Record<string, string> = {}
  try {
    if (event.detail) detailObj = JSON.parse(event.detail) as Record<string, string>
  } catch {
    /* ignore */
  }

  return (
    <div
      className="p-4 rounded-lg border transition-opacity"
      style={{
        background: event.acknowledged ? "#f8fafc" : "var(--color-surface)",
        borderColor: "var(--color-border)",
        opacity: event.acknowledged ? 0.6 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <SeverityBadge severity={event.severity} />
            <span
              className="text-xs font-medium px-2 py-0.5 rounded"
              style={{ background: "#f1f5f9", color: "var(--color-text-secondary)" }}
            >
              {CHANGE_TYPE_LABELS[event.changeType] ?? event.changeType}
            </span>
            <span className="text-xs font-mono" style={{ color: "var(--color-text-secondary)" }}>
              {event.serviceName}
            </span>
          </div>

          {event.httpMethod && event.apiPath && (
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-xs font-bold px-1.5 py-0.5 rounded font-mono"
                style={{ background: "var(--color-primary-muted)", color: "var(--color-primary-hover)" }}
              >
                {event.httpMethod}
              </span>
              <code className="text-xs" style={{ color: "var(--color-text-primary)" }}>
                {event.apiPath}
              </code>
            </div>
          )}

          {Object.keys(detailObj).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(detailObj).map(([k, v]) => (
                <span
                  key={k}
                  className="text-xs px-2 py-0.5 rounded font-mono"
                  style={{ background: "#f1f5f9", color: "var(--color-text-secondary)" }}
                >
                  {k}: <strong>{v}</strong>
                </span>
              ))}
            </div>
          )}

          <p className="text-xs mt-2" style={{ color: "var(--color-text-secondary)" }}>
            {new Date(event.detectedAt).toLocaleString()}
          </p>
        </div>

        {!event.acknowledged && (
          <button
            onClick={() => acknowledge()}
            disabled={isPending}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border transition-colors shrink-0"
            style={{
              color: "var(--color-text-secondary)",
              borderColor: "var(--color-border)",
              background: "var(--color-surface)",
            }}
            title="Mark as reviewed"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Review
          </button>
        )}
      </div>
    </div>
  )
}
