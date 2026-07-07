import { useState, useEffect, useMemo } from "react"
import { Search } from "lucide-react"
import { useCatalogue } from "../hooks/use-catalogue"
import { useServices } from "../hooks/use-services"
import { useEndpointSizes } from "../hooks/use-sampler"
import { EndpointCard } from "../components/endpoint-card"

const METHODS = ["ALL", "GET", "POST", "PUT", "DELETE", "PATCH"]

export default function CataloguePage() {
  const [rawQuery, setRawQuery] = useState("")
  const [query, setQuery] = useState("")
  const [method, setMethod] = useState("ALL")
  const [serviceId, setServiceId] = useState("")

  // Debounce query
  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery), 300)
    return () => clearTimeout(t)
  }, [rawQuery])

  const { data: services } = useServices()
  const { data: sizes } = useEndpointSizes()

  const sizeMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of sizes ?? []) {
      map.set(`${s.serviceId}:${s.httpMethod}:${s.path}`, s.responseSizeBytes)
    }
    return map
  }, [sizes])

  const params = {
    ...(query ? { q: query } : {}),
    ...(method !== "ALL" ? { method } : {}),
    ...(serviceId ? { serviceId } : {}),
  }
  const { data: entries, isLoading, isError } = useCatalogue(params)

  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    padding: "7px 12px",
    fontSize: 13,
    background: "var(--color-surface)",
    color: "var(--color-text-primary)",
    outline: "none",
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>API Catalogue</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
          Browse all endpoints across registered services.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--color-text-secondary)" }} />
          <input
            value={rawQuery}
            onChange={e => setRawQuery(e.target.value)}
            placeholder="Search endpoints..."
            style={{ ...inputStyle, paddingLeft: 30, minWidth: 220 }}
          />
        </div>

        <select
          value={method}
          onChange={e => setMethod(e.target.value)}
          style={inputStyle}
        >
          {METHODS.map(m => (
            <option key={m} value={m}>{m === "ALL" ? "All Methods" : m}</option>
          ))}
        </select>

        <select
          value={serviceId}
          onChange={e => setServiceId(e.target.value)}
          style={inputStyle}
        >
          <option value="">All Services</option>
          {(services ?? []).map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {entries && (
          <span className="text-sm ml-auto" style={{ color: "var(--color-text-secondary)" }}>
            {entries.length} endpoint{entries.length !== 1 ? "s" : ""} match
          </span>
        )}
      </div>

      {/* Results */}
      {isLoading && (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Loading...</p>
      )}

      {isError && (
        <p className="text-sm" style={{ color: "var(--color-breaking)" }}>
          Failed to load catalogue.
        </p>
      )}

      {!isLoading && !isError && entries?.length === 0 && (
        <div
          className="rounded-xl border p-10 text-center text-sm"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
        >
          No endpoints match your search.
        </div>
      )}

      {entries && entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry, i) => (
            <EndpointCard
              key={`${entry.serviceId}-${entry.httpMethod}-${entry.path}-${i}`}
              entry={entry}
              sizeBytes={sizeMap.get(`${entry.serviceId}:${entry.httpMethod}:${entry.path}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
