import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { SlideOver } from "./slide-over"
import { usePerformanceHistory } from "../hooks/use-performance"

interface Props {
  serviceId: string
  serviceName: string
  method: string
  path: string
  open: boolean
  onClose: () => void
}

export function EndpointDetailPanel({ serviceId, serviceName, method, path, open, onClose }: Props) {
  const { data } = usePerformanceHistory(open ? serviceId : "", method, path)

  const series = (data?.points ?? []).map((p) => ({
    t: new Date(p.recordedAt).toLocaleString(),
    p50: p.p50Ms, p95: p.p95Ms, p99: p.p99Ms,
    errors: p.errorCount,
  }))

  return (
    <SlideOver open={open} title={`${method} ${path}`} subtitle={serviceName} onClose={onClose} width={560}>
      {series.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>No history recorded yet.</p>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>Latency (ms) — 7 days</p>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="p95grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d97706" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#d97706" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="t" tick={false} stroke="var(--color-border)" />
                <YAxis tick={{ fontSize: 10 }} stroke="var(--color-text-secondary)" />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="p95" stroke="#d97706" fill="url(#p95grad)" connectNulls name="p95" />
                <Area type="monotone" dataKey="p50" stroke="#399b86" fill="none" connectNulls name="p50" />
                <Area type="monotone" dataKey="p99" stroke="#e44d4d" fill="none" connectNulls name="p99" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>Errors per sample</p>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="t" tick={false} stroke="var(--color-border)" />
                <YAxis tick={{ fontSize: 10 }} stroke="var(--color-text-secondary)" allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="errors" stroke="#e44d4d" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </SlideOver>
  )
}
