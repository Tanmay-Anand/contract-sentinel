import type { SamplingResultDto } from "../../infrastructure/api/types"

function scoreColor(score: number): string {
  if (score >= 0.8) return "var(--color-healthy)"
  if (score >= 0.5) return "var(--color-drifted)"
  return "var(--color-breaking)"
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

interface SamplingResultCardProps {
  result: SamplingResultDto
}

export function SamplingResultCard({ result }: SamplingResultCardProps) {
  const scorePercent = Math.round(result.matchScore * 100)

  return (
    <div
      className="rounded-lg border p-3 text-xs space-y-2"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      <div className="flex items-center gap-3">
        <span
          className="text-2xl font-bold"
          style={{ color: scoreColor(result.matchScore) }}
        >
          {scorePercent}%
        </span>
        <div className="flex-1">
          <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>Match Score</p>
          <p style={{ color: "var(--color-text-secondary)" }}>
            HTTP {result.httpStatus} · {new Date(result.sampledAt).toLocaleString()}
          </p>
        </div>
        {result.responseSizeBytes != null && (
          <span
            className="font-mono px-2 py-0.5 rounded"
            style={{ background: "var(--color-background)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
          >
            {formatBytes(result.responseSizeBytes)}
          </span>
        )}
      </div>

      {result.undocumentedFields.length > 0 && (
        <div>
          <p className="font-semibold mb-1" style={{ color: "#c2410c" }}>
            Undocumented fields ({result.undocumentedFields.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {result.undocumentedFields.map(f => (
              <span key={f} className="font-mono px-1.5 py-0.5 rounded"
                style={{ background: "#fff7ed", color: "#c2410c" }}>
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.missingFields.length > 0 && (
        <div>
          <p className="font-semibold mb-1" style={{ color: "var(--color-breaking)" }}>
            Missing fields ({result.missingFields.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {result.missingFields.map(f => (
              <span key={f} className="font-mono px-1.5 py-0.5 rounded"
                style={{ background: "var(--color-breaking-bg)", color: "var(--color-breaking)" }}>
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      <p style={{ color: "var(--color-healthy)" }}>
        {result.specFields.length - result.missingFields.length} fields matched
      </p>
    </div>
  )
}
