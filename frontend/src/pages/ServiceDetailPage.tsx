import { useState } from "react"
import { useParams, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Clock } from "lucide-react"
import { sentinelApi } from "@/api/client"
import { StatusBadge } from "@/components/StatusBadge"
import { DriftEventRow } from "@/components/DriftEventRow"

export default function ServiceDetailPage() {
  const { serviceId } = useParams({ from: "/services/$serviceId" })
  const [driftPage, setDriftPage] = useState(0)

  const { data: service } = useQuery({
    queryKey: ["services", serviceId],
    queryFn: () => sentinelApi.services.get(serviceId),
    refetchInterval: 30_000,
  })

  const { data: snapshots } = useQuery({
    queryKey: ["snapshots", serviceId],
    queryFn: () => sentinelApi.snapshots.list(serviceId, 0, 8),
    enabled: !!serviceId,
  })

  const driftQueryKey = ["drift", serviceId, driftPage]
  const { data: drift } = useQuery({
    queryKey: driftQueryKey,
    queryFn: () => sentinelApi.drift.list({ serviceId, page: driftPage, size: 15 }),
    enabled: !!serviceId,
    refetchInterval: 30_000,
  })

  const totalPages = drift?.page?.totalPages ?? 0

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm mb-5"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Overview
      </Link>

      {service && (
        <div
          className="rounded-xl border p-5 mb-6"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold">{service.name}</h1>
              <code className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                {service.baseUrl}{service.specPath}
              </code>
            </div>
            <StatusBadge status={service.status} />
          </div>
          <div className="flex gap-6 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            <span>
              <strong style={{ color: "var(--color-breaking)" }}>{service.breakingDriftCount}</strong> breaking unacknowledged
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Snapshot timeline */}
        <div
          className="rounded-xl border p-4 lg:col-span-1 h-fit"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            Recent Snapshots
          </h2>
          {!snapshots || snapshots.content.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>No snapshots yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {snapshots.content.map((snap, i) => (
                <div
                  key={snap.id}
                  className="text-xs p-2 rounded-lg border"
                  style={{
                    borderColor: "var(--color-border)",
                    background: i === 0 ? "var(--color-healthy-bg)" : "var(--color-surface-muted)",
                  }}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span
                      className="font-medium"
                      style={{
                        color: snap.fetchStatus === "FETCHED"
                          ? "var(--color-healthy)"
                          : snap.fetchStatus === "PARSE_FAILED"
                            ? "var(--color-parse-failed)"
                            : "var(--color-unreachable)",
                      }}
                    >
                      {snap.fetchStatus}
                    </span>
                    {i === 0 && (
                      <span
                        className="px-1.5 py-0.5 rounded text-xs"
                        style={{ background: "var(--color-primary-muted)", color: "var(--color-primary)" }}
                      >
                        Latest
                      </span>
                    )}
                  </div>
                  <p style={{ color: "var(--color-text-secondary)" }}>
                    {new Date(snap.fetchedAt).toLocaleString()}
                  </p>
                  <p
                    className="font-mono truncate mt-0.5"
                    style={{ color: "var(--color-text-secondary)" }}
                    title={snap.specHash}
                  >
                    {snap.specHash.slice(0, 12)}…
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Drift events */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold mb-3">Drift Events</h2>
          {!drift || drift.content.length === 0 ? (
            <div
              className="rounded-xl border p-8 text-center text-sm"
              style={{ color: "var(--color-text-secondary)", borderColor: "var(--color-border)" }}
            >
              No drift events detected for this service yet.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {drift.content.map(event => (
                <DriftEventRow key={event.id} event={event} queryKey={driftQueryKey} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setDriftPage(p => Math.max(0, p - 1))}
                disabled={driftPage === 0}
                className="px-3 py-1.5 rounded border text-sm disabled:opacity-40"
                style={{ borderColor: "var(--color-border)" }}
              >
                Previous
              </button>
              <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                {driftPage + 1} / {totalPages}
              </span>
              <button
                onClick={() => setDriftPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={driftPage >= totalPages - 1}
                className="px-3 py-1.5 rounded border text-sm disabled:opacity-40"
                style={{ borderColor: "var(--color-border)" }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
