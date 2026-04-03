'use client'

import { useState } from 'react'

export interface ToolCallInfo {
  name: string
  input: Record<string, unknown>
  result: string
  timestamp: number
  duration?: number
}

/** Icon map per tool name */
function ToolIcon({ name }: { name: string }) {
  const icons: Record<string, string> = {
    check_balance: '◈',
    get_quote: '◎',
    private_transfer: '→',
    private_swap: '⇄',
    deposit_to_unlink: '↓',
    create_escrow: '⊡',
    schedule_payroll: '◷',
    check_escrow: '◉',
  }
  return <span className="font-mono text-sm">{icons[name] ?? '◆'}</span>
}

/** Human-readable label per tool name */
function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    check_balance: 'Check Balance',
    get_quote: 'Get Quote',
    private_transfer: 'Private Transfer',
    private_swap: 'Private Swap',
    deposit_to_unlink: 'Deposit to Unlink',
    create_escrow: 'Create Escrow',
    schedule_payroll: 'Schedule Payroll',
    check_escrow: 'Check Escrow',
  }
  return labels[name] ?? name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDuration(ms?: number): string {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

interface ToolCallCardProps {
  toolCall: ToolCallInfo
}

export default function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [inputOpen, setInputOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)

  const hasInput = Object.keys(toolCall.input).length > 0
  const hasResult = toolCall.result && toolCall.result.length > 0

  return (
    <div className="animate-slide-up my-2 rounded-lg border border-[#222] bg-[#0a0a0a] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-[#c8d8ff]">
          <ToolIcon name={toolCall.name} />
        </span>
        <span className="text-[#c8d8ff] text-sm font-medium tracking-wide">
          {toolLabel(toolCall.name)}
        </span>
        <div className="flex-1" />
        {toolCall.duration !== undefined && (
          <span className="text-xs text-zinc-600 font-mono">
            {formatDuration(toolCall.duration)}
          </span>
        )}
        <span className="text-xs text-zinc-600">
          {new Date(toolCall.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </span>
      </div>

      {/* Input section */}
      {hasInput && (
        <div className="border-t border-[#1a1a1a]">
          <button
            onClick={() => setInputOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            <span className="font-mono">{inputOpen ? '▾' : '▸'}</span>
            <span>Input params</span>
          </button>
          {inputOpen && (
            <div className="px-4 pb-3">
              <pre className="text-xs font-mono text-zinc-400 leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(toolCall.input, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Result section */}
      {hasResult && (
        <div className="border-t border-[#1a1a1a]">
          <button
            onClick={() => setResultOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            <span className="font-mono">{resultOpen ? '▾' : '▸'}</span>
            <span>Result</span>
          </button>
          {resultOpen && (
            <div className="px-4 pb-3">
              <pre className="text-xs font-mono text-zinc-400 leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(toolCall.result), null, 2)
                  } catch {
                    return toolCall.result
                  }
                })()}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
