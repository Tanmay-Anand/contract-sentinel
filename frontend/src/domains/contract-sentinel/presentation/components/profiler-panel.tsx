import { useEffect, useState } from "react"
import { Zap, Loader2, AlertTriangle } from "lucide-react"
import { SlideOver } from "./slide-over"
import { useStartProfiling, useProfilingRun } from "../hooks/use-profiling"
import type { HotMethodDto } from "../../infrastructure/api/types"

interface Props {
  serviceId: string
  serviceName: string
  open: boolean
  onClose: () => void
}

const DURATIONS = [15, 20, 30]

export function ProfilerPanel({ serviceId, serviceName, open, onClose }: Props) {
  const [duration, setDuration] = useState(20)
  const [runId, setRunId] = useState<string | null>(null)
  const start = useStartProfiling()
  const { data: run } = useProfilingRun(runId)

  useEffect(() => {
    if (!open) { setRunId(null) }
  }, [open])

  const status = run?.status
  const isRunning = status && !["COMPLETE", "FAILED"].includes(status)

  function launch() {
    start.mutate({ serviceId, durationSeconds: duration }, { onSuccess: (r) => setRunId(r.id) })
  }

  return (
    <SlideOver open={open} title={`Profile · ${serviceName}`} subtitle="Java Flight Recorder hotspot sampling" onClose={onClose}>
      <div className="space-y-4">
        {!runId && (
          <>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Records CPU execution samples for a few seconds. Use your app normally during recording to
              capture realistic hotspots.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Duration</span>
              {DURATIONS.map((d) => (
                <button key={d} onClick={() => setDuration(d)}
                  className="px-2.5 py-1 rounded text-xs border"
                  style={{
                    borderColor: d === duration ? "var(--color-primary)" : "var(--color-border)",
                    color: d === duration ? "var(--color-primary)" : "var(--color-text-secondary)",
                    background: d === duration ? "var(--color-primary-bg)" : "transparent",
                  }}>
                  {d}s
                </button>
              ))}
            </div>
            <button onClick={launch} disabled={start.isPending}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "var(--color-primary)" }}>
              <Zap className="w-4 h-4" />
              Start recording
            </button>
          </>
        )}

        {runId && isRunning && (
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--color-breaking)" }}
              className="animate-pulse" />
            <Loader2 className="w-4 h-4 animate-spin" />
            {status === "RECORDING" ? "Recording… use the app now" : `${status?.toLowerCase()}…`}
          </div>
        )}

        {status === "FAILED" && (
          <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--color-breaking-border)", background: "var(--color-breaking-bg)", color: "var(--color-breaking)" }}>
            {run?.errorMessage ?? "Profiling failed."}
          </div>
        )}

        {status === "COMPLETE" && run && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{run.totalSamples} samples</span>
              <button onClick={() => setRunId(null)} className="text-xs px-2 py-1 rounded border"
                style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}>
                Re-profile
              </button>
            </div>
            {run.totalSamples < 30 && (
              <div className="flex items-center gap-2 text-xs px-2 py-1.5 rounded" style={{ background: "var(--color-drifted-bg)", color: "var(--color-drifted)" }}>
                <AlertTriangle className="w-3.5 h-3.5" />
                Few samples — the service was mostly idle during recording.
              </div>
            )}
            <HotMethodTable methods={run.hotMethods} />
          </>
        )}
      </div>
    </SlideOver>
  )
}

function heat(rank: number): { bg: string; fg: string } {
  if (rank <= 3) return { bg: "#fef2f2", fg: "var(--color-breaking)" }
  if (rank <= 7) return { bg: "#fffbeb", fg: "var(--color-drifted)" }
  return { bg: "transparent", fg: "var(--color-text-secondary)" }
}

function HotMethodTable({ methods }: { methods: HotMethodDto[] }) {
  if (methods.length === 0) {
    return <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>No hot methods captured.</p>
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr style={{ color: "var(--color-text-secondary)" }}>
          <th className="text-left pb-1 pr-2 font-medium">#</th>
          <th className="text-left pb-1 pr-2 font-medium">Method</th>
          <th className="text-right pb-1 pr-2 font-medium">Samples</th>
          <th className="text-right pb-1 font-medium">%</th>
        </tr>
      </thead>
      <tbody>
        {methods.map((m) => {
          const c = heat(m.rank)
          return (
            <tr key={m.rank} style={{ background: c.bg }}>
              <td className="py-1 pr-2 font-mono" style={{ color: c.fg }}>{m.rank}</td>
              <td className="py-1 pr-2 font-mono" style={{ color: "var(--color-text-primary)", wordBreak: "break-all" }}>{m.frame}</td>
              <td className="py-1 pr-2 text-right" style={{ color: "var(--color-text-secondary)" }}>{m.samples}</td>
              <td className="py-1 text-right font-medium" style={{ color: c.fg }}>{m.percentage.toFixed(1)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
