import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { sentinelService } from "../domains/contract-sentinel/infrastructure/api/sentinel.service"
import { Brain, Check, Trash2, Sparkles, ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import type { SynonymDto, MetricDto, ServiceKnowledgeSummaryDto } from "../domains/contract-sentinel/infrastructure/api/types"
import { toast } from "sonner"

export const Route = createFileRoute("/knowledge")({
  component: KnowledgePage,
})

function KnowledgePage() {
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [tab, setTab] = useState<"synonyms" | "metrics">("synonyms")
  const [showPending, setShowPending] = useState(true)

  const { data: graph = [], isLoading: graphLoading } = useQuery({
    queryKey: ["knowledge", "graph"],
    queryFn: () => sentinelService.knowledge.graph(),
  })

  const { data: synonyms = [], isLoading: synLoading } = useQuery({
    queryKey: ["knowledge", "synonyms", selectedService, showPending],
    queryFn: () => sentinelService.knowledge.synonyms({
      approved: showPending ? undefined : true,
      serviceName: selectedService ?? undefined,
    }),
  })

  const { data: metrics = [], isLoading: metLoading } = useQuery({
    queryKey: ["knowledge", "metrics", selectedService, showPending],
    queryFn: () => sentinelService.knowledge.metrics({
      approved: showPending ? undefined : true,
      serviceName: selectedService ?? undefined,
    }),
  })

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <Brain className="w-6 h-6" style={{ color: "var(--color-primary)" }} />
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
            Knowledge Graph
          </h1>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>
            Synonyms and metrics used to resolve natural-language queries
          </p>
        </div>
      </div>

      {/* Service summary cards */}
      {graphLoading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-text-secondary)", fontSize: 13, marginBottom: 24 }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Loading servicesâ€¦
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
          <ServiceCard
            summary={{ serviceName: "All services", approvedSynonyms: synonyms.filter(s => s.approved).length, pendingSynonyms: synonyms.filter(s => !s.approved).length, approvedMetrics: metrics.filter(m => m.approved).length, pendingMetrics: metrics.filter(m => !m.approved).length }}
            active={selectedService === null}
            onClick={() => setSelectedService(null)}
          />
          {graph.map(g => (
            <ServiceCard key={g.serviceName} summary={g} active={selectedService === g.serviceName}
              onClick={() => setSelectedService(g.serviceName)} />
          ))}
        </div>
      )}

      {/* Tab bar + filter */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {(["synonyms", "metrics"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid " + (tab === t ? "var(--color-primary)" : "var(--color-border)"),
              background: tab === t ? "var(--color-primary-bg)" : "transparent",
              color: tab === t ? "var(--color-primary)" : "var(--color-text-secondary)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              textTransform: "capitalize",
            }}>
              {t}
            </button>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary)", cursor: "pointer" }}>
          <input type="checkbox" checked={showPending} onChange={e => setShowPending(e.target.checked)} />
          Show pending approvals
        </label>
      </div>

      {tab === "synonyms" ? (
        <SynonymTable synonyms={synonyms} loading={synLoading} serviceId={selectedService} />
      ) : (
        <MetricTable metrics={metrics} loading={metLoading} serviceId={selectedService} />
      )}
    </div>
  )
}

function ServiceCard({ summary, active, onClick }: {
  summary: ServiceKnowledgeSummaryDto & { serviceName: string }
  active: boolean
  onClick: () => void
}) {
  const hasPending = summary.pendingSynonyms + summary.pendingMetrics > 0
  return (
    <button onClick={onClick} style={{
      padding: "10px 14px",
      borderRadius: 8,
      border: "1px solid " + (active ? "var(--color-primary)" : "var(--color-border)"),
      background: active ? "var(--color-primary-bg)" : "var(--color-surface)",
      cursor: "pointer",
      textAlign: "left",
      minWidth: 160,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: active ? "var(--color-primary)" : "var(--color-text-primary)", marginBottom: 4 }}>
        {summary.serviceName}
      </div>
      <div style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--color-text-secondary)" }}>
        <span title="Approved synonyms">âœ“ {summary.approvedSynonyms} syn</span>
        <span title="Approved metrics">âœ“ {summary.approvedMetrics} met</span>
        {hasPending && (
          <span style={{ color: "var(--color-drifted)", fontWeight: 600 }}>
            {summary.pendingSynonyms + summary.pendingMetrics} pending
          </span>
        )}
      </div>
    </button>
  )
}

