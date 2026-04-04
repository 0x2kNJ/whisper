'use client'

import ToolCallCard, { type ToolCallInfo } from './ToolCallCard'

export interface ChatMessageData {
  id: string
  role: 'user' | 'assistant'
  text: string
  toolCalls?: ToolCallInfo[]
  streaming?: boolean
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

    // Regular text — handle bold and newlines
    return part.split('\n').map((line, j, arr) => {
      const formatted = line.split(/(\*\*[^*]+\*\*)/g).map((seg, k) => {
        if (seg.startsWith('**') && seg.endsWith('**')) {
          return (
            <strong key={k} className="font-semibold text-white">
              {seg.slice(2, -2)}
            </strong>
          )
        }
        return seg
      })
      return (
        <span key={`${i}-${j}`}>
          {formatted}
          {j < arr.length - 1 && <br />}
        </span>
      )
    })
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
