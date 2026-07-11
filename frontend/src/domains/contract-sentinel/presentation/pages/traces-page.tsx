import { useState, useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTraces, useTrace } from "../hooks/use-traces";
import { useServices } from "../hooks/use-services";
import { usePerformanceRegistry } from "../hooks/use-performance";
import { useEventSubscription } from "../hooks/use-event-subscription";
import { SlideOver } from "../components/slide-over";
import { TraceWaterfall } from "../components/trace-waterfall";
import { MethodBadge } from "../components/method-badge";

function fmtMs(micros: number) {
  const ms = micros / 1000;
  return ms < 1 ? `${ms.toFixed(2)} ms` : `${ms.toFixed(1)} ms`;
}

function fmtTime(epochMicros: number) {
  return new Date(epochMicros / 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function parseRootName(
  rootName: string | null,
): { method: string; path: string } | null {
  if (!rootName) return null;
  const match = rootName.match(
    /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(.+)$/i,
  );
  if (match) return { method: match[1].toUpperCase(), path: match[2] };
  return null;
}

type LatencyRating = "fast" | "normal" | "slow" | "unknown";

function latencyRating(
  durationMs: number,
  p50Ms: number | null,
): LatencyRating {
  if (p50Ms == null || p50Ms === 0) return "unknown";
  if (durationMs < p50Ms) return "fast";
  if (durationMs < p50Ms * 2.5) return "normal";
  return "slow";
}

const RATING_STYLE: Record<
  LatencyRating,
  { bg: string; color: string; label: string }
> = {
  fast: { bg: "#f0fdf4", color: "#16a34a", label: "Fast" },
  normal: { bg: "#fffbeb", color: "#d97706", label: "Normal" },
  slow: { bg: "#fef2f2", color: "#dc2626", label: "Slow" },
  unknown: {
    bg: "var(--color-background)",
    color: "var(--color-text-secondary)",
    label: "â€”",
  },
};

export default function TracesPage() {
  const queryClient = useQueryClient();
  const [serviceName, setServiceName] = useState("");
  const [minDurationMs, setMinDurationMs] = useState<number | "">("");
  const [sinceMinutes, setSinceMinutes] = useState(1440);
  const [selected, setSelected] = useState<string | null>(null);

  useEventSubscription(
    "trace.received",
    () => void queryClient.invalidateQueries({ queryKey: ["traces"] }),
  );

  const { data: services } = useServices();
  const { data: traces, isLoading } = useTraces({
    serviceName: serviceName || undefined,
    minDurationMs: minDurationMs === "" ? undefined : Number(minDurationMs),
    sinceMinutes,
  });
  const { data: trace } = useTrace(selected);
  const { data: perfRows } = usePerformanceRegistry();

  // Drop background task spans (no HTTP method) â€” keep only real API calls
  const httpTraces = useMemo(
    () => (traces ?? []).filter((t) => parseRootName(t.rootName) !== null),
    [traces],
  );

  // Build p50 lookup: "serviceName:METHOD:path" â†’ p50Ms
  const p50Map = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of perfRows ?? []) {
      if (r.p50Ms != null) {
        map.set(
          `${r.serviceName}:${r.httpMethod.toUpperCase()}:${r.path}`,
          r.p50Ms,
        );
      }
    }
    return map;
  }, [perfRows]);

  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    padding: "7px 12px",
    fontSize: 13,
    background: "var(--color-surface)",
    color: "var(--color-text-primary)",
    outline: "none",
  };

  return (
    <div className="space-y-5">
      <div>
        <h1
          className="text-xl font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Request Traces
        </h1>
        <p
          className="text-sm mt-0.5"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Individual API calls received by the services. Click a row to see the
          full span waterfall.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={serviceName}
          onChange={(e) => setServiceName(e.target.value)}
          style={inputStyle}
        >
          <option value="">All services</option>
          {(services ?? []).map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={sinceMinutes}
          onChange={(e) => setSinceMinutes(Number(e.target.value))}
          style={inputStyle}
        >
          <option value={15}>Last 15 min</option>
          <option value={60}>Last 1 hour</option>
          <option value={360}>Last 6 hours</option>
          <option value={1440}>Last 24 hours</option>
        </select>

        <input
          type="number"
          min={0}
          value={minDurationMs}
          placeholder="min ms (filter slow)"
          onChange={(e) =>
            setMinDurationMs(
              e.target.value === "" ? "" : Number(e.target.value),
            )
          }
          style={{ ...inputStyle, width: 160 }}
        />

        {traces && (
          <span
            className="text-sm ml-auto"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {httpTraces.length} trace{httpTraces.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {isLoading && (
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Loadingâ€¦
        </p>
      )}

      {traces && httpTraces.length === 0 && (
        <div
          className="rounded-xl border p-10 text-center text-sm"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text-secondary)",
          }}
        >
          No traces yet, make API calls and Contract Sentinel will receive them
          within seconds.
        </div>
      )}

      {traces && httpTraces.length > 0 && (
        <div
          className="rounded-xl border overflow-hidden"
          style={{
            borderColor: "var(--color-border)",
            background: "var(--color-surface)",
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr
                  style={{
                    color: "var(--color-text-secondary)",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <th className="text-left p-2.5 font-medium">Method</th>
                  <th className="text-left p-2.5 font-medium">Path</th>
                  <th className="text-left p-2.5 font-medium">Service</th>
                  <th className="text-right p-2.5 font-medium">Duration</th>
                  <th className="text-center p-2.5 font-medium">vs p50</th>
                  <th className="text-right p-2.5 font-medium">Spans</th>
                  <th className="text-left p-2.5 font-medium">Time</th>
                  <th className="p-2.5 w-6" />
                </tr>
              </thead>
              <tbody>
                {httpTraces.map((t) => {
                  const parsed = parseRootName(t.rootName);
                  const durationMs = t.totalDurationMicros / 1000;
                  const p50Key = parsed
                    ? `${t.entryService}:${parsed.method}:${parsed.path}`
                    : null;
                  const p50Ms = p50Key ? (p50Map.get(p50Key) ?? null) : null;
                  const rating = latencyRating(durationMs, p50Ms);
                  const ratingStyle = RATING_STYLE[rating];

                  return (
                    <tr
                      key={t.traceId}
                      className="cursor-pointer transition-colors"
                      style={{ borderBottom: "1px solid var(--color-border)" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "var(--color-background)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "")
                      }
                      onClick={() => setSelected(t.traceId)}
                    >
                      {/* Method */}
                      <td className="p-2.5">
                        {parsed ? (
                          <MethodBadge method={parsed.method} />
                        ) : (
                          <span
                            className="font-mono"
                            style={{ color: "var(--color-text-secondary)" }}
                          >
                            {t.rootName?.slice(0, 16) ?? "â€”"}
                          </span>
                        )}
                      </td>

                      {/* Path */}
                      <td
                        className="p-2.5 font-mono max-w-xs truncate"
                        style={{ color: "var(--color-text-primary)" }}
                        title={parsed?.path ?? t.rootName ?? undefined}
                      >
                        {parsed?.path ?? "â€”"}
                      </td>

                      {/* Service */}
                      <td
                        className="p-2.5"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {t.entryService}
                      </td>

                      {/* Duration */}
                      <td
                        className="p-2.5 text-right tabular-nums font-mono"
                        style={{
                          color: t.hasError
                            ? "var(--color-breaking)"
                            : "var(--color-text-primary)",
                        }}
                      >
                        {fmtMs(t.totalDurationMicros)}
                      </td>

                      {/* Latency rating vs p50 */}
                      <td className="p-2.5 text-center">
                        <span
                          className="inline-block text-xs font-medium px-1.5 py-0.5 rounded"
                          style={{
                            background: ratingStyle.bg,
                            color: ratingStyle.color,
                          }}
                          title={
                            p50Ms != null
                              ? `p50 for this endpoint: ${p50Ms.toFixed(1)} ms`
                              : "No baseline yet"
                          }
                        >
                          {ratingStyle.label}
                        </span>
                      </td>

                      {/* Spans */}
                      <td
                        className="p-2.5 text-right tabular-nums"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {t.spanCount}
                      </td>

                      {/* Time */}
                      <td
                        className="p-2.5 tabular-nums"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {fmtTime(t.startEpochMicros)}
                      </td>

                      {/* Error */}
                      <td className="p-2.5">
                        {t.hasError && (
                          <AlertCircle
                            className="w-3.5 h-3.5"
                            style={{ color: "var(--color-breaking)" }}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SlideOver
        open={!!selected}
        title="Trace waterfall"
        subtitle={selected ?? undefined}
        onClose={() => setSelected(null)}
        width={720}
      >
        {trace ? (
          <TraceWaterfall trace={trace} />
        ) : (
          <p
            className="text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Loadingâ€¦
          </p>
        )}
      </SlideOver>
    </div>
  );
}
