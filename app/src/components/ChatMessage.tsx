'use client'

import ToolCallCard, { type ToolCallInfo } from './ToolCallCard'

export interface ChatMessageData {
  id: string
  role: 'user' | 'assistant'
  text: string
  toolCalls?: ToolCallInfo[]
  streaming?: boolean
}

/** Turn a 0x hash (full or truncated like 0x101d...6094) into an explorer link. */
function autoLinkHash(text: string, key: number): React.ReactNode {
  // Split on full hashes (0x + 64 hex chars) and truncated hashes (0x + hex + ... + hex)
  const parts = text.split(/(0x[a-fA-F0-9]{6,64}(?:…|\.\.\.)[a-fA-F0-9]{4,}|0x[a-fA-F0-9]{64})/g)
  if (parts.length === 1) return text

  return parts.map((part, i) => {
    // Full hash
    if (/^0x[a-fA-F0-9]{64}$/.test(part)) {
      return (
        <a key={`${key}-hash-${i}`} href={`https://sepolia.basescan.org/tx/${part}`} target="_blank" rel="noopener noreferrer" className="text-[#c8d8ff] hover:underline transition-colors font-mono text-[0.9em]">
          {part.slice(0, 6)}…{part.slice(-4)} ↗
        </a>
      )
    }
    // Truncated hash like 0x101d...6094
    if (/^0x[a-fA-F0-9]{4,}(?:…|\.\.\.)[a-fA-F0-9]{4,}$/.test(part)) {
      return (
        <a key={`${key}-hash-${i}`} href="https://sepolia.basescan.org/address/0x647f9b99af97e4b79DD9Dd6de3b583236352f482" target="_blank" rel="noopener noreferrer" className="text-[#c8d8ff] hover:underline transition-colors font-mono text-[0.9em]">
          {part} ↗
        </a>
      )
    }
    return part
  })
}

/** Format inline text: bold, links, tx hashes, newlines */
function formatInline(text: string, keyPrefix: string): React.ReactNode {
  if (!text) return null
  return text.split('\n').map((line, j, arr) => {
    // Parse bold + links
    const formatted = line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((seg, k) => {
      if (seg.startsWith('**') && seg.endsWith('**')) {
        const innerText = seg.slice(2, -2)
        // Check if the bold content is a markdown link: **[text](url)**
        const innerLink = innerText.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (innerLink) {
          return (
            <strong key={k} className="font-semibold text-white">
              <a href={innerLink[2]} target="_blank" rel="noopener noreferrer" className="text-[#c8d8ff] hover:underline transition-colors">
                {innerLink[1]}
              </a>
            </strong>
          )
        }
        return <strong key={k} className="font-semibold text-white">{innerText}</strong>
      }
      // Markdown link: [text](url)
      const linkMatch = seg.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (linkMatch) {
        return (
          <a key={k} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-[#c8d8ff] hover:underline transition-colors">
            {linkMatch[1]}
          </a>
        )
      }
      // Auto-link 0x hashes
      return autoLinkHash(seg, k)
    })
    return (
      <span key={`${keyPrefix}-${j}`}>
        {formatted}
        {j < arr.length - 1 && <br />}
      </span>
    )
  })
}

function formatText(text: string): React.ReactNode {
  if (!text) return null

  // Split on code blocks first
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`)/g)

  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const lines = part.slice(3, -3).split('\n')
      const lang = lines[0]?.trim() ?? ''
      const code = lines.slice(lang ? 1 : 0).join('\n')
      return (
        <pre
          key={i}
          className="my-2 overflow-x-auto rounded-md border border-[#222] bg-[#0a0a0a] px-4 py-3 text-xs font-mono text-zinc-300"
        >
          {lang && (
            <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-600">
              {lang}
            </div>
          )}
          <code>{code}</code>
        </pre>
      )
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="rounded bg-[#1a1a1a] border border-[#333] px-1 py-0.5 text-[0.85em] font-mono text-[#c8d8ff]"
        >
          {part.slice(1, -1)}
        </code>
      )
    }

    // Parse all markdown tables in this chunk (handles multiple tables)
    // Pre-process: if a line contains text followed by a pipe-table, split them
    const rawLines = part.split('\n')
    const lines: string[] = []
    for (const raw of rawLines) {
      // Detect "some text.| Header | ..." pattern — split before the table
      const tableInline = raw.match(/^(.+?)\s*(\|[^|]+\|.*)$/)
      if (tableInline && !raw.trim().startsWith('|')) {
        lines.push(tableInline[1])
        lines.push(tableInline[2])
      } else {
        lines.push(raw)
      }
    }

    const segments: React.ReactNode[] = []
    let textBuf: string[] = []
    let lineIdx = 0

    while (lineIdx < lines.length) {
      const line = lines[lineIdx]
      const trimmed = line.trim()
      if (trimmed.startsWith('|') && trimmed.includes('|', 1)) {
        // Flush text buffer
        if (textBuf.length > 0) {
          segments.push(formatInline(textBuf.join('\n'), `${i}-text-${lineIdx}`))
          textBuf = []
        }
        // Collect table lines
        const tableLines: string[] = []
        while (lineIdx < lines.length && lines[lineIdx].trim().startsWith('|')) {
          tableLines.push(lines[lineIdx])
          lineIdx++
        }
        // Need at least header + separator + 1 data row
        if (tableLines.length >= 3) {
          const headerRow = tableLines[0]?.split('|').filter(Boolean).map((c) => c.trim()) || []
          const dataRows = tableLines.slice(2).map((row) => row.split('|').filter(Boolean).map((c) => c.trim()))
          segments.push(
            <table key={`${i}-table-${lineIdx}`} className="my-3 w-full text-xs border-collapse">
              <thead>
                <tr>
                  {headerRow.map((h, hi) => (
                    <th key={hi} className="text-left text-zinc-500 font-medium px-2 py-1.5 border-b border-[#222]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="text-zinc-300 px-2 py-1.5 border-b border-[#1a1a1a]">
                        {formatInline(cell, `${i}-${lineIdx}-${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        } else {
          // Not a valid table, treat as text
          textBuf.push(...tableLines)
        }
      } else {
        textBuf.push(line)
        lineIdx++
      }
    }
    if (textBuf.length > 0) {
      segments.push(formatInline(textBuf.join('\n'), `${i}-tail`))
    }
    if (segments.length > 0) {
      return <span key={i}>{segments}</span>
    }

    // Regular text — handle bold, links, and newlines
    return formatInline(part, String(i))
  })
}

interface ChatMessageProps {
  message: ChatMessageData
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-[#1a1a1a] border border-[#2a2a2a] px-4 py-3 text-sm text-white leading-relaxed">
          {message.text}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 animate-slide-up">
      {/* Tool calls appear first (before final text) */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="flex flex-col gap-1">
          {message.toolCalls.map((tc, i) => (
            <ToolCallCard key={`${tc.name}-${tc.timestamp}-${i}`} toolCall={tc} />
          ))}
        </div>
      )}

      {/* Assistant text */}
      {message.text && (
        <div className="flex items-start gap-3">
          {/* Whisper avatar */}
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#333] bg-[#0a0a0a] text-[10px] font-bold tracking-widest text-[#c8d8ff]">
            W
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-zinc-200 leading-relaxed message-content">
              {formatText(message.text)}
            </div>
            {message.streaming && (
              <span className="inline-block h-3 w-0.5 ml-0.5 bg-[#c8d8ff] animate-pulse" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
