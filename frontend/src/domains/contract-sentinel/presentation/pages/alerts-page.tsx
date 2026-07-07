import { useState } from "react"
import { Plus, CheckCircle, XCircle, Edit2, Trash2, Send } from "lucide-react"
import { toast } from "sonner"
import {
  useAlertConfigs,
  useAlertEvents,
  useCreateAlertConfig,
  useUpdateAlertConfig,
  useDeleteAlertConfig,
  useTestAlertConfig,
} from "../hooks/use-alerts"
import { AlertConfigForm } from "../components/alert-config-form"
import type { AlertConfigDto, AlertConfigRequest } from "../../infrastructure/api/types"

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const TRIGGER_ICONS: Record<string, string> = {
  BREAKING_CHANGE: "💥",
  UNREACHABLE: "🔴",
  SAFE_CHANGE: "🟢",
}

export default function AlertsPage() {
  const [showForm, setShowForm] = useState(false)
  const [editingConfig, setEditingConfig] = useState<AlertConfigDto | null>(null)

  const { data: configs, isLoading: configsLoading } = useAlertConfigs()
  const { data: events, isLoading: eventsLoading } = useAlertEvents()
  const createConfig = useCreateAlertConfig()
  const updateConfig = useUpdateAlertConfig()
  const deleteConfig = useDeleteAlertConfig()
  const testConfig = useTestAlertConfig()

  function handleSubmit(data: AlertConfigRequest) {
    if (editingConfig) {
      updateConfig.mutate(
        { id: editingConfig.id, data },
        {
          onSuccess: () => {
            toast.success("Alert configuration updated")
            setEditingConfig(null)
          },
        },
      )
    } else {
      createConfig.mutate(data, {
        onSuccess: () => {
          toast.success("Alert configuration created")
          setShowForm(false)
        },
      })
    }
  }

  function handleDelete(id: string) {
    deleteConfig.mutate(id, {
      onSuccess: () => toast.success("Alert configuration deleted"),
    })
  }

  function handleTest(id: string) {
    testConfig.mutate(id, {
      onSuccess: () => toast.success("Test alert sent"),
    })
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Alerts</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
            Configure notifications for contract drift events.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingConfig(null) }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: "var(--color-primary)" }}
        >
          <Plus className="w-4 h-4" />
          New Alert
        </button>
      </div>

      {/* Form */}
      {(showForm || editingConfig) && (
        <div
          className="rounded-xl border p-5"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text-primary)" }}>
            {editingConfig ? "Edit Alert Configuration" : "New Alert Configuration"}
          </h2>
          <AlertConfigForm
            initial={editingConfig ?? undefined}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditingConfig(null) }}
          />
        </div>
      )}

      {/* Configurations */}
      <section>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
          Alert Configurations
        </h2>
        {configsLoading && (
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Loading...</p>
        )}
        {!configsLoading && (!configs || configs.length === 0) && (
          <div
            className="rounded-xl border p-8 text-center text-sm"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
          >
            No alert configurations yet. Create one to get notified of contract changes.
          </div>
        )}
        {configs && configs.length > 0 && (
          <div className="space-y-3">
            {configs.map(config => (
              <div
                key={config.id}
                className="rounded-xl border p-4 flex items-start justify-between gap-4"
                style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
                      {config.name}
                    </p>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{
                        background: config.enabled ? "var(--color-healthy-bg)" : "var(--color-background)",
                        color: config.enabled ? "var(--color-healthy)" : "var(--color-text-secondary)",
                      }}
                    >
                      {config.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <p className="text-xs truncate" style={{ color: "var(--color-text-secondary)" }}>
                    {config.channel} · {config.destination}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {config.triggerOnBreaking && (
                      <span style={{ color: "var(--color-breaking)" }}>Breaking</span>
                    )}
                    {config.triggerOnUnreachable && (
                      <span style={{ color: "var(--color-unreachable)" }}>Unreachable</span>
                    )}
                    {config.triggerOnSafe && (
                      <span style={{ color: "var(--color-safe)" }}>Safe</span>
                    )}
                    <span style={{ color: "var(--color-text-secondary)" }}>
                      Cooldown: {config.cooldownMinutes}m
                    </span>
                    {config.serviceFilter && (
                      <span style={{ color: "var(--color-text-secondary)" }}>
                        Filter: {config.serviceFilter}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleTest(config.id)}
                    className="p-1.5 rounded hover:opacity-80"
                    title="Send test"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { setEditingConfig(config); setShowForm(false) }}
                    className="p-1.5 rounded hover:opacity-80"
                    title="Edit"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(config.id)}
                    className="p-1.5 rounded hover:opacity-80"
                    title="Delete"
                    style={{ color: "var(--color-breaking)" }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Notifications */}
      <section>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
          Recent Notifications
        </h2>
        {eventsLoading && (
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Loading...</p>
        )}
        {!eventsLoading && (!events || events.length === 0) && (
          <div
            className="rounded-xl border p-8 text-center text-sm"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
          >
            No alert events fired yet.
          </div>
        )}
        {events && events.length > 0 && (
          <div className="space-y-2">
            {events.slice(0, 50).map(event => (
              <div
                key={event.id}
                className="rounded-lg border px-4 py-2.5 flex items-start gap-3"
                style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
              >
                <span className="text-base shrink-0">{TRIGGER_ICONS[event.triggerType] ?? "🔔"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {event.serviceName}
                    </span>
                    <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                      {event.triggerType.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-xs truncate mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                    {event.message}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {event.delivered ? (
                    <CheckCircle className="w-4 h-4" style={{ color: "var(--color-healthy)" }} />
                  ) : (
                    <XCircle className="w-4 h-4" style={{ color: "var(--color-breaking)" }} />
                  )}
                  <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    {timeAgo(event.firedAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
