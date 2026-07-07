import { useState } from "react"
import { AlertCircle } from "lucide-react"
import { useTraces, useTrace } from "../hooks/use-traces"
import { useServices } from "../hooks/use-services"
import { SlideOver } from "../components/slide-over"
import { TraceWaterfall } from "../components/trace-waterfall"

function fmtMs(micros: number) {
  return `${(micros / 1000).toFixed(1)} ms`
}

export default function TracesPage() {
  const [serviceName, setServiceName] = useState("")
  const [minDurationMs, setMinDurationMs] = useState<number | "">("")
  const [selected, setSelected] = useState<string | null>(null)

  const { data: services } = useServices()
  const { data: traces, isLoading } = useTraces({
    serviceName: serviceName || undefined,
    minDurationMs: minDurationMs === "" ? undefined : Number(minDurationMs),
  })
  const { data: trace } = useTrace(selected)

  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--color-border)", borderRadius: 8, padding: "7px 12px",
    fontSize: 13, background: "var(--color-surface)", color: "var(--color-text-primary)", outline: "none",
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Request Traces</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
          Distributed traces collected from the services. Click a trace to see where the time went.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select value={serviceName} onChange={(e) => setServiceName(e.target.value)} style={inputStyle}>
          <option value="">All services</option>
          {(services ?? []).map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <input type="number" min={0} value={minDurationMs} placeholder="min ms"
          onChange={(e) => setMinDurationMs(e.target.value === "" ? "" : Number(e.target.value))}
          style={{ ...inputStyle, width: 110 }} />
        {traces && <span className="text-sm ml-auto" style={{ color: "var(--color-text-secondary)" }}>{traces.length} traces</span>}
      </div>

      {isLoading && <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Loading…</p>}

      {traces && traces.length === 0 && (
        <div className="rounded-xl border p-10 text-center text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
          No traces yet. Exercise the services (with Micrometer tracing enabled) to collect spans.
        </div>
      )}

      {traces && traces.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border)" }}>
                <th className="text-left p-2.5 font-medium">Root</th>
                <th className="text-left p-2.5 font-medium">Entry service</th>
                <th className="text-right p-2.5 font-medium">Total</th>
                <th className="text-right p-2.5 font-medium">Spans</th>
                <th className="text-left p-2.5 font-medium">Started</th>
                <th className="p-2.5" />
              </tr>
            </thead>
            <tbody>
              {traces.map((t) => (
                <tr key={t.traceId} className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => setSelected(t.traceId)}
                  style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td className="p-2.5 font-mono" style={{ color: "var(--color-text-primary)" }}>{t.rootName ?? t.traceId.slice(0, 12)}</td>
                  <td className="p-2.5" style={{ color: "var(--color-text-secondary)" }}>{t.entryService}</td>
                  <td className="p-2.5 text-right tabular-nums">{fmtMs(t.totalDurationMicros)}</td>
                  <td className="p-2.5 text-right tabular-nums">{t.spanCount}</td>
                  <td className="p-2.5" style={{ color: "var(--color-text-secondary)" }}>
                    {new Date(t.startEpochMicros / 1000).toLocaleTimeString()}
                  </td>
                  <td className="p-2.5">
                    {t.hasError && <AlertCircle className="w-3.5 h-3.5" style={{ color: "var(--color-breaking)" }} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SlideOver open={!!selected} title="Trace waterfall" subtitle={selected ?? undefined} onClose={() => setSelected(null)} width={720}>
        {trace ? <TraceWaterfall trace={trace} /> : <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Loading…</p>}
      </SlideOver>
    </div>
  )
}
