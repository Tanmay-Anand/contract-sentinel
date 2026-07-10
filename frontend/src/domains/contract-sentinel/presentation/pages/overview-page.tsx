import { useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useEventSubscription } from "../hooks/use-event-subscription"
import {
  RefreshCw, ShieldCheck, CheckCircle2, WifiOff, AlertTriangle,
  TrendingUp, Activity, Waypoints, GitCompare,
} from "lucide-react"
import { ResponsiveContainer, AreaChart, Area, Tooltip } from "recharts"
import type { DriftEventDto, SamplingResultDto, ServiceDto, TraceSummaryDto } from "../../infrastructure/api/types"
import { MethodBadge } from "../components/method-badge"
import { useServices, usePollAll } from "../hooks/use-services"
import { useLatency } from "../hooks/use-latency"
import { useTraces } from "../hooks/use-traces"
import { usePerformanceRegistry } from "../hooks/use-performance"
import { sentinelService } from "../../infrastructure/api/sentinel.service"
import { DRIFT_KEYS } from "../hooks/use-drift"

// ── Health score computation ──────────────────────────────────────────────────
function computeHealthScore(service: ServiceDto, allEvents: DriftEventDto[]): number {
  let score = 100
  score -= Math.min(service.breakingDriftCount * 20, 60)
  if (service.status === "UNREACHABLE" || service.status === "PARSE_FAILED") score -= 30
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

// ── Trace utilities (mirrored from traces-page) ───────────────────────────────
function parseRootName(rootName: string | null): { method: string; path: string } | null {
  if (!rootName) return null
  const match = rootName.match(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(.+)$/i)
  if (match) return { method: match[1].toUpperCase(), path: match[2] }
  return null
}

type LatencyRating = "fast" | "normal" | "slow" | "unknown"

function latencyRating(durationMs: number, p50Ms: number | null): LatencyRating {
  if (p50Ms == null || p50Ms === 0) return "unknown"
  if (durationMs < p50Ms) return "fast"
  if (durationMs < p50Ms * 2.5) return "normal"
  return "slow"
}

const RATING_STYLE: Record<LatencyRating, { bg: string; color: string; label: string }> = {
  fast:    { bg: "#f0fdf4", color: "#16a34a", label: "Fast" },
  normal:  { bg: "#fffbeb", color: "#d97706", label: "Normal" },
  slow:    { bg: "#fef2f2", color: "#dc2626", label: "Slow" },
  unknown: { bg: "var(--color-background)", color: "var(--color-text-secondary)", label: "—" },
}

const NOISE_PREFIXES = ["/v3/api-docs", "/swagger-ui", "/swagger-resources", "/webjars", "/scalar", "/actuator"]

function isUserTrace(t: TraceSummaryDto): boolean {
  const parsed = parseRootName(t.rootName)
  if (!parsed) return false
  return !NOISE_PREFIXES.some(p => parsed.path.startsWith(p))
}

// ── Time formatting ───────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function OverviewPage() {
  const queryClient = useQueryClient()
  const { data: services, isLoading, isError } = useServices()

  const { data: allDrift } = useQuery({
    queryKey: DRIFT_KEYS.list({ size: 500 }),
    queryFn:  () => sentinelService.drift.list({ size: 500 }),
    refetchInterval: 300_000,
    enabled: !!services,
  })

  // Live push invalidation — WebSocket events replace most polling.
  useEventSubscription("drift.detected",      () => void queryClient.invalidateQueries({ queryKey: DRIFT_KEYS.all }))
  useEventSubscription("health.changed",      () => void queryClient.invalidateQueries({ queryKey: ["services"] }))
  useEventSubscription("deployment.detected", () => void queryClient.invalidateQueries({ queryKey: ["overview-deployments"] }))

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

  const allEvents = allDrift?.content ?? []

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
        <>
          {/* Row 1 — Contract Health + Recent Traces */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <ContractHealthCard healthScores={healthScores} />
            <RecentTracesCard />
          </div>

          {/* Row 2 — Session Summary + Service Latency */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <SessionSummaryCard services={services} allEvents={allEvents} />
            <ServiceLatencyCard services={services} />
          </div>

          {/* Row 3 — Recent Contract Changes (full width) */}
          <RecentContractChangesCard allEvents={allEvents} />
        </>
      )}
    </div>
  )
}

