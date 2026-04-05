'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import StatsRow from '@/components/StatsRow'
import PositionCard from '@/components/PositionCard'
import ActivityFeed from '@/components/ActivityFeed'
import QuickActions from '@/components/QuickActions'
import ChatSidecar from '@/components/ChatSidecar'
import AnimatedBalance from '@/components/AnimatedBalance'
import { useDashboard } from '@/components/DashboardContext'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Stats {
  totalMoved: number
  transactionCount: number
  transactionBreakdown: string
  activePositions: number
  activeBreakdown: string
  privacyScore: number
}

interface Position {
  id: string
  name: string
  type: 'standard' | 'vesting' | 'performance' | 'contractor'
  status: 'active' | 'paused' | 'completed'
  recipients: { name: string; address: string; amount: string }[]
  token: string
  schedule: string
  privacyLevel: string
  totalBudget: string
  spent: string
  progress: number
  executionCount: number
  lastExecutedAt: number | null
  createdAt: number
}

interface ActivityItem {
  id: string
  type: 'transfer' | 'payroll' | 'escrow' | 'verification' | 'swap' | 'deposit'
  title: string
  detail: string
  amount?: string
  token?: string
  timestamp: number
  status: 'success' | 'failed' | 'pending'
  txHash?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [positions, setPositions] = useState<Position[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [balance, setBalance] = useState<string>('0.00')
  const [allBalances, setAllBalances] = useState<Array<{ symbol: string; balance: string }>>([])
  const [walletAddr, setWalletAddr] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  // Chat sidecar state from context (shared with layout/IconRail)
  const { chatOpen, chatPrompt, chatWidth, autoSend, openChat, sendChat, closeChat, setChatWidth } = useDashboard()

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(t)
    }
  }, [toast])

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      const [positionsRes, activityRes, balancesRes] = await Promise.all([
        fetch('/api/positions').then(r => r.json()).catch(() => ({ positions: [] })),
        fetch('/api/activity?limit=20').then(r => r.json()).catch(() => ({ items: [] })),
        fetch('/api/balances').then(r => r.json()).catch(() => null),
      ])

      if (positionsRes?.positions) setPositions(positionsRes.positions)
      if (activityRes?.items) setActivity(activityRes.items)

      if (balancesRes?.balances) {
        setAllBalances(balancesRes.balances)
        const usdc = balancesRes.balances.find(
          (b: { symbol: string }) => b.symbol === 'USDC'
        )
        if (usdc) setBalance(usdc.balance)
      }
      if (balancesRes?.wallet) setWalletAddr(balancesRes.wallet)
    } catch {
      // Silently fail — dashboard shows loading/empty states
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Polling interval ref for post-tool-completion refresh
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Listen for tool completions from the sidecar
  const handleToolComplete = useCallback((toolName: string) => {
    const labels: Record<string, string> = {
      private_transfer: '✓ Transfer sent — ZK-shielded',
      batch_private_transfer: '✓ Batch transfer complete — ZK-shielded',
      private_swap: '✓ Swap executed — ZK-shielded',
      create_escrow: '✓ Smart escrow created — conditions locked',
      schedule_payroll: '✓ Payroll scheduled',
      create_strategy: '✓ Strategy created',
      run_cross_chain_payroll: '✓ Cross-chain payroll complete',
      verify_payment_proof: '✓ Income proof generated',
      deposit_to_unlink: '✓ Deposited to Unlink vault',
      private_cross_chain_transfer: '✓ Bridged to Arc — sender hidden',
      check_balance: '',
    }
    const label = labels[toolName]
    if (label !== undefined) {
      if (label) setToast(label)
      // Immediate fetch for positions/activity, then poll every 4s for 20s
      // to catch Unlink relay propagation (balance changes can take 5-30s)
      fetchData()
      if (pollRef.current) clearInterval(pollRef.current)
      let elapsed = 0
      pollRef.current = setInterval(() => {
        elapsed += 4000
        fetchData()
        if (elapsed >= 20000) {
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
        }
      }, 4000)
    }
  }, [fetchData])

  // Quick action handler — open chat with pre-filled prompt
  const handleAction = (prompt: string) => {
    openChat(prompt)
  }

  // Map positions to card props
  const mapPositionType = (pos: Position) => {
    if (pos.status === 'completed') return 'completed' as const
    if (pos.type === 'standard' || pos.type === 'contractor') return 'payroll' as const
    if (pos.type === 'vesting') return 'escrow' as const
    return 'payroll' as const
  }

  const truncateAddr = (addr: string) => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen overflow-y-auto relative">
      {/* Ambient background — matches chat/landing atmosphere */}
      <div className="chat-hero-bg" />
      <div className="chat-ambient">
        <div className="chat-ambient-orb3" />
      </div>
      <div className="chat-noise" />
      <div className="chat-grid" />

      {/* Content */}
      <div className="relative z-[2] flex flex-col flex-1">
        {/* Top Bar */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 px-4 sm:px-7 pt-5 pb-2">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-[22px] font-semibold text-white">Private Treasury Manager</h1>
              <span className="text-[10px] text-zinc-600">powered by Unlink</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
              <span>{formatDate()}</span>
              <span className="text-[#222]">·</span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                Base Sepolia
              </span>
              <span className="text-[#222]">·</span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                Arc Testnet
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-widest text-[rgba(200,216,255,0.7)] bg-[rgba(200,216,255,0.08)] border border-[rgba(200,216,255,0.15)] rounded-md px-2.5 py-1">
              testnet
            </span>
            <div className="flex items-center gap-2.5 bg-[rgba(200,216,255,0.06)] border border-[rgba(200,216,255,0.12)] rounded-[10px] px-4 py-2 shadow-[0_0_20px_rgba(200,216,255,0.08)] backdrop-blur-sm">
              <span className="text-[rgba(200,216,255,0.6)] text-sm">◈</span>
              <span className="text-[15px] font-semibold text-white tabular-nums">
                <AnimatedBalance value={balance} />
              </span>
              <span className="text-[11px] text-zinc-500">USDC</span>
              {walletAddr && (
                <span className="text-[10px] text-zinc-500 font-mono">
                  {truncateAddr(walletAddr)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="px-4 sm:px-7 pb-5 pt-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">Quick Actions</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(200,216,255,0.06)] text-[rgba(200,216,255,0.5)] border border-[rgba(200,216,255,0.1)]">All private via Unlink</span>
          </div>
          <QuickActions onAction={handleAction} />
        </div>

        {/* Treasury Allocation */}
        <StatsRow
          balances={allBalances}
          loading={loading}
          onRebalance={() => sendChat('Rebalance treasury to 80% USDC / 20% WETH')}
        />

        {/* Active Positions */}
        <div className="flex justify-between items-center px-4 sm:px-7 mb-3">
          <h2 className="text-[13px] font-medium uppercase tracking-[1.5px] text-zinc-500">
            Active Positions
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 px-4 sm:px-7 pb-6">
          {loading ? (
            <>
              <div className="shimmer h-[180px] rounded-[14px]" />
              <div className="shimmer h-[180px] rounded-[14px]" />
              <div className="shimmer h-[180px] rounded-[14px]" />
            </>
          ) : positions.length > 0 ? (
            positions.slice(0, 3).map((pos) => (
              <PositionCard
                key={pos.id}
                id={pos.id}
                type={mapPositionType(pos)}
                title={pos.name}
                subtitle={`${pos.recipients.length} recipient${pos.recipients.length !== 1 ? 's' : ''} · ${pos.schedule} · ${pos.privacyLevel === 'private' ? 'Private' : 'Public'}`}
                status={pos.status === 'active' ? '● Running' : pos.status === 'paused' ? '⏸ Paused' : '✓ Completed'}
                progress={pos.progress}
                progressLabel={pos.totalBudget ? `$${pos.spent} of $${pos.totalBudget} budget spent` : undefined}
                recipients={pos.recipients.map(r => ({ name: r.name || r.address.slice(0, 6) }))}
                verifyLinks={pos.recipients.filter(r => r.name).map(r => ({
                  name: r.name,
                  href: `/verify/${r.name.toLowerCase()}.whisper.eth`,
                }))}
                footer={pos.lastExecutedAt ? `Last run: ${new Date(pos.lastExecutedAt).toLocaleDateString()}` : `Created: ${new Date(pos.createdAt).toLocaleDateString()}`}
                onClick={() => handleAction(`Tell me about the ${pos.name} strategy`)}
                onClose={async (id) => {
                  await fetch(`/api/positions/${id}`, { method: 'DELETE' })
                  setPositions((prev) => prev.filter((p) => p.id !== id))
                }}
              />
            ))
          ) : (
            <div className="col-span-3 text-center py-12">
              <div className="text-2xl mb-2 opacity-30">◈</div>
              <p className="text-zinc-500 text-sm">No active positions yet.</p>
              <p className="text-zinc-600 text-xs mt-1">Use the chat to create payrolls, escrows, or verify income.</p>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="flex justify-between items-center px-4 sm:px-7 mb-3">
          <h2 className="text-[13px] font-medium uppercase tracking-[1.5px] text-zinc-500">
            Recent Activity
          </h2>
        </div>

        <div className="px-4 sm:px-7 pb-8">
          <ActivityFeed items={activity} loading={loading} />
        </div>

        {/* Footer */}
        <div className="mt-auto px-4 sm:px-7 pb-4">
          <p className="text-center text-[10px] text-zinc-700">
            Balances are shielded via Unlink zero-knowledge proofs. Not visible on-chain.
          </p>
        </div>
      </div>

      {/* Chat Sidecar */}
      <ChatSidecar
        isOpen={chatOpen}
        onClose={closeChat}
        initialPrompt={chatPrompt}
        autoSend={autoSend}
        width={chatWidth}
        onWidthChange={setChatWidth}
        onToolComplete={handleToolComplete}
      />

      {/* Backdrop when sidecar is open */}
      <div
        className={`sidecar-backdrop ${chatOpen ? 'visible' : ''}`}
        onClick={closeChat}
      />

      {/* Toast notification */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] animate-slide-up"
          style={{ marginLeft: '32px' }}
        >
          <div
            className="px-5 py-3 rounded-xl text-sm text-emerald-300 flex items-center gap-2 shadow-lg"
            style={{
              background: 'rgba(10, 30, 20, 0.9)',
              border: '1px solid rgba(74, 222, 128, 0.2)',
              backdropFilter: 'blur(16px)',
            }}
          >
            <span className="text-emerald-400">●</span>
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}
