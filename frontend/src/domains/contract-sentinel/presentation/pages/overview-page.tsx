import { useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCw, ShieldCheck, CheckCircle2, WifiOff, AlertTriangle, TrendingUp } from "lucide-react"
import {
  PieChart, Pie, Cell, Legend, Label, Tooltip, ResponsiveContainer,
} from "recharts"
import type { DriftEventDto, ServiceDto } from "../../infrastructure/api/types"
import { ServiceCard } from "../components/service-card"
import { useServices, usePollAll, SERVICE_KEYS } from "../hooks/use-services"
import { sentinelService } from "../../infrastructure/api/sentinel.service"
import { DRIFT_KEYS } from "../hooks/use-drift"

const STATUS_COLORS: Record<ServiceDto["status"], string> = {
  HEALTHY:      "#16a34a",
  DRIFTED:      "#f59e0b",
  UNREACHABLE:  "#ef4444",
  PARSE_FAILED: "#8b5cf6",
  UNKNOWN:      "#94a3b8",
}

const STATUS_LABELS: Record<ServiceDto["status"], string> = {
  HEALTHY:      "Healthy",
  DRIFTED:      "Drifted",
  UNREACHABLE:  "Unreachable",
  PARSE_FAILED: "Parse Failed",
  UNKNOWN:      "Unknown",
}

function DonutCenter({ viewBox, total }: { viewBox?: { cx?: number; cy?: number }; total: number }) {
  const cx = viewBox?.cx ?? 0
  const cy = viewBox?.cy ?? 0
  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" dominantBaseline="middle"
        fill="var(--color-text-primary)" fontSize={28} fontWeight={700} fontFamily="DM Sans, sans-serif">
        {total}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="middle"
        fill="var(--color-text-secondary)" fontSize={11} fontFamily="DM Sans, sans-serif">
        Services
      </text>
    </g>
  )
}

// ── Health score computation ──────────────────────────────────────────────────
// Uses only already-fetched data — no extra API calls.
// Factors:
//   Breaking changes:   -20 per unacknowledged breaking change, capped at -60
//   Status penalty:     -30 for UNREACHABLE / PARSE_FAILED
//   Safe drift:         -3 per unacknowledged safe change, capped at -15
function computeHealthScore(service: ServiceDto, allEvents: DriftEventDto[]): number {
  let score = 100

  // Breaking penalty (service DTO already aggregates this count)
  score -= Math.min(service.breakingDriftCount * 20, 60)

  // Reachability / parse penalty
  if (service.status === "UNREACHABLE" || service.status === "PARSE_FAILED") score -= 30

  // Unacknowledged safe changes for this service
  const safeCount = allEvents.filter(
    e => e.serviceId === service.id && !e.acknowledged && e.severity === "SAFE"
  ).length
  score -= Math.min(safeCount * 3, 15)

  return Math.max(0, Math.min(100, score))
}

function scoreColor(score: number): string {
  if (score >= 80) return "#16a34a"
  if (score >= 60) return "#f59e0b"
  return "#ef4444"
}

// ── Activity timeline helpers ─────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h    = Math.floor(diff / 3_600_000)
  const m    = Math.floor(diff / 60_000)
  if (h >= 48) return `${Math.floor(h / 24)}d ago`
  if (h >= 1)  return `${h}h ago`
  if (m >= 1)  return `${m}m ago`
  return "just now"
}

const CHANGE_LABELS: Record<string, string> = {
  PATH_REMOVED:                  "removed path",
  RESPONSE_FIELD_REMOVED:        "removed field",
  RESPONSE_FIELD_TYPE_CHANGED:   "changed field type",
  REQUEST_REQUIRED_FIELD_ADDED:  "added required field",
  PATH_ADDED:                    "added path",
  RESPONSE_FIELD_ADDED:          "added field",
  REQUEST_OPTIONAL_FIELD_ADDED:  "added optional field",
}

