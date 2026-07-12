import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"

interface SlideOverProps {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  width?: number
  children: React.ReactNode
}

const MIN_WIDTH = 360
const MAX_WIDTH = window.innerWidth * 0.9

/** A right-anchored slide-over panel with a backdrop and a draggable left edge. */
export function SlideOver({ open, title, subtitle, onClose, width: initialWidth = 480, children }: SlideOverProps) {
  const [width, setWidth] = useState(initialWidth)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  // Reset width when panel opens with a new initialWidth
  useEffect(() => { if (open) setWidth(initialWidth) }, [open, initialWidth])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = startX.current - e.clientX
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW.current + delta)))
    }
    const onUp = () => { dragging.current = false; document.body.style.cursor = "" }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startW.current = width
    document.body.style.cursor = "ew-resize"
  }

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
        {/* Drag handle */}
        <div
          onMouseDown={onDragStart}
          style={{
            position: "absolute",
            top: 0,
            left: -4,
            width: 8,
            height: "100%",
            cursor: "ew-resize",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 3,
              height: 40,
              borderRadius: 2,
              background: "var(--color-border)",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--color-primary)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--color-border)")}
          />
        </div>

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
