import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { sentinelService } from "../domains/contract-sentinel/infrastructure/api/sentinel.service"
import type {
  FlywayServiceSummaryDto,
  FlywayMigrationRecordDto,
  FlywayState,
} from "../domains/contract-sentinel/infrastructure/api/types"
import { DatabaseZap, RefreshCw, AlertTriangle, CheckCircle2, Clock, FolderOpen } from "lucide-react"
import { toast } from "sonner"

export const Route = createFileRoute("/migrations")({
  component: MigrationsPage,
})

const STATE_META: Record<FlywayState, { label: string; color: string; bg: string }> = {
  SUCCESS:         { label: "Success",         color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  PENDING:         { label: "Pending",         color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  FAILED:          { label: "Failed",          color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  OUT_OF_ORDER:    { label: "Out of Order",    color: "#f97316", bg: "rgba(249,115,22,0.1)" },
  MISSING_SUCCESS: { label: "Missing",         color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
  MISSING_FAILED:  { label: "Missing (failed)",color: "#ec4899", bg: "rgba(236,72,153,0.1)" },
  BASELINE:        { label: "Baseline",        color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
  IGNORED:         { label: "Ignored",         color: "#9ca3af", bg: "rgba(156,163,175,0.1)" },
  ABOVE_TARGET:    { label: "Above Target",    color: "#64748b", bg: "rgba(100,116,139,0.1)" },
  FILESYSTEM_ONLY: { label: "Filesystem Only", color: "#0ea5e9", bg: "rgba(14,165,233,0.1)" },
  UNKNOWN:         { label: "Unknown",         color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
}

function StateBadge({ state }: { state: FlywayState }) {
  const m = STATE_META[state] ?? STATE_META.UNKNOWN
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 600,
        color: m.color,
        background: m.bg,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      {m.label}
    </span>
  )
}

function SummaryCard({
  summary,
  selected,
  onClick,
}: {
  summary: FlywayServiceSummaryDto
  selected: boolean
  onClick: () => void
}) {
  const issueCount = summary.pending + summary.failed + summary.outOfOrder + summary.filesystemOnly + summary.missingSuccess

  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "14px 16px",
        borderRadius: 10,
        border: `1.5px solid ${selected ? "var(--color-primary)" : "var(--color-border)"}`,
        background: selected ? "var(--color-primary-bg)" : "var(--color-surface)",
        cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text-primary)" }}>
          {summary.serviceName}
        </span>
        {summary.hasIssues ? (
          <AlertTriangle style={{ width: 15, height: 15, color: "#f59e0b" }} />
        ) : (
          <CheckCircle2 style={{ width: 15, height: 15, color: "#22c55e" }} />
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Pill label="Applied" value={summary.totalApplied} color="var(--color-text-secondary)" />
        {summary.pending > 0 && <Pill label="Pending" value={summary.pending} color="#f59e0b" />}
        {summary.failed > 0 && <Pill label="Failed" value={summary.failed} color="#ef4444" />}
        {summary.outOfOrder > 0 && <Pill label="OOO" value={summary.outOfOrder} color="#f97316" />}
        {summary.filesystemOnly > 0 && <Pill label="FS-only" value={summary.filesystemOnly} color="#0ea5e9" />}
        {summary.missingSuccess > 0 && <Pill label="Missing" value={summary.missingSuccess} color="#8b5cf6" />}
      </div>
      {issueCount === 0 && (
        <div style={{ marginTop: 6, fontSize: 11, color: "#22c55e" }}>All migrations applied cleanly</div>
      )}
    </button>
  )
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span style={{ fontSize: 11, color, fontVariantNumeric: "tabular-nums" }}>
      <span style={{ fontWeight: 700 }}>{value}</span>{" "}{label}
    </span>
  )
}

const STATE_FILTERS: Array<{ label: string; value: string }> = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Failed", value: "FAILED" },
  { label: "Out of Order", value: "OUT_OF_ORDER" },
  { label: "FS Only", value: "FILESYSTEM_ONLY" },
  { label: "Missing", value: "MISSING_SUCCESS" },
  { label: "Success", value: "SUCCESS" },
]

function MigrationsPage() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [stateFilter, setStateFilter] = useState("")

  const { data: summaries = [], isLoading: summaryLoading } = useQuery({
    queryKey: ["flyway-summary"],
    queryFn: () => sentinelService.flyway.summary(),
    refetchInterval: 60_000,
  })

  const { data: migrations = [], isLoading: migLoading } = useQuery({
    queryKey: ["flyway-migrations", selectedId, stateFilter],
    queryFn: () => sentinelService.flyway.migrations(selectedId!, stateFilter || undefined),
    enabled: !!selectedId,
  })

  const syncMutation = useMutation({
    mutationFn: (id: string) => sentinelService.flyway.sync(id),
    onSuccess: () => {
      toast.success("Flyway sync triggered")
      void qc.invalidateQueries({ queryKey: ["flyway-summary"] })
      void qc.invalidateQueries({ queryKey: ["flyway-migrations", selectedId] })
    },
    onError: () => toast.error("Sync failed"),
  })

  const selected = summaries.find(s => s.serviceId === selectedId) ?? null

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <DatabaseZap style={{ width: 22, height: 22, color: "var(--color-primary)" }} />
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
          Migration Tracker
        </h1>
        <span style={{
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 9999,
          background: "var(--color-primary-bg)",
          color: "var(--color-primary)",
          fontWeight: 600,
        }}>
          Flyway
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, alignItems: "start" }}>
        {/* Service list */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            Services
          </div>
          {summaryLoading ? (
            <div style={{ color: "var(--color-text-secondary)", fontSize: 13, padding: "12px 0" }}>Loadingâ€¦</div>
          ) : summaries.length === 0 ? (
            <div style={{ color: "var(--color-text-secondary)", fontSize: 13, padding: "12px 0" }}>
              No migration data yet. Wait for the next poll cycle (15 min) or trigger a sync.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {summaries.map(s => (
                <SummaryCard
                  key={s.serviceId}
                  summary={s}
                  selected={s.serviceId === selectedId}
                  onClick={() => { setSelectedId(s.serviceId); setStateFilter("") }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Migration detail */}
        <div>
          {!selected ? (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 48,
              borderRadius: 12,
              border: "1px dashed var(--color-border)",
              color: "var(--color-text-secondary)",
              gap: 10,
            }}>
              <DatabaseZap style={{ width: 32, height: 32, opacity: 0.3 }} />
              <span style={{ fontSize: 14 }}>Select a service to view migrations</span>
            </div>
          ) : (
            <>
              {/* Detail header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 16, color: "var(--color-text-primary)" }}>
                  {selected.serviceName}
                </span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
                  {STATE_FILTERS.map(f => (
                    <button
                      key={f.value}
                      onClick={() => setStateFilter(f.value)}
                      style={{
                        padding: "3px 10px",
                        borderRadius: 9999,
                        fontSize: 12,
                        fontWeight: 600,
                        border: `1px solid ${stateFilter === f.value ? "var(--color-primary)" : "var(--color-border)"}`,
                        background: stateFilter === f.value ? "var(--color-primary-bg)" : "transparent",
                        color: stateFilter === f.value ? "var(--color-primary)" : "var(--color-text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => syncMutation.mutate(selected.serviceId)}
                  disabled={syncMutation.isPending}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "5px 12px",
                    borderRadius: 7,
                    fontSize: 12,
                    fontWeight: 600,
                    border: "1px solid var(--color-border)",
                    background: "transparent",
                    color: "var(--color-text-secondary)",
                    cursor: syncMutation.isPending ? "wait" : "pointer",
                  }}
                >
                  <RefreshCw style={{ width: 13, height: 13 }} className={syncMutation.isPending ? "animate-spin" : ""} />
                  Sync now
                </button>
              </div>

              {/* FILESYSTEM_ONLY banner */}
              {selected.filesystemOnly > 0 && (
                <div style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 8,
                  marginBottom: 14,
                  background: "rgba(14,165,233,0.08)",
                  border: "1px solid rgba(14,165,233,0.25)",
                }}>
                  <FolderOpen style={{ width: 16, height: 16, color: "#0ea5e9", marginTop: 1, shrink: 0 }} />
                  <div style={{ fontSize: 13, color: "#0ea5e9" }}>
                    <strong>{selected.filesystemOnly} migration script{selected.filesystemOnly > 1 ? "s" : ""}</strong> found on disk
                    but not yet loaded by the running JVM. Restart the service to apply.
                  </div>
                </div>
              )}

              {/* Pending banner */}
              {selected.pending > 0 && (
                <div style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 8,
                  marginBottom: 14,
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.25)",
                }}>
                  <Clock style={{ width: 16, height: 16, color: "#f59e0b", marginTop: 1, shrink: 0 }} />
                  <div style={{ fontSize: 13, color: "#f59e0b" }}>
                    <strong>{selected.pending} pending migration{selected.pending > 1 ? "s" : ""}</strong> will run
                    on next service startup.
                  </div>
                </div>
              )}

              {/* Migration table */}
              {migLoading ? (
                <div style={{ color: "var(--color-text-secondary)", fontSize: 13, padding: "16px 0" }}>Loadingâ€¦</div>
              ) : migrations.length === 0 ? (
                <div style={{
                  padding: "32px 0",
                  textAlign: "center",
                  color: "var(--color-text-secondary)",
                  fontSize: 13,
                }}>
                  No migrations match this filter.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                        {["Version", "Description", "Script", "State", "Applied At", "Duration", "Source"].map(h => (
                          <th key={h} style={{
                            padding: "8px 10px",
                            textAlign: "left",
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            color: "var(--color-text-secondary)",
                            whiteSpace: "nowrap",
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {migrations.map(m => (
                        <MigrationRow key={m.id} m={m} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function MigrationRow({ m }: { m: FlywayMigrationRecordDto }) {
  const appliedAt = m.installedOn
    ? new Date(m.installedOn).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
    : "â€”"

  return (
    <tr
      style={{ borderBottom: "1px solid var(--color-border)" }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--color-background)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <td style={{ padding: "9px 10px", fontVariantNumeric: "tabular-nums", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
        {m.version ?? "â€”"}
      </td>
      <td style={{ padding: "9px 10px", color: "var(--color-text-primary)", maxWidth: 260 }}>
        {m.description ?? "â€”"}
      </td>
      <td style={{ padding: "9px 10px", fontFamily: "monospace", fontSize: 12, color: "var(--color-text-secondary)", maxWidth: 260, wordBreak: "break-all" }}>
        {m.script}
      </td>
      <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
        <StateBadge state={m.state} />
      </td>
      <td style={{ padding: "9px 10px", color: "var(--color-text-secondary)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        {appliedAt}
      </td>
      <td style={{ padding: "9px 10px", color: "var(--color-text-secondary)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        {m.executionTime != null ? `${m.executionTime} ms` : "â€”"}
      </td>
      <td style={{ padding: "9px 10px" }}>
        <span style={{
          fontSize: 11,
          padding: "2px 6px",
          borderRadius: 4,
          fontWeight: 600,
          color: m.source === "FILESYSTEM" ? "#0ea5e9" : "var(--color-text-secondary)",
          background: m.source === "FILESYSTEM" ? "rgba(14,165,233,0.1)" : "var(--color-background)",
        }}>
          {m.source}
        </span>
      </td>
    </tr>
  )
}
