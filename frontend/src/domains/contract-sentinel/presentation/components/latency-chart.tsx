import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import type { LatencyMetricDto } from "../../infrastructure/api/types"

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

interface LatencyChartProps {
  data: LatencyMetricDto[]
  serviceId: string
}

export function LatencyChart({ data }: LatencyChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center py-10 rounded-lg border text-sm"
        style={{ color: "var(--color-text-secondary)", borderColor: "var(--color-border)" }}
      >
        No latency data yet.
      </div>
    )
  }

  const hasP95 = data.some(d => d.p95Ms !== null)

  const chartData = [...data]
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
    .map(d => ({
      time: formatTime(d.recordedAt),
      specFetchMs: d.specFetchMs,
      p95Ms: d.p95Ms,
    }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorSpec" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#399b86" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#399b86" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorP95" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#d97706" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="time" tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} />
        <YAxis tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} unit="ms" />
        <Tooltip
          contentStyle={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey="specFetchMs"
          name="Spec Fetch (ms)"
          stroke="#399b86"
          fill="url(#colorSpec)"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
        {hasP95 && (
          <Area
            type="monotone"
            dataKey="p95Ms"
            name="p95 (ms)"
            stroke="#d97706"
            fill="url(#colorP95)"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  )
}
