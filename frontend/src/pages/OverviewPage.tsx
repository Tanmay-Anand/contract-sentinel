import { useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  RefreshCw, ShieldCheck, CheckCircle2, WifiOff, AlertTriangle,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, Label,
} from "recharts"
import { sentinelApi } from "@/api/client"
import { ServiceCard } from "@/components/ServiceCard"
import type { ServiceDto } from "@/api/types"

// Each status gets a unique, semantically-meaningful color
const STATUS_COLORS: Record<ServiceDto["status"], string> = {
  HEALTHY:      "#16a34a",  // green
  DRIFTED:      "#f59e0b",  // amber — reachable but changed
  UNREACHABLE:  "#ef4444",  // red — cannot connect
  PARSE_FAILED: "#8b5cf6",  // violet — spec malformed
  UNKNOWN:      "#94a3b8",  // slate — no data yet
}

const STATUS_LABELS: Record<ServiceDto["status"], string> = {
  HEALTHY:      "Healthy",
  DRIFTED:      "Drifted",
  UNREACHABLE:  "Unreachable",
  PARSE_FAILED: "Parse Failed",
  UNKNOWN:      "Unknown",
}

function shortName(name: string) {
  return name
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function DonutCenter({ viewBox, total }: { viewBox?: { cx?: number; cy?: number }; total: number }) {
  const cx = viewBox?.cx ?? 0
  const cy = viewBox?.cy ?? 0
  return (
    <g>
      <text
        x={cx} y={cy - 7}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--color-text-primary)"
        fontSize={26}
        fontWeight={700}
        fontFamily="Inter, sans-serif"
      >
        {total}
      </text>
      <text
        x={cx} y={cy + 13}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--color-text-secondary)"
        fontSize={11}
        fontFamily="Inter, sans-serif"
      >
        Services
      </text>
    </g>
  )
}

