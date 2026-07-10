import type { TraceSpanNode, TraceTreeDto } from "../../infrastructure/api/types"

// Stable-ish colour per service name.
const PALETTE = ["#1d4ed8", "#15803d", "#7c3aed", "#d97706", "#0891b2", "#be185d"]
function serviceColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

function fmtMicros(micros: number): string {
  const ms = micros / 1000
  return ms >= 1 ? `${ms.toFixed(1)}ms` : `${micros}µs`
}

export function TraceWaterfall({ trace }: { trace: TraceTreeDto }) {
  const total = Math.max(1, trace.totalDurationMicros)
  const services = [...new Set(trace.spans.map((s) => s.serviceName))]

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-3">
        {services.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--color-text-secondary)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: serviceColor(s) }} />
            {s}
          </span>
        ))}
      </div>

      <div className="space-y-1">
        {trace.spans.map((span) => (
          <SpanBar key={span.spanId} span={span} total={total} />
        ))}
      </div>
    </div>
  )
}

function SpanBar({ span, total }: { span: TraceSpanNode; total: number }) {
  const leftPct = (span.offsetMicros / total) * 100
  const widthPct = Math.max(0.5, (span.durationMicros / total) * 100)
  const color = serviceColor(span.serviceName)
  const label = `${span.name ?? span.spanId}${span.httpStatus ? ` · ${span.httpStatus}` : ""}`

  return (
    <div className="flex items-center gap-2" style={{ paddingLeft: span.depth * 14 }}>
      <div className="text-xs font-mono truncate" style={{ width: 220, color: "var(--color-text-primary)" }} title={label}>
        {label}
      </div>
      <div className="relative flex-1 h-4 rounded" style={{ background: "var(--color-surface-muted)" }}>
        <div
          title={`${span.serviceName} · ${fmtMicros(span.durationMicros)}`}
          className="absolute h-4 rounded"
          style={{
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            background: color,
            opacity: span.httpStatus && span.httpStatus >= 400 ? 0.6 : 0.9,
          }}
        />
      </div>
      <div className="text-xs tabular-nums" style={{ width: 64, textAlign: "right", color: "var(--color-text-secondary)" }}>
        {fmtMicros(span.durationMicros)}
      </div>
    </div>
  )
}