function SynonymTable({ synonyms, loading, serviceId }: {
  synonyms: SynonymDto[]
  loading: boolean
  serviceId: string | null
}) {
  const qc = useQueryClient()
  const approveMut = useMutation({
    mutationFn: (id: string) => sentinelService.knowledge.approveSynonym(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["knowledge"] }); toast.success("Synonym approved") },
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => sentinelService.knowledge.deleteSynonym(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["knowledge"] }); toast.success("Synonym deleted") },
  })
  const proposeMut = useMutation({
    mutationFn: (svcId: string) => sentinelService.knowledge.proposeSynonyms(svcId),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ["knowledge"] }); toast.success(`${data.length} synonyms proposed`) },
  })

  return (
    <div>
      {serviceId && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button
            onClick={() => proposeMut.mutate(serviceId)}
            disabled={proposeMut.isPending}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 6,
              border: "1px solid var(--color-primary)",
              background: "var(--color-primary-bg)",
              color: "var(--color-primary)",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}>
            {proposeMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Propose via LLM
          </button>
        </div>
      )}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-text-secondary)", fontSize: 13 }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Loadingâ€¦
        </div>
      ) : synonyms.length === 0 ? (
        <div style={{ color: "var(--color-text-secondary)", fontSize: 13, padding: "24px 0" }}>
          No synonyms yet. Use "Propose via LLM" to generate some.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--color-surface-muted)" }}>
                {["Term", "â†’ Target", "Type", "Service", "Source", "Status", ""].map(h => (
                  <th key={h} style={{ padding: "7px 12px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--color-border)", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {synonyms.map(s => (
                <tr key={s.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "7px 12px", fontFamily: "ui-monospace, monospace", color: "var(--color-text-primary)", fontWeight: 500 }}>{s.term}</td>
                  <td style={{ padding: "7px 12px", fontFamily: "ui-monospace, monospace", color: "var(--color-primary)" }}>{s.targetName}</td>
                  <td style={{ padding: "7px 12px" }}><TypeBadge type={s.targetType} /></td>
                  <td style={{ padding: "7px 12px", color: "var(--color-text-secondary)" }}>{s.serviceName ?? "â€”"}</td>
                  <td style={{ padding: "7px 12px" }}>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: s.proposedByLlm ? "var(--color-drifted-bg)" : "var(--color-surface-muted)", color: s.proposedByLlm ? "var(--color-drifted)" : "var(--color-text-secondary)" }}>
                      {s.proposedByLlm ? "LLM" : "Manual"}
                    </span>
                  </td>
                  <td style={{ padding: "7px 12px" }}>
                    {s.approved ? (
                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: "var(--color-healthy-bg)", color: "var(--color-healthy)" }}>Approved</span>
                    ) : (
                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: "var(--color-breaking-bg)", color: "var(--color-breaking)" }}>Pending</span>
                    )}
                  </td>
                  <td style={{ padding: "7px 12px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {!s.approved && (
                        <IconBtn title="Approve" onClick={() => approveMut.mutate(s.id)} color="var(--color-healthy)">
                          <Check className="w-3.5 h-3.5" />
                        </IconBtn>
                      )}
                      <IconBtn title="Delete" onClick={() => deleteMut.mutate(s.id)} color="var(--color-breaking)">
                        <Trash2 className="w-3.5 h-3.5" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MetricTable({ metrics, loading, serviceId }: {
  metrics: MetricDto[]
  loading: boolean
  serviceId: string | null
}) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const approveMut = useMutation({
    mutationFn: (id: string) => sentinelService.knowledge.approveMetric(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["knowledge"] }); toast.success("Metric approved") },
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => sentinelService.knowledge.deleteMetric(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["knowledge"] }); toast.success("Metric deleted") },
  })
  const proposeMut = useMutation({
    mutationFn: (svcId: string) => sentinelService.knowledge.proposeMetrics(svcId),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ["knowledge"] }); toast.success(`${data.length} metrics proposed`) },
  })

  return (
    <div>
      {serviceId && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button
            onClick={() => proposeMut.mutate(serviceId)}
            disabled={proposeMut.isPending}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 6,
              border: "1px solid var(--color-primary)",
              background: "var(--color-primary-bg)",
              color: "var(--color-primary)",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}>
            {proposeMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Propose via LLM
          </button>
        </div>
      )}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-text-secondary)", fontSize: 13 }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Loadingâ€¦
        </div>
      ) : metrics.length === 0 ? (
        <div style={{ color: "var(--color-text-secondary)", fontSize: 13, padding: "24px 0" }}>
          No metrics yet. Use "Propose via LLM" to generate some.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {metrics.map(m => (
            <div key={m.id} style={{
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              overflow: "hidden",
            }}>
              <div
                onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                  background: "var(--color-surface)", cursor: "pointer",
                }}>
                {expanded === m.id
                  ? <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
                  : <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                    {m.displayName}
                    <span style={{ fontWeight: 400, color: "var(--color-text-secondary)", marginLeft: 8, fontSize: 11, fontFamily: "ui-monospace, monospace" }}>
                      {m.name}
                    </span>
                  </div>
                  {m.description && (
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 1 }}>{m.description}</div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: "var(--color-surface-muted)", color: "var(--color-text-secondary)" }}>
                    {m.aggregationFunction}
                  </span>
                  {m.approved ? (
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: "var(--color-healthy-bg)", color: "var(--color-healthy)" }}>Approved</span>
                  ) : (
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: "var(--color-breaking-bg)", color: "var(--color-breaking)" }}>Pending</span>
                  )}
                  {!m.approved && (
                    <IconBtn title="Approve" onClick={e => { e.stopPropagation(); approveMut.mutate(m.id) }} color="var(--color-healthy)">
                      <Check className="w-3.5 h-3.5" />
                    </IconBtn>
                  )}
                  <IconBtn title="Delete" onClick={e => { e.stopPropagation(); deleteMut.mutate(m.id) }} color="var(--color-breaking)">
                    <Trash2 className="w-3.5 h-3.5" />
                  </IconBtn>
                </div>
              </div>
              {expanded === m.id && (
                <div style={{ padding: "10px 14px", borderTop: "1px solid var(--color-border)", background: "var(--color-background)" }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>SQL Definition</div>
                  <pre style={{
                    fontSize: 11, fontFamily: "ui-monospace, monospace",
                    color: "var(--color-text-primary)",
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 6, padding: "8px 12px", margin: 0, overflowX: "auto",
                  }}>
                    {m.sqlDefinition}
                  </pre>
                  <div style={{ marginTop: 8, fontSize: 11, color: "var(--color-text-secondary)" }}>
                    Anchor table: <span style={{ fontFamily: "ui-monospace, monospace", color: "var(--color-text-primary)" }}>{m.anchorTable}</span>
                    {m.serviceName && <> Â· Service: <span style={{ color: "var(--color-text-primary)" }}>{m.serviceName}</span></>}
                    {m.proposedByLlm && <> Â· <span style={{ color: "var(--color-drifted)" }}>LLM-proposed</span></>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    TABLE:  { bg: "var(--color-primary-bg)", fg: "var(--color-primary)" },
    COLUMN: { bg: "var(--color-drifted-bg)", fg: "var(--color-drifted)" },
    METRIC: { bg: "var(--color-healthy-bg)", fg: "var(--color-healthy)" },
  }
  const c = colors[type] ?? colors.TABLE
  return (
    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: c.bg, color: c.fg, fontWeight: 500 }}>
      {type}
    </span>
  )
}

function IconBtn({ children, onClick, title, color }: {
  children: React.ReactNode
  onClick: (e: React.MouseEvent) => void
  title: string
  color: string
}) {
  return (
    <button onClick={onClick} title={title} style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: 24, height: 24, borderRadius: 4,
      border: "1px solid var(--color-border)",
      background: "transparent", cursor: "pointer", color,
      flexShrink: 0,
    }}>
      {children}
    </button>
  )
}
