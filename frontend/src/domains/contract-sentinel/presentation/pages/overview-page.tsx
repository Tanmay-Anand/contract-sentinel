import { useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { RefreshCw, ShieldCheck, CheckCircle2, WifiOff, AlertTriangle, TrendingUp, Activity } from "lucide-react"
import {
  PieChart, Pie, Cell, Legend, Label, Tooltip, ResponsiveContainer, AreaChart, Area,
} from "recharts"
import type { DriftEventDto, SamplingResultDto, ServiceDto } from "../../infrastructure/api/types"
import { ServiceCard } from "../components/service-card"
import { MethodBadge } from "../components/method-badge"
import { useServices, usePollAll } from "../hooks/use-services"
import { useLatency } from "../hooks/use-latency"
import { usePerformanceRegistry } from "../hooks/use-performance"
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
      <text x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="middle"
        fill="var(--color-text-primary)" fontSize={20} fontWeight={700} fontFamily="DM Sans, sans-serif">
        {total}
      </text>
      <text x={cx} y={cy + 9} textAnchor="middle" dominantBaseline="middle"
        fill="var(--color-text-secondary)" fontSize={9} fontFamily="DM Sans, sans-serif">
        Services
      </text>
    </g>
  )
}

// â”€â”€ Health score computation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Uses only already-fetched data â€” no extra API calls.
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
          Loading servicesâ€¦
        </div>
      )}

      {services && services.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">

          {/* Box 1 â€” compact Health Distribution donut */}
          <div className="rounded-xl border p-4"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
            <div className="mb-2">
              <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Health Distribution</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                Current runtime status of all monitored services.
              </p>
            </div>
            <ResponsiveContainer width="100%" height={148}>
              <PieChart>
                <Pie dataKey="value" nameKey="name" cx="50%" cy="50%"
                  innerRadius={38} outerRadius={56} paddingAngle={3} strokeWidth={0}
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
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-xs text-center mt-1" style={{ color: "var(--color-text-secondary)" }}>
              {healthy} of {total} service{total !== 1 ? "s" : ""} healthy
            </p>
          </div>

          {/* Box 2 â€” Session Summary 2Ã—2 grid */}
          <SessionSummaryCard services={services} allEvents={allEvents} />

          {/* Box 3 â€” Contract Health Score */}
          <div className="rounded-xl border p-5 flex flex-col"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Contract Health
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                  Score 0â€“100 per service. Worst first.
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
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#16a34a" }} /> 80â€“100 clean
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#f59e0b" }} /> 60â€“79 drifted
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#ef4444" }} /> &lt;60 critical
              </span>
            </div>
          </div>

          {/* Box 4 â€” Service Latency */}
          <div className="rounded-xl border p-5 flex flex-col"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Service Latency
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                  Recent response latency and last active endpoint per service.
                </p>
              </div>
              <Activity className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--color-text-secondary)" }} />
            </div>
            <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
              {(services ?? []).map(s => <ServiceLatencyRow key={s.id} service={s} />)}
            </div>
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