export default function OverviewPage() {
  const queryClient = useQueryClient()

  const { data: services, isLoading, isError } = useServices()

  const { data: allDrift } = useQuery({
    queryKey: DRIFT_KEYS.list({ size: 500 }),
    queryFn:  () => sentinelService.drift.list({ size: 500 }),
    refetchInterval: 60_000,
    enabled: !!services,
  })

  const { mutate: pollAll, isPending: isPolling } = usePollAll()

  const onPollAll = () => {
    pollAll(undefined, {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: DRIFT_KEYS.all }),
    })
  }

  const total       = services?.length ?? 0
  const healthy     = services?.filter(s => s.status === "HEALTHY").length ?? 0
  const unreachable = services?.filter(s => s.status === "UNREACHABLE" || s.status === "PARSE_FAILED").length ?? 0
  const breaking    = services?.reduce((acc, s) => acc + s.breakingDriftCount, 0) ?? 0

  const healthChartData = useMemo(() => {
    if (!services || services.length === 0) return []
    const counts: Partial<Record<ServiceDto["status"], number>> = {}
    services.forEach(s => { counts[s.status] = (counts[s.status] ?? 0) + 1 })
    return Object.entries(counts).map(([status, count]) => ({
      name:  STATUS_LABELS[status as ServiceDto["status"]] ?? status,
      value: count!,
      color: STATUS_COLORS[status as ServiceDto["status"]] ?? "#94a3b8",
    }))
  }, [services])

  const allEvents   = allDrift?.content ?? []

  // Option A: health scores sorted worst-first
  const healthScores = useMemo(() => {
    if (!services) return []
    return services
      .map(s => ({ service: s, score: computeHealthScore(s, allEvents) }))
      .sort((a, b) => a.score - b.score)
  }, [services, allEvents])

  // Option B: last 8 events, newest first
  const recentActivity = useMemo(() => {
    return [...allEvents]
      .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
      .slice(0, 8)
  }, [allEvents])

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold mb-0.5" style={{ color: "var(--color-text-primary)" }}>
            Service Overview
          </h1>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Live OpenAPI contract drift across all registered services.
          </p>
        </div>
        <button
          onClick={onPollAll}
          disabled={isPolling}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-70 hover:opacity-90 active:scale-95"
          style={{ background: "var(--color-primary)", color: "#fff" }}
        >
          <RefreshCw className={`w-4 h-4 ${isPolling ? "animate-spin" : ""}`} />
          Poll All
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Services" value={total}
          icon={<ShieldCheck className="w-5 h-5" style={{ color: "var(--color-primary)" }} />}
          iconBg="var(--color-primary-muted)"
          accent="var(--color-primary)" />
        <StatCard label="Healthy" value={healthy}
          icon={<CheckCircle2 className="w-5 h-5" style={{ color: "#16a34a" }} />}
          iconBg="var(--color-healthy-bg)" valueColor="#16a34a"
          accent="#16a34a" />
        <StatCard label="Unreachable" value={unreachable}
          icon={<WifiOff className="w-5 h-5" style={{ color: unreachable > 0 ? "#ef4444" : "var(--color-text-secondary)" }} />}
          iconBg={unreachable > 0 ? "var(--color-unreachable-bg)" : "var(--color-surface-muted)"}
          valueColor={unreachable > 0 ? "#ef4444" : undefined}
          accent={unreachable > 0 ? "#ef4444" : "var(--color-border)"} />
        <StatCard label="Breaking Changes" value={breaking}
          icon={<AlertTriangle className="w-5 h-5" style={{ color: breaking > 0 ? "#d97706" : "var(--color-text-secondary)" }} />}
          iconBg={breaking > 0 ? "var(--color-drifted-bg)" : "var(--color-surface-muted)"}
          valueColor={breaking > 0 ? "#d97706" : undefined}
          accent={breaking > 0 ? "#d97706" : "var(--color-border)"} />
      </div>

      {isError && (
        <div className="text-center py-10 rounded-xl border mb-6 text-sm font-medium"
          style={{ color: "var(--color-breaking)", borderColor: "var(--color-breaking-border)", background: "var(--color-breaking-bg)" }}>
          Could not reach ContractSentinel API at localhost:8090. Make sure the backend is running.
        </div>
      )}

      {isLoading && (
        <div className="text-center py-16" style={{ color: "var(--color-text-secondary)" }}>
          Loading services…
        </div>
      )}

      {services && services.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

          {/* Health distribution donut */}
          <div className="rounded-xl border p-5 flex flex-col"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
            <div className="mb-1">
              <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Health Distribution</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                Current runtime status of all monitored services.
              </p>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={60} outerRadius={82} paddingAngle={3} strokeWidth={0}
                    data={healthChartData}>
                    {healthChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    <Label
                      content={(props) => (
                        <DonutCenter viewBox={props.viewBox as { cx?: number; cy?: number }} total={total} />
                      )}
                      position="center"
                    />
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [`${value} service${value !== 1 ? "s" : ""}`, name]}
                    contentStyle={{ fontSize: 12, border: "1px solid var(--color-border)", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,.08)" }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Option A — Contract Health Score */}
          <div className="rounded-xl border p-5 flex flex-col"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Contract Health
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                  Score 0–100 per service. Worst first.
                </p>
              </div>
              <TrendingUp className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--color-text-secondary)" }} />
            </div>
            <div className="space-y-3.5 flex-1">
              {healthScores.map(({ service, score }) => {
                const color = scoreColor(score)
                return (
                  <div key={service.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium truncate" style={{ color: "var(--color-text-primary)", maxWidth: "75%" }}>
                        {service.name}
                      </span>
                      <span className="text-xs font-bold tabular-nums" style={{ color }}>
                        {score}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden"
                      style={{ background: "var(--color-border)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${score}%`,
                          background: `linear-gradient(90deg, ${color}99, ${color})`,
                          transition: "width 0.6s ease",
                        }}
                      />
                    </div>
                    {service.breakingDriftCount > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: "#ef4444" }}>
                        {service.breakingDriftCount} unacknowledged breaking change{service.breakingDriftCount > 1 ? "s" : ""}
                      </p>
                    )}
                    {service.status === "UNREACHABLE" && (
                      <p className="text-xs mt-0.5" style={{ color: "#ef4444" }}>Service unreachable</p>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-4 mt-4 pt-3 border-t text-xs"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#16a34a" }} /> 80–100 clean
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#f59e0b" }} /> 60–79 drifted
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#ef4444" }} /> &lt;60 critical
              </span>
            </div>
          </div>

          {/* Option B — Last Activity Timeline */}
          <div className="rounded-xl border p-5 flex flex-col"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
            <div className="mb-4">
              <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Recent Activity
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                Latest contract changes across all services.
              </p>
            </div>

            {recentActivity.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center"
                style={{ color: "var(--color-text-secondary)" }}>
                <div className="text-2xl">🔍</div>
                <p className="text-xs">No contract changes yet — poll services to start detecting drift.</p>
              </div>
            ) : (
              <div className="flex-1 space-y-0 overflow-hidden">
                {recentActivity.map((event, i) => {
                  const isBreaking = event.severity === "BREAKING"
                  const isLast = i === recentActivity.length - 1
                  return (
                    <div key={event.id}
                      className="flex items-start gap-2.5 py-2"
                      style={{ borderBottom: isLast ? "none" : "1px solid var(--color-border)" }}>

                      {/* Severity dot with connecting line */}
                      <div className="flex flex-col items-center shrink-0" style={{ marginTop: 2 }}>
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: isBreaking ? "#ef4444" : "#16a34a" }}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
                            {event.serviceName}
                          </span>
                          <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                            {CHANGE_LABELS[event.changeType] ?? event.changeType.toLowerCase().replace(/_/g, " ")}
                          </span>
                        </div>
                        {event.apiPath && (
                          <div className="flex items-center gap-1 mt-0.5">
                            {event.httpMethod && (
                              <span className="text-xs font-bold font-mono"
                                style={{ color: isBreaking ? "#ef4444" : "#16a34a" }}>
                                {event.httpMethod}
                              </span>
                            )}
                            <span className="text-xs font-mono truncate"
                              style={{ color: "var(--color-text-secondary)" }}>
                              {event.apiPath}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end shrink-0 gap-1">
                        <span className="text-xs tabular-nums" style={{ color: "var(--color-text-secondary)" }}>
                          {relativeTime(event.detectedAt)}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                          style={{
                            background: isBreaking ? "#fef2f2" : "#f0fdf4",
                            color: isBreaking ? "#dc2626" : "#16a34a",
                          }}>
                          {isBreaking ? "breaking" : "safe"}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Service cards */}
      {services && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map(s => <ServiceCard key={s.id} service={s} />)}
        </div>
      )}
    </div>
  )
}

// ── Small reusable pieces ─────────────────────────────────────────────────────

function StatCard({ label, value, icon, iconBg, valueColor, accent }: {
  label: string; value: number; icon: React.ReactNode
  iconBg: string; valueColor?: string; accent?: string
}) {
  return (
    <div className="rounded-xl border overflow-hidden flex transition-shadow hover:shadow-sm"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      <div className="w-1 shrink-0" style={{ background: accent ?? "var(--color-border)" }} />
      <div className="flex items-center gap-3.5 p-4 flex-1">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: iconBg }}>
          {icon}
        </div>
        <div>
          <p className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-secondary)" }}>{label}</p>
          <p className="text-2xl font-bold leading-none" style={{ color: valueColor ?? "var(--color-text-primary)" }}>{value}</p>
        </div>
      </div>
    </div>
  )
}
