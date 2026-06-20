import { useState } from "react"
import type { AlertChannel, AlertConfigDto, AlertConfigRequest } from "../../infrastructure/api/types"

interface AlertConfigFormProps {
  onSubmit: (data: AlertConfigRequest) => void
  initial?: AlertConfigDto
  onCancel: () => void
}

export function AlertConfigForm({ onSubmit, initial, onCancel }: AlertConfigFormProps) {
  const [name, setName] = useState(initial?.name ?? "")
  const [channel, setChannel] = useState<AlertChannel>(initial?.channel ?? "WEBHOOK")
  const [destination, setDestination] = useState(initial?.destination ?? "")
  const [triggerOnBreaking, setTriggerOnBreaking] = useState(initial?.triggerOnBreaking ?? true)
  const [triggerOnUnreachable, setTriggerOnUnreachable] = useState(initial?.triggerOnUnreachable ?? true)
  const [triggerOnSafe, setTriggerOnSafe] = useState(initial?.triggerOnSafe ?? false)
  const [serviceFilter, setServiceFilter] = useState(initial?.serviceFilter ?? "")
  const [cooldownMinutes, setCooldownMinutes] = useState(initial?.cooldownMinutes ?? 15)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      name,
      channel,
      destination,
      triggerOnBreaking,
      triggerOnUnreachable,
      triggerOnSafe,
      serviceFilter: serviceFilter.trim() || null,
      cooldownMinutes,
    })
  }

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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
          Name
        </label>
        <input
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="My Alert"
          style={inputStyle}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
            Channel
          </label>
          <select
            value={channel}
            onChange={e => setChannel(e.target.value as AlertChannel)}
            style={inputStyle}
          >
            <option value="WEBHOOK">WEBHOOK</option>
            <option value="SLACK">SLACK</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
            Cooldown (minutes)
          </label>
          <input
            type="number"
            min={1}
            value={cooldownMinutes}
            onChange={e => setCooldownMinutes(Number(e.target.value))}
            style={inputStyle}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
          Destination URL
        </label>
        <input
          required
          type="url"
          value={destination}
          onChange={e => setDestination(e.target.value)}
          placeholder="https://hooks.slack.com/... or https://example.com/webhook"
          style={inputStyle}
        />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
          Service Filter (optional — leave blank for all services)
        </label>
        <input
          value={serviceFilter}
          onChange={e => setServiceFilter(e.target.value)}
          placeholder="service-id or blank for all"
          style={inputStyle}
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>Trigger on</p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={triggerOnBreaking}
            onChange={e => setTriggerOnBreaking(e.target.checked)}
          />
          Breaking changes
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={triggerOnUnreachable}
            onChange={e => setTriggerOnUnreachable(e.target.checked)}
          />
          Service unreachable
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={triggerOnSafe}
            onChange={e => setTriggerOnSafe(e.target.checked)}
          />
          Safe changes
        </label>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: "var(--color-primary)" }}
        >
          {initial ? "Update" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium border"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