export default function OverviewPage() {
  const queryClient = useQueryClient()

  const { data: services, isLoading, isError } = useQuery({
    queryKey: ["services"],
    queryFn: sentinelApi.services.list,
    refetchInterval: 60_000,
  })

  const { data: allDrift } = useQuery({
    queryKey: ["drift-chart"],
    queryFn: () => sentinelApi.drift.list({ size: 200 }),
    refetchInterval: 60_000,
    enabled: !!services,
  })

  const { mutate: pollAll, isPending: isPolling } = useMutation({
    mutationFn: sentinelApi.poll.all,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["services"] })
      void queryClient.invalidateQueries({ queryKey: ["drift-chart"] })
    },
  })

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

  const driftChartData = useMemo(() => {
    if (!services) return []
    return services.map(s => {
      const events = allDrift?.content.filter(d => d.serviceId === s.id) ?? []
      return {
        name:     shortName(s.name),
        breaking: events.filter(d => d.severity === "BREAKING").length,
        safe:     events.filter(d => d.severity === "SAFE").length,
      }
    })
  }, [services, allDrift])

  const hasDriftData = driftChartData.some(d => d.breaking > 0 || d.safe > 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold mb-1">Service Overview</h1>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Live OpenAPI contract drift across all registered services.
          </p>
        </div>
        <button
          onClick={() => pollAll()}
          disabled={isPolling}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-70"
          style={{ background: "var(--color-primary)", color: "#fff" }}
        >
          <RefreshCw className={`w-4 h-4 ${isPolling ? "animate-spin" : ""}`} />
          Poll All
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Services"
          value={total}
          icon={<ShieldCheck className="w-5 h-5" style={{ color: "var(--color-primary)" }} />}
          iconBg="var(--color-primary-muted)"
        />
        <StatCard
          label="Healthy"
          value={healthy}
          icon={<CheckCircle2 className="w-5 h-5" style={{ color: "#16a34a" }} />}
          iconBg="var(--color-healthy-bg)"
          valueColor="#16a34a"
          border={healthy > 0 ? "var(--color-healthy-border)" : undefined}
        />
        <StatCard
          label="Unreachable"
          value={unreachable}
          icon={<WifiOff className="w-5 h-5" style={{ color: "#ef4444" }} />}
          iconBg="var(--color-unreachable-bg)"
          valueColor={unreachable > 0 ? "#ef4444" : undefined}
          border={unreachable > 0 ? "var(--color-unreachable-border)" : undefined}
        />
        <StatCard
          label="Breaking Changes"
          value={breaking}
          icon={<AlertTriangle className="w-5 h-5" style={{ color: breaking > 0 ? "#d97706" : "var(--color-text-secondary)" }} />}
          iconBg={breaking > 0 ? "var(--color-drifted-bg)" : "var(--color-surface-muted)"}
          valueColor={breaking > 0 ? "#d97706" : undefined}
          border={breaking > 0 ? "var(--color-drifted-border)" : undefined}
        />
      </div>

      {isError && (
        <div
          className="text-center py-12 rounded-xl border mb-6"
          style={{
            color: "var(--color-breaking)",
            borderColor: "var(--color-breaking-border)",
            background: "var(--color-breaking-bg)",
          }}
        >
          Could not reach ContractSentinel API. Check that the backend is running and VITE_SENTINEL_API_URL is set correctly.
        </div>
      )}

      {isLoading && (
        <div className="text-center py-12" style={{ color: "var(--color-text-secondary)" }}>
          Loading services…
        </div>
      )}

      {/* Charts */}
      {services && services.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
          <div
            className="rounded-xl border p-5 lg:col-span-2"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
          >
            <h2 className="text-sm font-semibold mb-1">Health Distribution</h2>
            <p className="text-xs mb-3" style={{ color: "var(--color-text-secondary)" }}>
              Current status of all monitored services.
            </p>
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie
                  data={healthChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={76}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {healthChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                  <Label
                    content={(props) => (
                      <DonutCenter viewBox={props.viewBox as { cx?: number; cy?: number }} total={total} />
                    )}
                    position="center"
                  />
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [`${value} service${value !== 1 ? "s" : ""}`, name]}
                  contentStyle={{
                    fontSize: 12,
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    boxShadow: "0 2px 8px rgba(0,0,0,.06)",
                  }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div
            className="rounded-xl border p-5 lg:col-span-3"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
          >
            <h2 className="text-sm font-semibold mb-1">Drift Events by Service</h2>
            <p className="text-xs mb-4" style={{ color: "var(--color-text-secondary)" }}>
              {hasDriftData
                ? "Cumulative breaking and safe changes detected since monitoring began."
                : "No drift events yet — poll services to start detecting changes."}
            </p>
            <ResponsiveContainer width="100%" height={165}>
              <BarChart data={driftChartData} barCategoryGap="35%" margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  contentStyle={{
                    fontSize: 12,
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    boxShadow: "0 2px 8px rgba(0,0,0,.06)",
                  }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="breaking" name="Breaking" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Bar dataKey="safe"     name="Safe"     fill="#16a34a" radius={[3, 3, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Service cards */}
      {services && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
          {services.map(s => (
            <ServiceCard key={s.id} service={s} />
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({
  label, value, icon, iconBg, valueColor, border,
}: {
  label: string
  value: number
  icon: React.ReactNode
  iconBg: string
  valueColor?: string
  border?: string
}) {
  return (
    <div
      className="rounded-xl border p-4 flex items-center gap-3.5 transition-shadow hover:shadow-sm"
      style={{ background: "var(--color-surface)", borderColor: border ?? "var(--color-border)" }}
    >
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: iconBg }}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-secondary)" }}>{label}</p>
        <p className="text-2xl font-bold leading-none" style={{ color: valueColor ?? "var(--color-text-primary)" }}>
          {value}
        </p>
      </div>
    </div>
  )
}
