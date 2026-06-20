import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { MethodBadge } from "./method-badge"
import type { CatalogueEntryDto } from "../../infrastructure/api/types"

interface EndpointCardProps {
  entry: CatalogueEntryDto
}

export function EndpointCard({ entry }: EndpointCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="rounded-lg border"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      <button
        className="w-full text-left px-4 py-3 flex items-center gap-3"
        onClick={() => setExpanded(e => !e)}
      >
        <MethodBadge method={entry.httpMethod} />
        <code className="text-sm font-medium flex-1 truncate" style={{ color: "var(--color-text-primary)" }}>
          {entry.path}
        </code>
        <span
          className="text-xs px-2 py-0.5 rounded-full border"
          style={{ color: "var(--color-text-secondary)", borderColor: "var(--color-border)" }}
        >
          {entry.serviceName}
        </span>
        {entry.summary && (
          <span className="text-xs hidden sm:block max-w-xs truncate" style={{ color: "var(--color-text-secondary)" }}>
            {entry.summary}
          </span>
        )}
        <span style={{ color: "var(--color-text-secondary)" }}>
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </button>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-4" style={{ borderColor: "var(--color-border)" }}>
          {entry.tags.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {entry.tags.map(tag => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded"
                  style={{ background: "var(--color-background)", color: "var(--color-text-secondary)" }}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {entry.parameters.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>Parameters</p>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: "var(--color-text-secondary)" }}>
                    <th className="text-left pb-1 pr-3 font-medium">Name</th>
                    <th className="text-left pb-1 pr-3 font-medium">In</th>
                    <th className="text-left pb-1 pr-3 font-medium">Type</th>
                    <th className="text-left pb-1 font-medium">Required</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.parameters.map(p => (
                    <tr key={`${p.name}-${p.in}`} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                      <td className="py-1 pr-3 font-mono">{p.name}</td>
                      <td className="py-1 pr-3">{p.in}</td>
                      <td className="py-1 pr-3">{p.type ?? "—"}</td>
                      <td className="py-1">{p.required ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {entry.responseFields.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>Response Fields</p>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: "var(--color-text-secondary)" }}>
                    <th className="text-left pb-1 pr-3 font-medium">Field</th>
                    <th className="text-left pb-1 pr-3 font-medium">Type</th>
                    <th className="text-left pb-1 font-medium">Required</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.responseFields.map(f => (
                    <tr key={f.name} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                      <td className="py-1 pr-3 font-mono">{f.name}</td>
                      <td className="py-1 pr-3">{f.type ?? "—"}</td>
                      <td className="py-1">{f.required ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {entry.requestFields.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>Request Body Fields</p>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: "var(--color-text-secondary)" }}>
                    <th className="text-left pb-1 pr-3 font-medium">Field</th>
                    <th className="text-left pb-1 pr-3 font-medium">Type</th>
                    <th className="text-left pb-1 font-medium">Required</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.requestFields.map(f => (
                    <tr key={f.name} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                      <td className="py-1 pr-3 font-mono">{f.name}</td>
                      <td className="py-1 pr-3">{f.type ?? "—"}</td>
                      <td className="py-1">{f.required ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