// â”€â”€ Per-service latency row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ServiceLatencyRow({ service }: { service: ServiceDto }) {
  const unreachable = service.status === "UNREACHABLE" || service.status === "PARSE_FAILED"
  const { data: metrics } = useLatency(service.id, 30)
  const { data: perfRows } = usePerformanceRegistry({ serviceId: service.id })

  // Latency time series (newest-first from the API â†’ reverse to chronological).
  // Prefer real percentiles; fall back to spec-fetch time, which is always recorded.
  const series = useMemo(() => {
    return [...(metrics ?? [])]
      .map(m => ({
        v: m.p95Ms ?? m.p50Ms ?? m.specFetchMs ?? null,
        t: m.recordedAt,
      }))
      .filter((p): p is { v: number; t: string } => p.v != null)
      .reverse()
  }, [metrics])

  const latest = series.length ? series[series.length - 1].v : null

  // "Last active endpoint" = the endpoint with the most requests since the last poll.
  const lastEndpoint = useMemo(() => {
    const rows = perfRows ?? []
    if (rows.length === 0) return null
    return [...rows].sort((a, b) => b.countDelta - a.countDelta)[0] ?? null
  }, [perfRows])

  const lineColor = unreachable ? "#ef4444" : "var(--color-primary)"
  const gradientId = `lat-grad-${service.id}`

  return (
    <div className="rounded-lg border p-3"
      style={{ background: "var(--color-surface-elevated, var(--color-surface))", borderColor: "var(--color-border)" }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold truncate" style={{ color: "var(--color-text-primary)", maxWidth: "68%" }}>
          {service.name}
        </span>
        <span className="text-xs font-semibold tabular-nums"
          style={{ color: unreachable ? "#ef4444" : "var(--color-primary)" }}>
          {unreachable ? "unreachable" : latest != null ? `${Math.round(latest)} ms` : "â€”"}
        </span>
      </div>

      <div style={{ height: 38 }}>
        {series.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const pt = payload[0].payload as { v: number; t: string }
                  const ms = Math.round(pt.v)
                  const time = new Date(pt.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  return (
                    <div className="rounded-lg border px-2.5 py-1.5 text-xs shadow-lg"
                      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", zIndex: 50 }}>
                      <div className="font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                        {ms} ms
                      </div>
                      <div className="mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{time}</div>
                      {lastEndpoint && (
                        <div className="mt-1 flex items-center gap-1 max-w-[180px]">
                          <MethodBadge method={lastEndpoint.httpMethod} />
                          <span className="truncate" style={{ color: "var(--color-text-secondary)" }}
                            title={lastEndpoint.path}>
                            {lastEndpoint.path}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                }}
                cursor={{ stroke: lineColor, strokeWidth: 1, strokeDasharray: "3 3" }}
              />
              <Area type="monotone" dataKey="v" stroke={lineColor} strokeWidth={1.5}
                fill={`url(#${gradientId})`} isAnimationActive={false} dot={false} activeDot={{ r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-xs h-full flex items-center" style={{ color: "var(--color-text-secondary)" }}>
            No latency data yet
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-1.5">
        {lastEndpoint ? (
          <>
            <MethodBadge method={lastEndpoint.httpMethod} />
            <code className="text-xs truncate" style={{ color: "var(--color-text-secondary)" }} title={lastEndpoint.path}>
              {lastEndpoint.path}
            </code>
          </>
        ) : (
          <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>No recent calls</span>
        )}
      </div>
    </div>
  )
}

// â”€â”€ Session Summary card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SessionSummaryCard({ services, allEvents }: { services: ServiceDto[]; allEvents: DriftEventDto[] }) {
  const breakingCount = allEvents.filter(e => e.severity === "BREAKING").length
  const driftedCount  = new Set(
    allEvents.filter(e => e.apiPath).map(e => `${e.httpMethod ?? ""} ${e.apiPath}`)
  ).size

  const { data: deploymentCount = 0 } = useQuery({
    queryKey: ["overview-deployments", services.map(s => s.id).join(",")],
    queryFn: async () => {
      const pages = await Promise.all(
        services.map(s => sentinelService.deployments.list(s.id, 0, 100).catch(() => ({ content: [] })))
      )
      return pages.reduce((sum, p) => sum + (p.content?.length ?? 0), 0)
    },
    enabled: services.length > 0,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const { data: samplerEndpoints = [] } = useQuery({
    queryKey: ["overview-sampler"],
    queryFn: () => sentinelService.sampler.list(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const sampledIds = samplerEndpoints.filter(e => e.lastSampledAt).map(e => e.id)

  const { data: mismatchCount = 0 } = useQuery({
    queryKey: ["overview-sampler-mismatches", sampledIds.join(",")],
    queryFn: async () => {
      const pages = await Promise.all(
        sampledIds.map(id =>
          sentinelService.sampler.results(id, 0).catch(() => ({ content: [] as SamplingResultDto[] }))
        )
      )
      return pages.flatMap(p => p.content ?? []).filter(r => r.matchScore < 80).length
    },
    enabled: sampledIds.length > 0,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const cells: { label: string; value: number; sub: string; to: string; alert?: boolean }[] = [
    { label: "Breaking changes",     value: breakingCount,   sub: "unacknowledged",      to: "/drift",        alert: breakingCount > 0 },
    { label: "Deployments detected", value: deploymentCount, sub: "across all services",  to: "/graph" },
    { label: "Endpoints drifted",    value: driftedCount,    sub: "unique paths changed", to: "/drift" },
    { label: "Sampler mismatches",   value: mismatchCount,   sub: "score < 80",           to: "/sampler",     alert: mismatchCount > 0 },
  ]

  return (
    <div className="rounded-xl border p-4"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      <div className="mb-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Session Summary</h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
          What's happened since ContractSentinel started.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {cells.map(cell => (
          <Link key={cell.label} to={cell.to}
            className="rounded-lg border p-3 block transition-opacity hover:opacity-75"
            style={{
              borderColor: cell.alert ? "color-mix(in srgb, currentColor 20%, var(--color-border))" : "var(--color-border)",
              background: "var(--color-surface-elevated, var(--color-surface))",
              textDecoration: "none",
              borderLeftWidth: "3px",
              borderLeftColor: cell.alert && cell.label === "Breaking changes"
                ? "#ef4444"
                : cell.alert ? "#f59e0b"
                : "var(--color-border)",
            }}>
            <div className="text-2xl font-bold tabular-nums leading-none"
              style={{ color: cell.alert && cell.label === "Breaking changes" ? "#ef4444" : cell.alert ? "#f59e0b" : "var(--color-text-primary)" }}>
              {cell.value}
            </div>
            <div className="text-xs font-medium mt-1.5" style={{ color: "var(--color-text-primary)" }}>
              {cell.label}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
              {cell.sub}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

// â”€â”€ Small reusable pieces â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
