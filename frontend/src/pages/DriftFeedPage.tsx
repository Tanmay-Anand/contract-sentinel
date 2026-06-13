import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { sentinelApi } from "@/api/client"
import { DriftEventRow } from "@/components/DriftEventRow"

const QUERY_KEY = ["drift"]

export default function DriftFeedPage() {
  const [severity, setSeverity] = useState<string>("")
  const [page, setPage] = useState(0)

  const queryKey = [...QUERY_KEY, severity, page]

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => sentinelApi.drift.list({ severity: severity || undefined, page, size: 20 }),
    refetchInterval: 60_000,
  })

  const totalPages = data?.page?.totalPages ?? 0

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold mb-1">Drift Feed</h1>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            All detected contract changes, newest first.
          </p>
        </div>

        <select
          value={severity}
          onChange={e => { setSeverity(e.target.value); setPage(0) }}
          className="text-sm px-3 py-2 rounded-lg border"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <option value="">All severities</option>
          <option value="BREAKING">Breaking only</option>
          <option value="SAFE">Safe only</option>
        </select>
      </div>

      {isLoading && (
        <div className="text-center py-12" style={{ color: "var(--color-text-secondary)" }}>
          Loading drift events…
        </div>
      )}

      {isError && (
        <div
          className="text-center py-12 rounded-xl border"
          style={{ color: "var(--color-breaking)", borderColor: "var(--color-breaking-border)", background: "var(--color-breaking-bg)" }}
        >
          Could not load drift events. Is the backend running?
        </div>
      )}

      {data && data.content.length === 0 && (
        <div
          className="text-center py-16 rounded-xl border"
          style={{ color: "var(--color-text-secondary)", borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          No drift events yet. Poll a service to start collecting data.
        </div>
      )}

      {data && data.content.length > 0 && (
        <>
          <div className="flex flex-col gap-3">
            {data.content.map(event => (
              <DriftEventRow key={event.id} event={event} queryKey={queryKey} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 rounded border text-sm disabled:opacity-40"
                style={{ borderColor: "var(--color-border)" }}
              >
                Previous
              </button>
              <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                Page {page + 1} of {totalPages} · {data?.page?.totalElements ?? 0} total
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 rounded border text-sm disabled:opacity-40"
                style={{ borderColor: "var(--color-border)" }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
