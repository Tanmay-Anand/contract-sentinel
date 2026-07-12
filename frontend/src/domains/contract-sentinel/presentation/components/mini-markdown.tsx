/**
 * A deliberately tiny markdown renderer for agent reports â€” headings, bold, inline code,
 * bullet/numbered lists, fenced code blocks, and pipe tables.
 * Pre-processes broken table rows (LLM sometimes inserts newlines inside long cells)
 * and normalises literal <br> tags.
 */
export function MiniMarkdown({ text }: { text: string }) {
  if (!text) return null

  // Normalise literal <br> tags into real newlines
  const normalised = text.replace(/<br\s*\/?>/gi, "\n")
  const rawLines = normalised.split("\n")

  // Pre-process: join fragmented table rows.
  // When the LLM inserts \n inside a table cell, the row is split across lines.
  // If the previous line starts with | but doesn't close with |, absorb the next line.
  const isSep = (l: string) => /^\s*\|[\s\-:|]+\|\s*$/.test(l)
  const lines: string[] = []
  for (const line of rawLines) {
    const prev = lines[lines.length - 1]
    const prevT = prev?.trimEnd() ?? ""
    if (
      prevT.startsWith("|") &&
      !prevT.endsWith("|") &&
      !isSep(prevT) &&
      line.trim() !== "" &&
      !line.trim().startsWith("```") &&
      !line.trim().match(/^#{1,4}\s/)
    ) {
      lines[lines.length - 1] = prevT + " " + line.trim()
    } else {
      lines.push(line)
    }
  }

  const blocks: React.ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let code: string[] | null = null
  let table: string[][] | null = null

  const flushList = () => {
    if (!list) return
    const items = list.items.map((it, i) => (
      <li key={i} style={{ marginLeft: 0, paddingLeft: 4, marginBottom: 3 }}>
        {renderInline(it)}
      </li>
    ))
    blocks.push(
      list.ordered
        ? <ol key={`l${blocks.length}`} style={{ paddingLeft: 20, margin: "6px 0", color: "var(--color-text-primary)", fontSize: 13, lineHeight: 1.6 }}>{items}</ol>
        : <ul key={`l${blocks.length}`} style={{ paddingLeft: 20, margin: "6px 0", color: "var(--color-text-primary)", fontSize: 13, lineHeight: 1.6, listStyleType: "disc" }}>{items}</ul>,
    )
    list = null
  }

  const flushCode = () => {
    if (code == null) return
    blocks.push(
      <pre key={`c${blocks.length}`} style={{
        background: "var(--color-background)",
        color: "var(--color-text-primary)",
        fontSize: 12,
        borderRadius: 6,
        padding: "10px 12px",
        margin: "8px 0",
        overflowX: "auto",
        border: "1px solid var(--color-border)",
        lineHeight: 1.5,
      }}>
        {code.join("\n")}
      </pre>,
    )
    code = null
  }

  const flushTable = () => {
    if (!table || table.length === 0) return
    const [head, ...body] = table
    blocks.push(
      <div key={`t${blocks.length}`} style={{ margin: "10px 0", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead>
            <tr>
              {head.map((cell, i) => (
                <th key={i} style={{
                  textAlign: "left",
                  fontWeight: 600,
                  padding: "7px 12px",
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface-muted)",
                  color: "var(--color-text-primary)",
                  whiteSpace: "nowrap",
                  fontSize: 11,
                  letterSpacing: "0.02em",
                }}>
                  {renderInline(cell.trim())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? "transparent" : "var(--color-background)" }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{
                    padding: "7px 12px",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-primary)",
                    verticalAlign: "top",
                    lineHeight: 1.55,
                    fontSize: 12,
                  }}>
                    {renderInline(cell.trim())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    )
    table = null
  }

  const isTableRow = (line: string) => /^\s*\|.+\|\s*$/.test(line)
  const isSeparatorRow = (line: string) => isSep(line)
  const parseTableRow = (line: string) =>
    line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|")

  for (const raw of lines) {
    if (raw.trim().startsWith("```")) {
      if (code == null) { flushList(); flushTable(); code = [] } else { flushCode() }
      continue
    }
    if (code != null) { code.push(raw); continue }

    if (isTableRow(raw)) {
      if (isSeparatorRow(raw)) continue
      flushList()
      if (!table) table = []
      table.push(parseTableRow(raw))
      continue
    }
    flushTable()

    const line = raw.trimEnd()
    const heading = line.match(/^(#{1,4})\s+(.*)/)
    if (heading) {
      flushList()
      const level = heading[1].length
      const styles: Record<number, { fontSize: number; marginTop: number }> = {
        1: { fontSize: 16, marginTop: 16 },
        2: { fontSize: 14, marginTop: 14 },
        3: { fontSize: 13, marginTop: 10 },
        4: { fontSize: 12, marginTop: 8 },
      }
      const s = styles[level] ?? styles[4]
      blocks.push(
        <div key={`h${blocks.length}`} style={{
          fontWeight: 700,
          fontSize: s.fontSize,
          marginTop: s.marginTop,
          marginBottom: 4,
          color: "var(--color-text-primary)",
          borderBottom: level <= 2 ? "1px solid var(--color-border)" : "none",
          paddingBottom: level <= 2 ? 4 : 0,
        }}>
          {renderInline(heading[2])}
        </div>,
      )
      continue
    }

    const ordered = line.match(/^\s*\d+\.\s+(.*)/)
    const bullet = line.match(/^\s*[-*â€¢]\s+(.*)/)
    if (ordered || bullet) {
      const isOrdered = !!ordered
      const item = ordered ? ordered[1] : bullet![1]
      if (!list || list.ordered !== isOrdered) { flushList(); list = { ordered: isOrdered, items: [] } }
      list.items.push(item)
      continue
    }

    flushList()
    if (line.trim() === "") {
      // Emit a small spacer between blocks
      if (blocks.length > 0) blocks.push(<div key={`sp${blocks.length}`} style={{ height: 4 }} />)
      continue
    }

    blocks.push(
      <p key={`p${blocks.length}`} style={{
        fontSize: 13,
        margin: "4px 0",
        color: "var(--color-text-primary)",
        lineHeight: 1.6,
      }}>
        {renderInline(line)}
      </p>,
    )
  }
  flushList()
  flushCode()
  flushTable()
  return <div style={{ lineHeight: 1.6 }}>{blocks}</div>
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ fontWeight: 600 }}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} style={{
          background: "var(--color-background)",
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          padding: "0 4px",
          fontSize: "0.82em",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          color: "var(--color-primary)",
        }}>
          {part.slice(1, -1)}
        </code>
      )
    }
    return <span key={i}>{part}</span>
  })
}
