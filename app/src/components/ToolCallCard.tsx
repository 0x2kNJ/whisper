'use client'

import { useState, useEffect, useRef } from 'react'

export interface ToolCallInfo {
  name: string
  input: Record<string, unknown>
  result: string
  timestamp: number
  duration?: number
  status?: 'running' | 'done' | 'error'
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

const ZK_TOOLS = new Set(['private_transfer', 'private_swap'])

function deriveSummary(name: string, input: Record<string, unknown>, result: string): string | null {
  try {
    const res = JSON.parse(result)
    switch (name) {
      case 'check_balance':
        if (res.balances?.length > 0) {
          return res.balances.map((b: {symbol: string, balance: string}) => `${b.symbol}: ${b.balance}`).join(', ')
        }
        return res.message || 'No balances found'
      case 'private_transfer':
        return `Sent ${input.amount} ${input.token} to ${String(input.recipient).slice(0, 8)}...`
      case 'private_swap':
        return `Swapped ${input.amount} ${input.tokenIn} → ${input.tokenOut}`
      case 'get_quote':
        return res.expectedOutput ? `${input.amount} ${input.tokenIn} → ${res.expectedOutput} ${input.tokenOut}` : null
      case 'deposit_to_unlink':
        return `Deposited ${input.amount} ${input.token} to privacy pool`
      case 'create_escrow':
        return `Escrow created: ${input.amount} ${input.token}`
      case 'schedule_payroll':
        return `Payroll scheduled: ${input.schedule}`
      default:
        return null
    }
  } catch {
    return null
  }
}

function runningLabel(name: string): string {
  if (ZK_TOOLS.has(name)) return 'Generating ZK proof...'
  return 'Executing...'
}

export default function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [inputOpen, setInputOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const isRunning = toolCall.status === 'running'
  const hasInput = Object.keys(toolCall.input).length > 0
  const hasResult = !isRunning && toolCall.result && toolCall.result.length > 0
  const isSuccess = hasResult && toolCall.result.includes('"success":true')
  const isError = hasResult && toolCall.result.includes('"success":false')

  // Parse txHash from result JSON
  let txHash: string | null = null
  if (hasResult) {
    try {
      const parsed = JSON.parse(toolCall.result)
      if (parsed && typeof parsed.txHash === 'string' && parsed.txHash.length > 0) {
        txHash = parsed.txHash
      }
    } catch {
      // result is not JSON — no txHash
    }
  }

  // One-shot success celebration on mount
  useEffect(() => {
    if (isSuccess) {
      setCelebrating(true)
      const t = setTimeout(() => setCelebrating(false), 800)
      return () => clearTimeout(t)
    }
  }, [isSuccess])

  return (
    <div
      ref={cardRef}
      className={`relative animate-slide-up my-2 rounded-lg border overflow-hidden transition-colors duration-500 ${
        isRunning
          ? 'border-[#c8d8ff]/20 bg-[#0a0a0a] animate-pulse'
          : isSuccess
          ? 'border-green-900/50 bg-[#0a0f0a]'
          : isError
          ? 'border-red-900/50 bg-[#0f0a0a]'
          : 'border-[#222] bg-[#0a0a0a]'
      }`}
      style={
        celebrating
          ? { boxShadow: '0 0 20px rgba(74, 222, 128, 0.15)', transition: 'box-shadow 800ms ease-out' }
          : { boxShadow: 'none', transition: 'box-shadow 800ms ease-out' }
      }
    >
      {/* Success radial burst overlay */}
      {celebrating && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            borderRadius: 'inherit',
            background: 'radial-gradient(circle at center, rgba(74,222,128,0.18) 0%, transparent 70%)',
            animation: 'tool-burst 600ms ease-out forwards',
            zIndex: 0,
          }}
        />
      )}
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 relative z-10">
        {isRunning ? (
          <svg className="h-3.5 w-3.5 animate-spin text-[#c8d8ff]/60 shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : isSuccess ? (
          <span className="text-green-400 text-sm" style={{animation: 'checkIn 200ms ease-out forwards'}}>✓</span>
        ) : isError ? (
          <span className="text-red-400 text-sm">✗</span>
        ) : (
          <span className="text-[#c8d8ff]">
            <ToolIcon name={toolCall.name} />
          </span>
        )}
        <span className="text-[#c8d8ff] text-sm font-medium tracking-wide">
          {toolLabel(toolCall.name)}
        </span>
        {isRunning && (
          <span className="text-xs text-[#c8d8ff]/40 font-mono">
            {runningLabel(toolCall.name)}
          </span>
        )}
        <div className="flex-1" />
        {txHash && (
          <a
            href={`https://sepolia.basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono text-zinc-500 hover:text-[#c8d8ff] transition-colors"
          >
            {txHash.slice(0, 6)}...{txHash.slice(-4)} ↗
          </a>
        )}
        {isSuccess && toolCall.duration && (
          <span className="text-[10px] font-mono text-emerald-600">
            Settled in {formatDuration(toolCall.duration)}
          </span>
        )}
        {!isRunning && toolCall.duration !== undefined && (
          <span className="text-xs text-zinc-600 font-mono">
            {formatDuration(toolCall.duration)}
          </span>
        )}
        {!isRunning && (
          <span className="text-xs text-zinc-600">
            {new Date(toolCall.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
        )}
      </div>

      {/* Human-readable summary */}
      {hasResult && (() => {
        const summary = deriveSummary(toolCall.name, toolCall.input, toolCall.result)
        if (!summary) return null
        return (
          <div className="border-t border-[#1a1a1a] px-4 py-2">
            <p className="text-xs text-zinc-400">{summary}</p>
          </div>
        )
      })()}

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
      {isSuccess && ZK_TOOLS.has(toolCall.name) && (
        <div className="border-t border-[#1a1a1a] px-4 py-2">
          <a href="/privacy" className="text-[10px] text-[#c8d8ff]/50 hover:text-[#c8d8ff] transition-colors">
            What does this look like on-chain? →
          </a>
        </div>
      )}
    </div>
  )
}
