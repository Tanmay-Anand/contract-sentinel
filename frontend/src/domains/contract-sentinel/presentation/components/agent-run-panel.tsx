import { Loader2, Wrench, MessageSquare, CheckCircle2, XCircle } from "lucide-react"
import { SlideOver } from "./slide-over"
import { MiniMarkdown } from "./mini-markdown"
import { useAgentRun } from "../hooks/use-agent-run"
import type { AgentStep } from "../../infrastructure/api/types"

interface Props {
  runId: string | null
  open: boolean
  onClose: () => void
  title: string
}

export function AgentRunPanel({ runId, open, onClose, title }: Props) {
  const { data: run } = useAgentRun(open ? runId : null)
  const running = run?.status === "RUNNING"

  return (
    <SlideOver open={open} title={title} subtitle={run?.llmProvider ?? undefined} onClose={onClose} width={560}>
      {!run && <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Starting…</p>}

      {run && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs">
            <StatusChip status={run.status} />
            <span style={{ color: "var(--color-text-secondary)" }}>{run.iterations} iteration{run.iterations !== 1 ? "s" : ""}</span>
          </div>

          <div className="space-y-2">
            {run.steps.map((step) => <StepRow key={step.seq} step={step} />)}
            {running && (
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Thinking…
              </div>
            )}
          </div>

          {run.status === "COMPLETE" && run.resultMarkdown && (
            <div className="rounded-lg border p-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-muted)" }}>
              <MiniMarkdown text={run.resultMarkdown} />
            </div>
          )}
          {run.status === "FAILED" && (
            <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--color-breaking-border)", background: "var(--color-breaking-bg)", color: "var(--color-breaking)" }}>
              {run.resultMarkdown ?? "Agent failed."}
            </div>
          )}
        </div>
      )}
    </SlideOver>
  )
}

function StepRow({ step }: { step: AgentStep }) {
  const icon = step.type === "tool_call"
    ? <Wrench className="w-3.5 h-3.5" />
    : step.type === "tool_result"
      ? <CheckCircle2 className="w-3.5 h-3.5" />
      : <MessageSquare className="w-3.5 h-3.5" />
  const color = step.type === "tool_result" ? "var(--color-healthy)" : "var(--color-text-secondary)"

  return (
    <div className="flex gap-2 text-xs">
      <span style={{ color, marginTop: 2 }}>{icon}</span>
      <div className="min-w-0 flex-1">
        {step.name && <span className="font-mono font-medium" style={{ color: "var(--color-text-primary)" }}>{step.name}</span>}
        {step.summary && (
          <div className="truncate" style={{ color: "var(--color-text-secondary)" }} title={step.summary}>
            {step.type === "tool_result" ? "→ " : ""}{step.summary.slice(0, 200)}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; icon: React.ReactNode }> = {
    RUNNING: { bg: "var(--color-drifted-bg)", fg: "var(--color-drifted)", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    COMPLETE: { bg: "var(--color-healthy-bg)", fg: "var(--color-healthy)", icon: <CheckCircle2 className="w-3 h-3" /> },
    FAILED: { bg: "var(--color-breaking-bg)", fg: "var(--color-breaking)", icon: <XCircle className="w-3 h-3" /> },
  }
  const s = map[status] ?? map.RUNNING
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium" style={{ background: s.bg, color: s.fg }}>
      {s.icon}
      {status}
    </span>
  )
}
