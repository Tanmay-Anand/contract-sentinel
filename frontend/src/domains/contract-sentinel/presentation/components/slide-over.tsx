import { useEffect } from "react"
import { X } from "lucide-react"

interface SlideOverProps {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  width?: number
  children: React.ReactNode
}

/** A right-anchored slide-over panel with a backdrop. No external dependency. */
export function SlideOver({ open, title, subtitle, onClose, width = 480, children }: SlideOverProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(15, 15, 38, 0.35)" }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width,
          maxWidth: "100vw",
          background: "var(--color-surface)",
          borderLeft: "1px solid var(--color-border)",
          boxShadow: "-8px 0 24px rgba(0,0,0,0.12)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          className="flex items-start justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="min-w-0">
            <h2 className="text-base font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs mt-0.5 truncate" style={{ color: "var(--color-text-secondary)" }}>
                {subtitle}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100" style={{ color: "var(--color-text-secondary)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>{children}</div>
      </div>
    </div>
  )
}
