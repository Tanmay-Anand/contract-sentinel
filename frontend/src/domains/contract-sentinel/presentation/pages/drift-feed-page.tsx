import { useState } from "react"
import { DriftEventRow } from "../components/drift-event-row"
import { useDriftEvents, DRIFT_KEYS } from "../hooks/use-drift"
import { useGraph } from "../hooks/use-graph"

export default function DriftFeedPage() {
  const [page, setPage] = useState(0)

  const queryKey = DRIFT_KEYS.list({ page, size: 20 })
  const { data, isLoading, isError } = useDriftEvents({ page, size: 20 })
  const { data: graphData } = useGraph()

  const totalPages    = data?.totalPages    ?? 0
  const totalElements = data?.totalElements ?? 0

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold mb-1">Contract Changes</h1>
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          All detected API changes, newest first. Affected services are callers that may need to adapt.
        </p>
      </div>

      {isLoading && (
        <div className="text-center py-12" style={{ color: "var(--color-text-secondary)" }}>
          Loading…
        </div>
      )}

      {isError && (
        <div className="text-center py-12 rounded-xl border"
          style={{ color: "#b91c1c", borderColor: "#fca5a5", background: "#fff1f2" }}>
          Could not load contract changes. Is the backend running?
        </div>
      )}

      {data && data.content.length === 0 && (
        <div className="text-center py-16 rounded-xl border"
          style={{ color: "var(--color-text-secondary)", borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          No contract changes yet. Poll a service to start detecting drift.
        </div>
      )}

      {data && data.content.length > 0 && (
        <>
          <div className="flex flex-col gap-3">
            {data.content.map(event => (
              <DriftEventRow
                key={event.id}
                event={event}
                queryKey={queryKey}
                graphEdges={graphData?.edges}
                graphNodes={graphData?.nodes}
              />
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
                Page {data.pageNumber} of {totalPages} · {totalElements} total
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