// ── Contract Health Card ──────────────────────────────────────────────────────
function ContractHealthCard({
  healthScores,
}: {
  healthScores: { service: ServiceDto; score: number }[]
}) {
  return (
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
                <span className="text-xs font-medium truncate"
                  style={{ color: "var(--color-text-primary)", maxWidth: "75%" }}>
                  {service.name}
                </span>
                <span className="text-xs font-bold tabular-nums" style={{ color }}>
                  {score}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-border)" }}>
                <div className="h-full rounded-full"
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

      <div className="flex items-center justify-between mt-4 pt-3 border-t"
        style={{ borderColor: "var(--color-border)" }}>
        <div className="flex items-center gap-4 text-xs" style={{ color: "var(--color-text-secondary)" }}>
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
        <Link to="/catalogue" className="text-xs font-medium hover:opacity-70 transition-opacity"
          style={{ color: "var(--color-primary)" }}>
          View all →
        </Link>
      </div>
    </div>
  )
}

// ── Recent Traces Card ────────────────────────────────────────────────────────
function RecentTracesCard() {
  const queryClient = useQueryClient()
  const { data: traces } = useTraces({ sinceMinutes: 60 })
  const { data: perfRows } = usePerformanceRegistry()

  useEventSubscription("trace.received", () => void queryClient.invalidateQueries({ queryKey: ["traces"] }))

  const p50Map = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of perfRows ?? []) {
      if (r.p50Ms != null) {
        map.set(`${r.serviceName}:${r.httpMethod.toUpperCase()}:${r.path}`, r.p50Ms)
      }
    }
    return map
  }, [perfRows])

  const recent = useMemo(() => {
    return (traces ?? []).filter(isUserTrace).slice(0, 5)
  }, [traces])

  return (
    <div className="rounded-xl border p-5 flex flex-col"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Recent Traces
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
            Live real user traffic · last hour
          </p>
        </div>
        <Waypoints className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--color-text-secondary)" }} />
      </div>

      {recent.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs"
          style={{ color: "var(--color-text-secondary)" }}>
          No user traffic recorded yet
        </div>
      ) : (
        <div className="flex-1 space-y-1.5">
          {recent.map(t => {
            const parsed = parseRootName(t.rootName)
            const durationMs = t.totalDurationMicros / 1000
            const p50Key = parsed ? `${t.entryService}:${parsed.method}:${parsed.path}` : null
            const p50Ms = p50Key ? (p50Map.get(p50Key) ?? null) : null
            const rating = latencyRating(durationMs, p50Ms)
            const rs = RATING_STYLE[rating]

            return (
              <div key={t.traceId}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors"
                style={{ background: "var(--color-surface-elevated, var(--color-background))" }}>
                {parsed
                  ? <MethodBadge method={parsed.method} />
                  : <span className="text-xs font-mono" style={{ color: "var(--color-text-secondary)" }}>—</span>}
                <span className="text-xs font-mono truncate flex-1" style={{ color: "var(--color-text-primary)" }}
                  title={parsed?.path}>
                  {parsed?.path ?? t.rootName}
                </span>
                <span className="text-xs shrink-0" style={{ color: "var(--color-text-secondary)" }}>
                  {t.entryService.replace(/^crm-/, "")}
                </span>
                <span className="text-xs tabular-nums shrink-0 font-mono"
                  style={{ color: "var(--color-text-primary)" }}>
                  {durationMs < 1 ? `${durationMs.toFixed(2)}ms` : `${Math.round(durationMs)}ms`}
                </span>
                <span className="text-xs font-medium px-1.5 py-0.5 rounded shrink-0"
                  style={{ background: rs.bg, color: rs.color }}>
                  {rs.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-3 pt-3 border-t flex justify-end"
        style={{ borderColor: "var(--color-border)" }}>
        <Link to="/traces" className="text-xs font-medium hover:opacity-70 transition-opacity"
          style={{ color: "var(--color-primary)" }}>
          Traces →
        </Link>
      </div>
    </div>
  )
}

// ── Service Latency Card ──────────────────────────────────────────────────────
function ServiceLatencyCard({ services }: { services: ServiceDto[] }) {
  return (
    <div className="rounded-xl border p-5 flex flex-col"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Service Latency
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
            P95 response time per service.
          </p>
        </div>
        <Activity className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--color-text-secondary)" }} />
      </div>
      <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
        {services.map(s => <ServiceLatencyRow key={s.id} service={s} />)}
      </div>
    </div>
  )
}

// ── Per-service latency row ───────────────────────────────────────────────────
function ServiceLatencyRow({ service }: { service: ServiceDto }) {
  const unreachable = service.status === "UNREACHABLE" || service.status === "PARSE_FAILED"
  const { data: metrics } = useLatency(service.id, 30)

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
  const lineColor = unreachable ? "#ef4444" : "var(--color-primary)"
  const gradientId = `lat-grad-${service.id}`

  return (
    <div className="rounded-lg border p-3"
      style={{
        background: "var(--color-surface-elevated, var(--color-surface))",
        borderColor: "var(--color-border)",
        opacity: unreachable ? 0.6 : 1,
      }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold truncate"
          style={{ color: "var(--color-text-primary)", maxWidth: "68%" }}>
          {service.name}
        </span>
        <span className="text-xs font-semibold tabular-nums"
          style={{ color: unreachable ? "#ef4444" : "var(--color-primary)" }}>
          {unreachable ? "unreachable" : latest != null ? `${Math.round(latest)} ms` : "—"}
        </span>
      </div>

      <div style={{ height: 38 }}>
        {unreachable ? (
          <div className="flex items-center" style={{ height: "100%" }}>
            <div className="w-full" style={{ borderTop: "2px dashed #ef4444", opacity: 0.5 }} />
          </div>
        ) : series.length >= 2 ? (
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
                  const time = new Date(pt.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  return (
                    <div className="rounded-lg border px-2.5 py-1.5 text-xs shadow-lg"
                      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", zIndex: 50 }}>
                      <div className="font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                        {Math.round(pt.v)} ms
                      </div>
                      <div className="mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{time}</div>
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
    </div>
  )
}

// ── Session Summary card ──────────────────────────────────────────────────────
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
    { label: "Breaking changes",     value: breakingCount,   sub: "unacknowledged",      to: "/drift",   alert: breakingCount > 0 },
    { label: "Deployments detected", value: deploymentCount, sub: "across all services",  to: "/graph" },
    { label: "Endpoints drifted",    value: driftedCount,    sub: "unique paths changed", to: "/drift" },
    { label: "Sampler mismatches",   value: mismatchCount,   sub: "score < 80",           to: "/sampler", alert: mismatchCount > 0 },
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
              borderColor: "var(--color-border)",
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

// ── Recent Contract Changes (full-width row 3) ────────────────────────────────
function RecentContractChangesCard({ allEvents }: { allEvents: DriftEventDto[] }) {
  const recent = useMemo(() => {
    return [...allEvents]
      .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
      .slice(0, 6)
  }, [allEvents])

  return (
    <div className="rounded-xl border p-5"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Recent Contract Changes
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
            All services · newest first
          </p>
        </div>
        <div className="flex items-center gap-3">
          <GitCompare className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
          <Link to="/drift" className="text-xs font-medium hover:opacity-70 transition-opacity"
            style={{ color: "var(--color-primary)" }}>
            Contract changes →
          </Link>
        </div>
      </div>

      {recent.length === 0 ? (
        <div className="text-center py-8 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          No contract changes recorded yet
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {recent.map(event => (
            <div key={event.id}
              className="rounded-lg border p-3"
              style={{
                background: "var(--color-surface-elevated, var(--color-background))",
                borderColor: "var(--color-border)",
                borderLeftWidth: "3px",
                borderLeftColor: event.severity === "BREAKING" ? "#ef4444" : "#16a34a",
              }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-medium px-1.5 py-0.5 rounded"
                  style={{
                    background: event.severity === "BREAKING" ? "var(--color-breaking-bg, #fef2f2)" : "#f0fdf4",
                    color: event.severity === "BREAKING" ? "#dc2626" : "#16a34a",
                  }}>
                  {event.severity === "BREAKING" ? "Breaking" : "Safe"}
                </span>
                {event.httpMethod && <MethodBadge method={event.httpMethod} />}
                {event.apiPath && (
                  <code className="text-xs font-mono truncate flex-1"
                    style={{ color: "var(--color-text-primary)" }}
                    title={event.apiPath}>
                    {event.apiPath}
                  </code>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  {event.serviceName}
                </span>
                <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  {timeAgo(event.detectedAt)}
                </span>
              </div>
              {event.detail && (
                <p className="text-xs mt-1 truncate" style={{ color: "var(--color-text-secondary)" }}
                  title={event.detail}>
                  {event.detail}
                </p>
              )}
            </div>
          ))}
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
