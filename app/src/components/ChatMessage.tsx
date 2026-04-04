'use client'

import ToolCallCard, { type ToolCallInfo } from './ToolCallCard'

export interface ChatMessageData {
  id: string
  role: 'user' | 'assistant'
  text: string
  toolCalls?: ToolCallInfo[]
  streaming?: boolean
}

/** Format inline text: bold, links, newlines */
function formatInline(text: string, keyPrefix: string): React.ReactNode {
  if (!text) return null
  return text.split('\n').map((line, j, arr) => {
    // Parse bold + links
    const formatted = line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((seg, k) => {
      if (seg.startsWith('**') && seg.endsWith('**')) {
        return <strong key={k} className="font-semibold text-white">{seg.slice(2, -2)}</strong>
      }
      // Markdown link: [text](url)
      const linkMatch = seg.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (linkMatch) {
        return (
          <a key={k} href={linkMatch[2]} className="text-[#c8d8ff] hover:underline transition-colors">
            {linkMatch[1]}
          </a>
        )
      }
      return seg
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

    // Check if this chunk contains a markdown table
    const lines = part.split('\n')
    const tableStart = lines.findIndex((l) => l.trim().startsWith('|') && l.trim().endsWith('|'))
    if (tableStart >= 0) {
      // Find table extent
      const tableLines: string[] = []
      const beforeLines: string[] = lines.slice(0, tableStart)
      let idx = tableStart
      while (idx < lines.length && lines[idx].trim().startsWith('|')) {
        tableLines.push(lines[idx])
        idx++
      }
      const afterLines = lines.slice(idx)

      // Parse table
      const headerRow = tableLines[0]?.split('|').filter(Boolean).map((c) => c.trim()) || []
      const dataRows = tableLines.slice(2).map((row) => row.split('|').filter(Boolean).map((c) => c.trim()))

      return (
        <span key={i}>
          {beforeLines.length > 0 && formatInline(beforeLines.join('\n'), `${i}-before`)}
          <table className="my-2 w-full text-xs border-collapse">
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
                      {formatInline(cell, `${i}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {afterLines.length > 0 && formatInline(afterLines.join('\n'), `${i}-after`)}
        </span>
      )
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
