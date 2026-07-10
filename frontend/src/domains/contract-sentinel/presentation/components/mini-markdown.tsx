/**
 * A deliberately tiny markdown renderer for agent reports — headings, bold, inline code, bullet and
 * numbered lists, and fenced code blocks. No dependency; anything unrecognised renders as a paragraph.
 */
export function MiniMarkdown({ text }: { text: string }) {
  if (!text) return null
  const lines = text.split("\n")
  const blocks: React.ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let code: string[] | null = null

  const flushList = () => {
    if (!list) return
    const items = list.items.map((it, i) => <li key={i} style={{ marginLeft: 18 }}>{renderInline(it)}</li>)
    blocks.push(
      list.ordered
        ? <ol key={`l${blocks.length}`} className="text-sm my-1 list-decimal" style={{ color: "var(--color-text-primary)" }}>{items}</ol>
        : <ul key={`l${blocks.length}`} className="text-sm my-1 list-disc" style={{ color: "var(--color-text-primary)" }}>{items}</ul>,
    )
    list = null
  }
  const flushCode = () => {
    if (code == null) return
    blocks.push(
      <pre key={`c${blocks.length}`} className="text-xs rounded p-2 my-2 overflow-x-auto"
        style={{ background: "var(--color-background)", color: "var(--color-text-primary)" }}>
        {code.join("\n")}
      </pre>,
    )
    code = null
  }

  for (const raw of lines) {
    if (raw.trim().startsWith("```")) {
      if (code == null) { flushList(); code = [] } else { flushCode() }
      continue
    }
    if (code != null) { code.push(raw); continue }

    const line = raw.trimEnd()
    const heading = line.match(/^(#{1,4})\s+(.*)/)
    if (heading) {
      flushList()
      const level = heading[1].length
      const size = level <= 1 ? 18 : level === 2 ? 15 : 13
      blocks.push(
        <div key={`h${blocks.length}`} className="font-semibold mt-3 mb-1"
          style={{ fontSize: size, color: "var(--color-text-primary)" }}>{renderInline(heading[2])}</div>,
      )
      continue
    }
    const ordered = line.match(/^\s*\d+\.\s+(.*)/)
    const bullet = line.match(/^\s*[-*]\s+(.*)/)
    if (ordered || bullet) {
      const isOrdered = !!ordered
      const item = (ordered ? ordered[1] : bullet![1])
      if (!list || list.ordered !== isOrdered) { flushList(); list = { ordered: isOrdered, items: [] } }
      list.items.push(item)
      continue
    }
    flushList()
    if (line.trim() === "") continue
    blocks.push(
      <p key={`p${blocks.length}`} className="text-sm my-1" style={{ color: "var(--color-text-primary)" }}>
        {renderInline(line)}
      </p>,
    )
  }
  flushList()
  flushCode()
  return <div>{blocks}</div>
}

function renderInline(text: string): React.ReactNode {
  // Split on **bold** and `code` while keeping delimiters.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="px-1 rounded" style={{ background: "var(--color-background)", fontSize: "0.85em" }}>
          {part.slice(1, -1)}
        </code>
      )
    }
    return <span key={i}>{part}</span>
  })
}
