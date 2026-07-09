import { useMemo, useState } from "react"
import { usePerformanceRegistry } from "../hooks/use-performance"
import { useServices } from "../hooks/use-services"
import { useDiagnose } from "../hooks/use-agent-run"
import { MethodBadge } from "../components/method-badge"
import { formatBytes } from "../components/sampling-result-card"
import { EndpointDetailPanel } from "../components/endpoint-detail-panel"
import { AgentRunPanel } from "../components/agent-run-panel"
import { SchemaRiskCard } from "../components/schema-risk-card"
import type { EndpointPerformanceRow } from "../../infrastructure/api/types"

type SortKey = "p99Ms" | "p95Ms" | "p50Ms" | "countDelta" | "errorRatePct" | "responseSizeBytes" | "volatilityCv"

const VOLATILITY: Record<string, string> = {
  STABLE: "var(--color-healthy)",
  MODERATE: "var(--color-drifted)",
  VOLATILE: "#ea580c",
  ERRATIC: "var(--color-breaking)",
  INSUFFICIENT_DATA: "var(--color-text-secondary)",
}

function Sparkline({ values }: { values: number[] }) {
  const pts = values.filter((v) => v != null)
  if (pts.length < 2) return <span style={{ color: "var(--color-text-secondary)" }}>—</span>
  const w = 100, h = 24
  const min = Math.min(...pts), max = Math.max(...pts)
  const range = max - min || 1
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * w},${h - ((v - min) / range) * (h - 2) - 1}`).join(" ")
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={d} fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export default function PerformancePage() {
  const [serviceId, setServiceId] = useState("")
  const [method, setMethod] = useState("")
  const [q, setQ] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("p99Ms")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [detail, setDetail] = useState<EndpointPerformanceRow | null>(null)
  const [diagnoseRunId, setDiagnoseRunId] = useState<string | null>(null)
  const [diagnoseOpen, setDiagnoseOpen] = useState(false)

  const { data: services } = useServices()
  const { data: rows, isLoading } = usePerformanceRegistry({
    serviceId: serviceId || undefined, method: method || undefined, q: q || undefined,
  })
  const diagnose = useDiagnose()

  const sorted = useMemo(() => {
    const list = [...(rows ?? [])]
    list.sort((a, b) => {
      const av = (a[sortKey] ?? 0) as number
      const bv = (b[sortKey] ?? 0) as number
      return sortDir === "asc" ? av - bv : bv - av
    })
    return list
  }, [rows, sortKey, sortDir])

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(k); setSortDir("desc") }
  }

  function runDiagnose(row: EndpointPerformanceRow, mode?: string) {
    diagnose.mutate({ serviceId: row.serviceId, method: row.httpMethod, path: row.path, mode }, {
      onSuccess: (r) => { setDiagnoseRunId(r.id); setDiagnoseOpen(true) },
    })
  }

  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--color-border)", borderRadius: 8, padding: "7px 12px",
    fontSize: 13, background: "var(--color-surface)", color: "var(--color-text-primary)", outline: "none",
  }

  const num = (v: number | null) => (v == null ? "—" : v.toFixed(0))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Performance Registry</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
          Every endpoint's current latency, error rate, size and volatility — sortable and ranked relative to the fleet.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} style={inputStyle}>
          <option value="">All services</option>
          {(services ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
          <option value="">All methods</option>
          {["GET", "POST", "PUT", "DELETE", "PATCH"].map((m) => <option key={m}>{m}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter path…" style={{ ...inputStyle, minWidth: 200 }} />
        {rows && <span className="text-sm ml-auto" style={{ color: "var(--color-text-secondary)" }}>{rows.length} endpoints</span>}
      </div>

      {isLoading && <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Loading…</p>}

      {rows && rows.length === 0 && (
        <div className="rounded-xl border p-10 text-center text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
          No performance data yet. It accrues as services are polled.
        </div>
      )}

      {sorted.length > 0 && (
        <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border)" }}>
                <th className="text-left p-2 font-medium">Endpoint</th>
                <th className="text-left p-2 font-medium">Service</th>
                <SortTh label="Δ" k="countDelta" {...{ sortKey, sortDir, toggleSort }} />
                <SortTh label="p50" k="p50Ms" {...{ sortKey, sortDir, toggleSort }} />
                <SortTh label="p95" k="p95Ms" {...{ sortKey, sortDir, toggleSort }} />
                <SortTh label="p99" k="p99Ms" {...{ sortKey, sortDir, toggleSort }} />
                <SortTh label="err%" k="errorRatePct" {...{ sortKey, sortDir, toggleSort }} />
                <SortTh label="size" k="responseSizeBytes" {...{ sortKey, sortDir, toggleSort }} />
                <SortTh label="volatility" k="volatilityCv" {...{ sortKey, sortDir, toggleSort }} />
                <th className="text-left p-2 font-medium">7d p95</th>
                <th className="text-right p-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={`${r.serviceId}-${r.httpMethod}-${r.path}`} className="hover:bg-slate-50"
                  style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td className="p-2">
                    <button className="flex items-center gap-2 text-left" onClick={() => setDetail(r)}>
                      <MethodBadge method={r.httpMethod} />
                      <code style={{ color: "var(--color-text-primary)" }}>{r.path}</code>
                    </button>
                  </td>
                  <td className="p-2" style={{ color: "var(--color-text-secondary)" }}>{r.serviceName}</td>
                  <td className="p-2 tabular-nums">{r.countDelta}</td>
                  <td className="p-2 tabular-nums">{num(r.p50Ms)}</td>
                  <td className="p-2 tabular-nums">{num(r.p95Ms)}</td>
                  <td className="p-2 tabular-nums">
                    <span style={{ color: r.p99MedianRatio > 2 ? "var(--color-breaking)" : "var(--color-text-primary)" }}>
                      {num(r.p99Ms)}
                    </span>
                    {r.p99MedianRatio > 2 && (
                      <span className="ml-1 px-1 rounded" style={{ background: "var(--color-breaking-bg)", color: "var(--color-breaking)" }}>
                        {r.p99MedianRatio.toFixed(1)}×
                      </span>
                    )}
                  </td>
                  <td className="p-2 tabular-nums" style={{ color: r.errorRatePct > 0 ? "var(--color-breaking)" : "var(--color-text-secondary)" }}>
                    {r.errorRatePct.toFixed(1)}
                  </td>
                  <td className="p-2 tabular-nums">{r.responseSizeBytes != null ? formatBytes(r.responseSizeBytes) : "—"}</td>
                  <td className="p-2">
                    <span className="px-1.5 py-0.5 rounded-full" style={{ background: "var(--color-background)", color: VOLATILITY[r.volatilityRating] ?? "var(--color-text-secondary)" }}>
                      {r.volatilityRating === "INSUFFICIENT_DATA" ? "—" : r.volatilityRating}
                    </span>
                  </td>
                  <td className="p-2"><Sparkline values={r.p95Sparkline} /></td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <button onClick={() => runDiagnose(r)} className="px-2 py-1 rounded border"
                      style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}>
                      Diagnose
                    </button>
                    {r.volatilityRating === "ERRATIC" && (
                      <button onClick={() => runDiagnose(r, "VOLATILITY")} className="ml-1 px-2 py-1 rounded border"
                        style={{ borderColor: "var(--color-border)", color: "#ea580c" }}>
                        Analyse
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SchemaRiskCard />

      {detail && (
        <EndpointDetailPanel
          serviceId={detail.serviceId} serviceName={detail.serviceName}
          method={detail.httpMethod} path={detail.path}
          open={!!detail} onClose={() => setDetail(null)}
        />
      )}
      <AgentRunPanel runId={diagnoseRunId} open={diagnoseOpen} onClose={() => setDiagnoseOpen(false)} title="Performance Diagnosis" />
    </div>
  )
}

function SortTh({ label, k, sortKey, sortDir, toggleSort }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: "asc" | "desc"; toggleSort: (k: SortKey) => void
}) {
  return (
    <th className="text-left p-2 font-medium cursor-pointer select-none" onClick={() => toggleSort(k)}>
      {label}{sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  )
}
