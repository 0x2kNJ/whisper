'use client'

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

interface ActivityFeedProps {
  items: ActivityItem[]
  loading?: boolean
}

const iconConfig: Record<string, { bg: string; color: string; icon: string }> = {
  transfer: { bg: 'rgba(200,216,255,0.08)', color: 'rgba(200,216,255,0.8)', icon: '→' },
  payroll: { bg: 'rgba(74,222,128,0.1)', color: '#4ade80', icon: '✓' },
  escrow: { bg: 'rgba(251,191,36,0.1)', color: '#fbbf24', icon: '⊡' },
  verification: { bg: 'rgba(200,216,255,0.1)', color: '#c8d8ff', icon: '◈' },
  swap: { bg: 'rgba(200,216,255,0.08)', color: 'rgba(200,216,255,0.8)', icon: '⇄' },
  deposit: { bg: 'rgba(200,216,255,0.08)', color: 'rgba(200,216,255,0.8)', icon: '↓' },
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export default function ActivityFeed({ items, loading }: ActivityFeedProps) {
  if (loading) {
    return (
      <div className="bg-[rgba(255,255,255,0.02)] backdrop-blur-sm border border-[rgba(255,255,255,0.06)] rounded-[14px] overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3.5 px-[18px] py-3.5 border-b border-[rgba(255,255,255,0.03)]">
            <div className="shimmer w-8 h-8 rounded-lg shrink-0" />
            <div className="flex-1">
              <div className="shimmer h-3.5 w-48 mb-1.5" />
              <div className="shimmer h-3 w-32" />
            </div>
            <div className="text-right">
              <div className="shimmer h-3.5 w-20 mb-1.5" />
              <div className="shimmer h-3 w-12" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="bg-[rgba(255,255,255,0.02)] backdrop-blur-sm border border-[rgba(255,255,255,0.06)] rounded-[14px] py-12 text-center">
        <div className="text-2xl mb-2 opacity-30">◈</div>
        <p className="text-zinc-500 text-sm">No activity yet.</p>
        <p className="text-zinc-600 text-xs mt-1">Your treasury transactions will appear here.</p>
      </div>
    )
  }

  return (
    <div className="bg-[rgba(255,255,255,0.02)] backdrop-blur-sm border border-[rgba(255,255,255,0.06)] rounded-[14px] overflow-hidden">
      {items.map((item, i) => {
        const config = iconConfig[item.type] || iconConfig.transfer
        const explorerHref = item.txHash?.startsWith('0x')
          ? item.type === 'escrow'
            ? `https://testnet.arcscan.app/tx/${item.txHash}`
            : `https://sepolia.basescan.org/tx/${item.txHash}`
          : 'https://sepolia.basescan.org/address/0x647f9b99af97e4b79DD9Dd6de3b583236352f482#internaltx'
        return (
          <a
            key={item.id}
            href={explorerHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-3.5 px-[18px] py-3.5 hover:bg-[rgba(200,216,255,0.03)] cursor-pointer transition-colors duration-150 no-underline ${
              i < items.length - 1 ? 'border-b border-[rgba(255,255,255,0.03)]' : ''
            }`}
            title={item.txHash?.startsWith('0x') ? 'View transaction on explorer' : 'View pool transactions on BaseScan'}
          >
            {/* Icon */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
              style={{ background: config.bg, color: config.color }}
            >
              {config.icon}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-zinc-300 truncate flex items-center gap-1.5">
                {item.title}
                {(item.type === 'transfer' || item.type === 'payroll' || item.type === 'swap') && (
                  <span className="text-[9px] opacity-60 shrink-0">🔒</span>
                )}
              </div>
              <div className="text-[11px] text-zinc-500 truncate">{item.detail}</div>
            </div>

            {/* Meta */}
            <div className="text-right shrink-0">
              {item.amount && (
                <div className="text-[13px] text-zinc-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {item.amount} {item.token || 'USDC'}
                </div>
              )}
              <div className="text-[10px] text-zinc-500 flex items-center justify-end gap-1.5">
                {formatRelativeTime(item.timestamp)}
                <span className="text-[rgba(200,216,255,0.5)] group-hover:text-[#c8d8ff] transition-colors">
                  ↗
                </span>
              </div>
            </div>
          </a>
        )
      })}
    </div>
  )
}
