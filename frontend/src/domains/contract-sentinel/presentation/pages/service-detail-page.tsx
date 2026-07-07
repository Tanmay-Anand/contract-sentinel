import { useState } from "react"
import { useParams, Link } from "@tanstack/react-router"
import { ArrowLeft, Clock, Zap, GitCommit, FileText } from "lucide-react"
import { StatusBadge } from "../components/status-badge"
import { DriftEventRow } from "../components/drift-event-row"
import { LatencyChart } from "../components/latency-chart"
import { DeploymentMarker } from "../components/deployment-marker"
import { SpecDiffViewer } from "../components/spec-diff-viewer"
import { useService } from "../hooks/use-services"
import { useDriftEvents, DRIFT_KEYS } from "../hooks/use-drift"
import { useSnapshots } from "../hooks/use-snapshots"
import { useLatency } from "../hooks/use-latency"
import { useDeployments } from "../hooks/use-deployments"
import { useSpecDiff } from "../hooks/use-diff"
import { useHeaviestEndpoints } from "../hooks/use-sampler"
import { formatBytes } from "../components/sampling-result-card"

export default function ServiceDetailPage() {
  const { serviceId } = useParams({ from: "/services/$serviceId" })
  const [driftPage, setDriftPage] = useState(0)
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null)

  const { data: service }   = useService(serviceId)
  const { data: snapshots } = useSnapshots(serviceId, 0, 8)

  const driftParams   = { serviceId, page: driftPage, size: 15 }
  const driftQueryKey = DRIFT_KEYS.list(driftParams)
  const { data: drift } = useDriftEvents(driftParams)

  const { data: latency }     = useLatency(serviceId)
  const { data: deployments } = useDeployments(serviceId, 0)
  const { data: diff }        = useSpecDiff(selectedSnapshotId)
  const { data: heaviest }    = useHeaviestEndpoints(serviceId)

  const totalPages = drift?.totalPages ?? 0

  return (
    <div className="max-w-4xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm mb-5"
        style={{ color: "var(--color-text-secondary)" }}>
        <ArrowLeft className="w-4 h-4" />
        Back to Overview
      </Link>

      {service && (
        <div className="rounded-xl border p-5 mb-6"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
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
        <div className="rounded-xl border p-4 lg:col-span-1 h-fit"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            Recent Snapshots
          </h2>
          {!snapshots || snapshots.content.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>No snapshots yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {snapshots.content.map((snap, i) => (
                <div key={snap.id} className="text-xs p-2 rounded-lg border"
                  style={{ borderColor: "var(--color-border)", background: i === 0 ? "var(--color-healthy-bg)" : "#f8fafc" }}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-medium" style={{
                      color: snap.fetchStatus === "FETCHED" ? "var(--color-healthy)"
                           : snap.fetchStatus === "PARSE_FAILED" ? "var(--color-parse-failed)"
                           : "var(--color-unreachable)",
                    }}>
                      {snap.fetchStatus}
                    </span>
                    <div className="flex items-center gap-1">
                      {i === 0 && (
                        <span className="px-1.5 py-0.5 rounded text-xs"
                          style={{ background: "var(--color-healthy-bg)", color: "#15803d" }}>
                          Latest
                        </span>
                      )}
                      <button
                        onClick={() =>
                          setSelectedSnapshotId(prev => prev === snap.id ? null : snap.id)
                        }
                        className="px-1.5 py-0.5 rounded text-xs border"
                        style={{
                          borderColor: "var(--color-border)",
                          color: selectedSnapshotId === snap.id ? "var(--color-primary)" : "var(--color-text-secondary)",
                          background: selectedSnapshotId === snap.id ? "var(--color-healthy-bg)" : "transparent",
                        }}
                      >
                        {selectedSnapshotId === snap.id ? "Hide diff" : "View diff"}
                      </button>
                    </div>
                  </div>
                  <p style={{ color: "var(--color-text-secondary)" }}>
                    {new Date(snap.fetchedAt).toLocaleString()}
                  </p>
                  <p className="font-mono truncate mt-0.5" style={{ color: "var(--color-text-secondary)" }}
                    title={snap.specHash}>
                    {snap.specHash.slice(0, 12)}…
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Spec diff viewer */}
          {selectedSnapshotId && (
            <div className="rounded-xl border p-4"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                Spec Diff
              </h2>
              {diff ? (
                <SpecDiffViewer diff={diff} />
              ) : (
                <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Loading diff…</p>
              )}
            </div>
          )}

          {/* Drift events */}
          <div>
            <h2 className="text-sm font-semibold mb-3">Drift Events</h2>
            {!drift || drift.content.length === 0 ? (
              <div className="rounded-xl border p-8 text-center text-sm"
                style={{ color: "var(--color-text-secondary)", borderColor: "var(--color-border)" }}>
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
                <button onClick={() => setDriftPage(p => Math.max(0, p - 1))} disabled={driftPage === 0}
                  className="px-3 py-1.5 rounded border text-sm disabled:opacity-40"
                  style={{ borderColor: "var(--color-border)" }}>
                  Previous
                </button>
                <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  {drift?.pageNumber ?? 1} / {totalPages}
                </span>
                <button onClick={() => setDriftPage(p => Math.min(totalPages - 1, p + 1))} disabled={driftPage >= totalPages - 1}
                  className="px-3 py-1.5 rounded border text-sm disabled:opacity-40"
                  style={{ borderColor: "var(--color-border)" }}>
                  Next
                </button>
              </div>
            )}
          </div>

          {/* Top 5 heaviest endpoints */}
          {heaviest && heaviest.length > 0 && (
            <div className="rounded-xl border p-4"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
                Top {heaviest.length} Heaviest Endpoints
              </h2>
              <div className="space-y-2">
                {heaviest.map((ep, i) => {
                  const budget = ep.path.trimEnd().endsWith('}') ? 50 * 1024 : 100 * 1024
                  const over = ep.responseSizeBytes > budget
                  const pct = Math.min(100, Math.round((ep.responseSizeBytes / budget) * 100))
                  return (
                    <div key={`${ep.httpMethod}:${ep.path}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono font-bold w-3 text-right"
                          style={{ color: "var(--color-text-secondary)" }}>
                          {i + 1}
                        </span>
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded"
                          style={{ background: "var(--color-background)", color: "var(--color-text-secondary)" }}>
                          {ep.httpMethod}
                        </span>
                        <code className="text-xs flex-1 truncate" style={{ color: "var(--color-text-primary)" }}>
                          {ep.path}
                        </code>
                        <span className="text-xs font-mono"
                          style={{ color: over ? "var(--color-breaking)" : "var(--color-text-secondary)", flexShrink: 0 }}>
                          {over && "⚠ "}{formatBytes(ep.responseSizeBytes)}
                        </span>
                      </div>
                      <div className="h-1 rounded-full ml-5" style={{ background: "var(--color-border)" }}>
                        <div className="h-1 rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: over ? "var(--color-breaking)" : "var(--color-primary)",
                          }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs mt-3" style={{ color: "var(--color-text-secondary)" }}>
                Budget: 100 KB (list) · 50 KB (single resource)
              </p>
            </div>
          )}

          {/* Latency chart */}
          <div className="rounded-xl border p-4"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <Zap className="w-4 h-4" />
              Latency
            </h2>
            <LatencyChart data={latency ?? []} serviceId={serviceId} />
          </div>

          {/* Deployments */}
          <div className="rounded-xl border p-4"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <GitCommit className="w-4 h-4" />
              Deployments
            </h2>
            {!deployments || deployments.content.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                No deployments recorded yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {deployments.content.map(dep => (
                  <DeploymentMarker key={dep.id} deployment={dep} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
