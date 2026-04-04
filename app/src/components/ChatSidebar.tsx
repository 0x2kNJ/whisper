'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import AnimatedBalance from './AnimatedBalance'

export interface ConversationSummary {
  id: string
  title: string
  created_at: number
  updated_at: number
  txCount?: number
  usdcMoved?: number
}

export interface BalanceInfo {
  symbol: string
  balance: string
  chain: string
  tokenAddress: string
  explorerUrl: string | null
}

interface ChatSidebarProps {
  conversations: ConversationSummary[]
  activeConversationId: string | null
  onNewChat: () => void
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
  balances: BalanceInfo[]
  wallet: string | null
  balancesLoading: boolean
  isOpen: boolean
  onClose: () => void
}

function groupByDate(conversations: ConversationSummary[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400000
  const sevenDaysAgo = today - 7 * 86400000

  const groups: { label: string; items: ConversationSummary[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 Days', items: [] },
    { label: 'Older', items: [] },
  ]

  for (const conv of conversations) {
    if (conv.updated_at >= today) {
      groups[0].items.push(conv)
    } else if (conv.updated_at >= yesterday) {
      groups[1].items.push(conv)
    } else if (conv.updated_at >= sevenDaysAgo) {
      groups[2].items.push(conv)
    } else {
      groups[3].items.push(conv)
    }
  }

  return groups.filter((g) => g.items.length > 0)
}

export default function ChatSidebar({
  conversations,
  activeConversationId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  balances,
  wallet,
  balancesLoading,
  isOpen,
  onClose,
}: ChatSidebarProps) {
  const groups = useMemo(() => groupByDate(conversations), [conversations])

  const prevBalancesRef = useRef<BalanceInfo[]>([])
  const initialLoadRef = useRef(true)
  const [deltas, setDeltas] = useState<Record<string, { amount: string; direction: 'up' | 'down' }>>({})

  useEffect(() => {
    const prev = prevBalancesRef.current
    // Skip delta calculation on initial load(s)
    if (initialLoadRef.current) {
      if (balances.length > 0) {
        prevBalancesRef.current = balances
        initialLoadRef.current = false
      }
      return
    }
    if (prev.length > 0 && balances.length > 0) {
      const newDeltas: Record<string, { amount: string; direction: 'up' | 'down' }> = {}
      for (const b of balances) {
        const old = prev.find((p) => p.symbol === b.symbol && p.chain === b.chain)
        if (old && old.balance !== b.balance) {
          const diff = parseFloat(b.balance) - parseFloat(old.balance)
          if (diff !== 0) {
            newDeltas[`${b.symbol}-${b.chain}`] = {
              amount: `${diff > 0 ? '+' : ''}${diff.toFixed(diff < 1 && diff > -1 ? 4 : 2)}`,
              direction: diff > 0 ? 'up' : 'down',
            }
          }
        }
      }
      if (Object.keys(newDeltas).length > 0) {
        setDeltas(newDeltas)
        setTimeout(() => setDeltas({}), 3000)
      }
    }
    prevBalancesRef.current = balances
  }, [balances])

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Header: Logo + New Chat */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/[0.06]">
        <Link href="/dashboard" className="flex items-center gap-2.5 group" title="Back to Dashboard">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[#333] bg-[#0a0a0a] text-[10px] font-bold tracking-widest text-[#c8d8ff] group-hover:border-[#c8d8ff]/30 transition-colors" style={{boxShadow: '0 0 15px rgba(200,216,255,0.08)'}}>
            W
          </div>
          <span className="text-sm font-semibold tracking-wide text-white">Whisper</span>
        </Link>
        <span className="ml-auto rounded bg-[#0a0a0a] border border-[#222] px-1.5 py-0.5 text-[9px] font-mono text-zinc-600 tracking-widest uppercase">
          testnet
        </span>
      </div>

      {/* New Chat button */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <button
          onClick={() => { onNewChat(); onClose() }}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-[#c8d8ff] transition-all hover:bg-[rgba(200,216,255,0.06)] hover:border-[#c8d8ff]/20"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <svg className="h-6 w-6 text-[#c8d8ff]/20 animate-pulse-slow" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
            <span className="text-zinc-700 text-[10px]">No conversations yet</span>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-3">
              <div className="px-2 mb-1.5 text-[10px] uppercase tracking-widest text-zinc-600">
                {group.label}
              </div>
              {group.items.map((conv) => (
                <div key={conv.id} className="group relative">
                  <button
                    onClick={() => { onSelectConversation(conv.id); onClose() }}
                    className={`w-full text-left rounded-lg px-3 py-2 text-xs truncate history-item ${
                      conv.id === activeConversationId
                        ? 'history-item-active text-zinc-200'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {conv.title}
                  </button>
                  {conv.txCount && conv.txCount > 0 ? (
                    <div className="px-3 -mt-1 mb-1 text-[9px] text-zinc-600 font-mono">
                      {conv.txCount} txn{conv.txCount > 1 ? 's' : ''}
                      {conv.usdcMoved ? ` · ${conv.usdcMoved.toFixed(2)} USDC` : ''}
                    </div>
                  ) : null}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteConversation(conv.id) }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-opacity text-xs p-1"
                    title="Delete conversation"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Balances Section */}
      <div className="border-t border-white/[0.06] px-4 py-3">
        {/* ZK Shield Badge */}
        <div className="zk-badge rounded-lg px-3 py-1.5 mb-3 flex items-center gap-2">
          <svg className="h-3 w-3 text-[#c8d8ff]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          <span className="text-[10px] font-medium text-[#c8d8ff] tracking-wide">Shielded via ZK Proofs</span>
        </div>

        {/* Wallet address */}
        {wallet && (
          <div className="mb-3">
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">Private Wallet</div>
            <div className="font-mono text-[11px] text-zinc-400">{wallet.slice(0, 6)}...{wallet.slice(-4)}</div>
            <div className="mt-1 flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-zinc-600">Connected</span>
            </div>
          </div>
        )}

        {/* Balance cards */}
        <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">
          Private Balances
        </div>
        <div className="flex flex-col gap-2">
          {balancesLoading && balances.length === 0 ? (
            <div className="flex items-center justify-center py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-[#c8d8ff]" />
            </div>
          ) : (
            balances.map((b, i) => {
              const card = (
                <div className="glass-card rounded-lg px-3 py-2.5 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">{b.symbol}</span>
                    <AnimatedBalance value={b.balance} className="text-xs font-mono text-zinc-300 balance-glow" />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium text-zinc-400 tracking-wide">
                      {b.chain}
                    </span>
                    {/* Delta indicator */}
                    {deltas[`${b.symbol}-${b.chain}`] && (
                      <span className={`ml-auto text-[10px] font-mono animate-fade-in ${
                        deltas[`${b.symbol}-${b.chain}`].direction === 'up' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {deltas[`${b.symbol}-${b.chain}`].amount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-1">
                      <div className="h-1 w-1 rounded-full bg-[#c8d8ff] animate-pulse opacity-50" />
                      <span className="text-[9px] text-[#c8d8ff]/50">ZK Shielded</span>
                    </div>
                    <span className="text-[8px] font-mono text-zinc-700">
                      {b.tokenAddress.slice(0, 6)}...{b.tokenAddress.slice(-4)}
                    </span>
                  </div>
                </div>
              )

              if (b.explorerUrl) {
                return (
                  <a key={i} href={b.explorerUrl} target="_blank" rel="noopener noreferrer" className="block">
                    {card}
                  </a>
                )
              }
              return <div key={i}>{card}</div>
            })
          )}
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[280px] shrink-0 flex-col glass-sidebar">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <aside className="absolute left-0 top-0 bottom-0 w-[280px] flex flex-col glass-sidebar animate-slide-in-left">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}
