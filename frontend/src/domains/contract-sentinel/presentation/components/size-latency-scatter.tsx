import { CartesianGrid, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ResponsiveContainer } from "recharts"
import { useCorrelation } from "../hooks/use-sampler"

const CLASSIFICATION: Record<string, { label: string; color: string }> = {
  linear: { label: "Linear — healthy serialisation cost", color: "var(--color-healthy)" },
  flat: { label: "Flat — possible caching in effect", color: "var(--color-primary)" },
  exponential: { label: "Exponential — investigate N+1 pattern", color: "var(--color-breaking)" },
}

export function SizeLatencyScatter({ endpointId, enabled }: { endpointId: string; enabled: boolean }) {
  const { data, isLoading } = useCorrelation(endpointId, enabled)

  if (isLoading) return <p className="text-xs py-2" style={{ color: "var(--color-text-secondary)" }}>Loading…</p>
  if (!data) return null

  if (!data.sufficient) {
    return (
      <p className="text-xs py-2" style={{ color: "var(--color-text-secondary)" }}>
        Need ≥10 samples to plot a correlation (have {data.n}). Run more samples.
      </p>
    )
  }

  const points = data.points.map((p) => ({ x: p.sizeBytes, y: p.durationMs }))
  const cls = CLASSIFICATION[data.classification] ?? { label: data.classification, color: "var(--color-text-secondary)" }

  return (
    <div className="pt-2">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--color-background)", color: cls.color }}>
          {cls.label}
        </span>
        <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>r = {data.r?.toFixed(3)}</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart margin={{ top: 8, right: 12, bottom: 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis type="number" dataKey="x" name="size" unit="B" tick={{ fontSize: 10 }}
            stroke="var(--color-text-secondary)" label={{ value: "response size (bytes)", position: "insideBottom", offset: -8, fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name="time" unit="ms" tick={{ fontSize: 10 }} stroke="var(--color-text-secondary)" />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ fontSize: 12 }} />
          <Scatter data={points} fill="var(--color-primary)" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
