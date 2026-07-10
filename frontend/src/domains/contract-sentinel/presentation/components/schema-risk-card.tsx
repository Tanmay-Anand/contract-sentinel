import { useState } from "react"
import { ShieldAlert } from "lucide-react"
import { useSchemaRisk } from "../hooks/use-agent-run"
import { AgentRunPanel } from "./agent-run-panel"

const PLACEHOLDER = "ALTER TABLE booking ADD COLUMN cancellation_reason varchar(255) NOT NULL;"

export function SchemaRiskCard() {
  const [sql, setSql] = useState("")
  const [runId, setRunId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const assess = useSchemaRisk()

  function run() {
    if (!sql.trim()) return
    assess.mutate(sql, {
      onSuccess: (r) => { setRunId(r.id); setOpen(true) },
    })
  }

  return (
    <div className="rounded-xl border p-5" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert className="w-4 h-4" style={{ color: "var(--color-drifted)" }} />
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Schema Change Risk Agent</h2>
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--color-text-secondary)" }}>
        Paste a migration statement. The agent counts rows, maps foreign keys, finds affected endpoints and
        frontend references, then produces a risk report.
      </p>
      <textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={4}
        className="w-full font-mono text-xs rounded-lg border p-2.5"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface-muted)", color: "var(--color-text-primary)", outline: "none" }}
      />
      <button onClick={run} disabled={assess.isPending || !sql.trim()}
        className="mt-2 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
        style={{ background: "var(--color-primary)" }}>
        Assess risk
      </button>

      <AgentRunPanel runId={runId} open={open} onClose={() => setOpen(false)} title="Schema Change Risk" />
    </div>
  )
}
