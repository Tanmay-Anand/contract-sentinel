import { useState } from "react"
import { Loader2, Wrench, MessageSquare, CheckCircle2, XCircle, ChevronDown, ChevronRight, Zap } from "lucide-react"
import { SlideOver } from "./slide-over"
import { MiniMarkdown } from "./mini-markdown"
import { useAgentRun } from "../hooks/use-agent-run"
import type { AgentStep, AgentProvenance } from "../../infrastructure/api/types"

interface Props {
  runId: string | null
  open: boolean
  onClose: () => void
  title: string
}

export function AgentRunPanel({ runId, open, onClose, title }: Props) {
  const { data: run } = useAgentRun(open ? runId : null)
  const running = run?.status === "RUNNING"
  const [stepsOpen, setStepsOpen] = useState(false)

  const toolCallCount = run?.steps.filter(s => s.type === "tool_call").length ?? 0

  return (
    <SlideOver open={open} title={title} subtitle={run?.llmProvider ?? undefined} onClose={onClose} width={580}>
      {!run && (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          Startingâ€¦
        </div>
      )}

      {run && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Status row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StatusChip status={run.status} />
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
              {run.iterations} iteration{run.iterations !== 1 ? "s" : ""}
              {toolCallCount > 0 && ` Â· ${toolCallCount} tool call${toolCallCount !== 1 ? "s" : ""}`}
            </span>
          </div>

          {/* Steps â€” collapsible once complete, always expanded while running */}
          {run.steps.length > 0 && (
            <div style={{
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              overflow: "hidden",
            }}>
              <button
                onClick={() => setStepsOpen(v => !v)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "var(--color-surface-muted)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--color-text-secondary)",
                  gap: 6,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {running
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--color-primary)" }} />
                    : <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "var(--color-healthy)" }} />}
                  {running ? "Runningâ€¦" : "Trace"}
                  <span style={{
                    background: "var(--color-background)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 10,
                    padding: "0 6px",
                    fontSize: 11,
                  }}>
                    {run.steps.length} step{run.steps.length !== 1 ? "s" : ""}
                  </span>
                </span>
                {(stepsOpen || running)
                  ? <ChevronDown className="w-3.5 h-3.5" />
                  : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {(stepsOpen || running) && (
                <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {run.steps.map((step) => <StepRow key={step.seq} step={step} />)}
                  {running && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary)" }}>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Thinkingâ€¦
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Result */}
          {run.status === "COMPLETE" && run.resultMarkdown && (
            <div style={{
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              overflow: "hidden",
            }}>
              <div style={{
                padding: "7px 12px",
                background: "var(--color-surface-muted)",
                borderBottom: "1px solid var(--color-border)",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "var(--color-text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}>
                <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "var(--color-healthy)" }} />
                Diagnosis
              </div>
              <div style={{ padding: "14px 16px" }}>
                <MiniMarkdown text={run.resultMarkdown} />
              </div>
            </div>
          )}

          {/* Provenance */}
          {run.status === "COMPLETE" && run.provenance && (
            <ProvenanceSection provenance={run.provenance} model={run.llmProvider} />
          )}

          {run.status === "FAILED" && (
            <div style={{
              borderRadius: 8,
              border: "1px solid var(--color-breaking-border)",
              background: "var(--color-breaking-bg)",
              padding: "12px 14px",
              fontSize: 13,
              color: "var(--color-breaking)",
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
            }}>
              <XCircle className="w-4 h-4 shrink-0" style={{ marginTop: 1 }} />
              <span>{run.resultMarkdown ?? "Agent failed."}</span>
            </div>
          )}
        </div>
      )}
    </SlideOver>
  )
}

function StepRow({ step }: { step: AgentStep }) {
  const isToolCall = step.type === "tool_call"
  const isToolResult = step.type === "tool_result"

  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12, alignItems: "flex-start" }}>
      <span style={{
        marginTop: 2,
        color: isToolResult ? "var(--color-healthy)" : isToolCall ? "var(--color-primary)" : "var(--color-text-secondary)",
        flexShrink: 0,
      }}>
        {isToolCall
          ? <Wrench className="w-3.5 h-3.5" />
          : isToolResult
            ? <CheckCircle2 className="w-3.5 h-3.5" />
            : <MessageSquare className="w-3.5 h-3.5" />}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        {step.name && (
          <span style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontWeight: 500,
            color: "var(--color-text-primary)",
            background: "var(--color-background)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            padding: "0 5px",
            fontSize: 11,
          }}>
            {step.name}
          </span>
        )}
        {step.summary && (
          <div style={{
            marginTop: step.name ? 2 : 0,
            color: "var(--color-text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }} title={step.summary}>
            {isToolResult ? "â†’ " : ""}{step.summary.slice(0, 200)}
          </div>
        )}
      </div>
    </div>
  )
}

function ProvenanceSection({ provenance, model }: { provenance: AgentProvenance; model: string | null }) {
  const fmt = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
  return (
    <div style={{
      borderRadius: 8,
      border: "1px solid var(--color-border)",
      padding: "8px 12px",
      fontSize: 11,
      color: "var(--color-text-secondary)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontWeight: 600 }}>
        <Zap className="w-3 h-3" style={{ color: "var(--color-primary)" }} />
        <span style={{ color: "var(--color-text-primary)", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          Provenance
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
        {model && (
          <span><span style={{ color: "var(--color-text-primary)" }}>Model</span> {model}</span>
        )}
        <span>
          <span style={{ color: "var(--color-text-primary)" }}>LLM calls</span> {provenance.calls.length}
        </span>
        <span>
          <span style={{ color: "var(--color-text-primary)" }}>LLM time</span> {fmt(provenance.totalMs)}
        </span>
      </div>
      {provenance.calls.length > 0 && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
          {provenance.calls.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontVariantNumeric: "tabular-nums" }}>
              <span style={{ width: 40 }}>iter {c.iter}</span>
              <span style={{ width: 60 }}>{fmt(c.ms)}</span>
              <span>{c.ctxMsgs} msgs in ctx</span>
            </div>
          ))}
        </div>
      )}
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
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "2px 8px",
      borderRadius: 99,
      fontWeight: 500,
      fontSize: 12,
      background: s.bg,
      color: s.fg,
    }}>
      {s.icon}
      {status}
    </span>
  )
}
