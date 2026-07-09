import { useState } from "react"
import { Plus, Play, ChevronDown, ChevronRight, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  useSampledEndpoints,
  useCreateSampledEndpoint,
  useDeleteSampledEndpoint,
  useRunSample,
  useSamplingResults,
} from "../hooks/use-sampler"
import { useServices } from "../hooks/use-services"
import { SamplingResultCard, formatBytes } from "../components/sampling-result-card"
import { SizeLatencyScatter } from "../components/size-latency-scatter"
import { MethodBadge } from "../components/method-badge"
import type { SampledEndpointRequest } from "../../infrastructure/api/types"

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"]

function RegisterForm({
  serviceOptions,
  onSubmit,
  onCancel,
}: {
  serviceOptions: { id: string; name: string }[]
  onSubmit: (data: SampledEndpointRequest) => void
  onCancel: () => void
}) {
  const [serviceId, setServiceId] = useState(serviceOptions[0]?.id ?? "")
  const [httpMethod, setHttpMethod] = useState("GET")
  const [path, setPath] = useState("")
  const [sampleUrl, setSampleUrl] = useState("")
  const [authHeader, setAuthHeader] = useState("")
  const [tenantId, setTenantId] = useState("")
  const [sampleIntervalMinutes, setSampleIntervalMinutes] = useState(60)

  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--color-border)",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 13,
    width: "100%",
    background: "var(--color-surface)",
    color: "var(--color-text-primary)",
    outline: "none",
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      serviceId,
      httpMethod,
      path,
      sampleUrl,
      ...(authHeader ? { authHeader } : {}),
      ...(tenantId ? { tenantId } : {}),
      sampleIntervalMinutes,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Service</label>
          <select value={serviceId} onChange={e => setServiceId(e.target.value)} style={inputStyle} required>
            {serviceOptions.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Method</label>
          <select value={httpMethod} onChange={e => setHttpMethod(e.target.value)} style={inputStyle}>
            {HTTP_METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>API Path</label>
        <input required value={path} onChange={e => setPath(e.target.value)} placeholder="/api/v1/resource" style={inputStyle} />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Sample URL (full URL to hit)</label>
        <input required type="url" value={sampleUrl} onChange={e => setSampleUrl(e.target.value)} placeholder="https://api.example.com/api/v1/resource" style={inputStyle} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Auth Header (optional)</label>
          <input value={authHeader} onChange={e => setAuthHeader(e.target.value)} placeholder="Bearer token..." style={inputStyle} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Sample Interval (minutes)</label>
          <input type="number" min={1} value={sampleIntervalMinutes} onChange={e => setSampleIntervalMinutes(Number(e.target.value))} style={inputStyle} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "var(--color-primary)" }}>
          Register
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function SizeSparkline({ results }: { results: { responseSizeBytes: number | null }[] }) {
  const sizes = results
    .map(r => r.responseSizeBytes)
    .filter((n): n is number => n != null)
    .reverse()

  if (sizes.length < 2) return null

  const W = 80, H = 22
  const min = Math.min(...sizes)
  const max = Math.max(...sizes)
  const range = max - min || 1
  const points = sizes
    .map((s, i) => `${(i / (sizes.length - 1)) * W},${H - ((s - min) / range) * (H - 2) - 1}`)
    .join(" ")

  return (
    <svg width={W} height={H} style={{ display: "inline-block", verticalAlign: "middle" }}>
      <polyline points={points} fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function EndpointResultsRow({ endpointId }: { endpointId: string }) {
  const { data } = useSamplingResults(endpointId, 0)
  const allResults = data?.content ?? []
  const results = allResults.slice(0, 5)

  if (results.length === 0) {
    return <p className="text-xs py-2" style={{ color: "var(--color-text-secondary)" }}>No results yet. Run a sample.</p>
  }

  const latestSize = results[0]?.responseSizeBytes

  return (
    <div className="space-y-2 pt-2">
      {latestSize != null && (
        <div className="flex items-center gap-3 pb-1">
          <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
            Response size trend
          </span>
          <SizeSparkline results={allResults} />
          <span className="text-xs font-mono" style={{ color: "var(--color-text-secondary)" }}>
            {formatBytes(latestSize)}
          </span>
        </div>
      )}
      {results.map(r => <SamplingResultCard key={r.id} result={r} />)}

      <div className="pt-2 border-t mt-2" style={{ borderColor: "var(--color-border)" }}>
        <p className="text-xs font-semibold pt-1" style={{ color: "var(--color-text-primary)" }}>
          Payload size vs response time
        </p>
        <SizeLatencyScatter endpointId={endpointId} enabled />
      </div>
    </div>
  )
}

export default function SamplerPage() {
  const [showForm, setShowForm] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const { data: endpoints, isLoading } = useSampledEndpoints()
  const { data: services } = useServices()
  const createEndpoint = useCreateSampledEndpoint()
  const deleteEndpoint = useDeleteSampledEndpoint()
  const runSample = useRunSample()

  const serviceOptions = (services ?? []).map(s => ({ id: s.id, name: s.name }))

  function toggleExpanded(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleCreate(data: SampledEndpointRequest) {
    createEndpoint.mutate(data, {
      onSuccess: () => {
        toast.success("Endpoint registered for sampling")
        setShowForm(false)
      },
    })
  }

  function handleDelete(id: string) {
    deleteEndpoint.mutate(id, {
      onSuccess: () => toast.success("Endpoint removed"),
    })
  }

  function handleRun(id: string) {
    runSample.mutate(id, {
      onSuccess: result => {
        toast.success(`Sample complete — ${Math.round(result.matchScore * 100)}% match`)
        setExpandedIds(prev => new Set([...prev, id]))
      },
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Response Sampler</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
            Sample live endpoints and compare responses against the OpenAPI spec.
          </p>
        </div>
        <button
          onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: "var(--color-primary)" }}
        >
          <Plus className="w-4 h-4" />
          Register Endpoint
        </button>
      </div>

      {showForm && (
        <div
          className="rounded-xl border p-5"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text-primary)" }}>
            Register Endpoint for Sampling
          </h2>
          <RegisterForm
            serviceOptions={serviceOptions}
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {isLoading && (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Loading...</p>
      )}

      {!isLoading && (!endpoints || endpoints.length === 0) && (
        <div
          className="rounded-xl border p-10 text-center text-sm"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
        >
          No endpoints registered. Click "Register Endpoint" to start sampling.
        </div>
      )}

      {endpoints && endpoints.length > 0 && (
        <div className="space-y-3">
          {endpoints.map(ep => {
            const expanded = expandedIds.has(ep.id)
            return (
              <div
                key={ep.id}
                className="rounded-xl border"
                style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <MethodBadge method={ep.httpMethod} />
                  <code className="text-sm flex-1 truncate" style={{ color: "var(--color-text-primary)" }}>
                    {ep.path}
                  </code>
                  <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    {ep.serviceName}
                  </span>
                  <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    {ep.lastSampledAt
                      ? `Last: ${new Date(ep.lastSampledAt).toLocaleString()}`
                      : "Never sampled"}
                  </span>
                  <button
                    onClick={() => handleRun(ep.id)}
                    disabled={runSample.isPending}
                    className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-white disabled:opacity-50"
                    style={{ background: "var(--color-primary)" }}
                  >
                    <Play className="w-3 h-3" />
                    Run
                  </button>
                  <button
                    onClick={() => toggleExpanded(ep.id)}
                    className="p-1.5 rounded"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(ep.id)}
                    className="p-1.5 rounded"
                    style={{ color: "var(--color-breaking)" }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {expanded && (
                  <div className="border-t px-4 pb-3" style={{ borderColor: "var(--color-border)" }}>
                    <EndpointResultsRow endpointId={ep.id} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
