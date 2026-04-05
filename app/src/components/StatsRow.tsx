'use client'

interface TreasuryAllocationProps {
  balances?: Array<{ symbol: string; balance: string }>
  loading?: boolean
  onRebalance?: () => void
  onRefresh?: () => void
}

export default function StatsRow({ balances, loading, onRebalance, onRefresh }: TreasuryAllocationProps) {
  if (loading) {
    return (
      <div className="px-4 sm:px-7 pb-6">
        <div className="shimmer h-[120px] rounded-xl" />
      </div>
    )
  }

  // Parse balances
  const usdc = balances?.find(b => b.symbol === 'USDC')
  const weth = balances?.find(b => b.symbol === 'WETH')

  const usdcVal = parseFloat(usdc?.balance || '0')
  const wethVal = parseFloat(weth?.balance || '0')
  // WETH in USD terms — using testnet Uniswap pool price (~330 USDC/WETH)
  const wethUsd = wethVal * 330
  const totalUsd = usdcVal + wethUsd

  const usdcPct = totalUsd > 0 ? Math.round((usdcVal / totalUsd) * 100) : 100
  const wethPct = 100 - usdcPct

  // Target policy
  const targetUsdc = 80
  const targetWeth = 20
  const needsRebalance = totalUsd > 0 && Math.abs(usdcPct - targetUsdc) > 5

  return (
    <div className="px-4 sm:px-7 pb-6">
      <div
        className="rounded-xl p-5"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">Treasury Allocation</span>
            <span className="text-[10px] text-zinc-600">
              Target: {targetUsdc}/{targetWeth}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-zinc-600">
              🔒 100% shielded
            </span>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="text-[10px] px-1.5 py-1 rounded-md transition-all hover:bg-[rgba(200,216,255,0.08)]"
                style={{ color: 'rgba(200,216,255,0.4)' }}
                title="Refresh balances"
              >
                ↻
              </button>
            )}
            {needsRebalance && onRebalance && (
              <button
                onClick={onRebalance}
                className="text-[10px] px-2.5 py-1 rounded-md transition-all"
                style={{
                  background: 'rgba(251,191,36,0.1)',
                  border: '1px solid rgba(251,191,36,0.2)',
                  color: '#fbbf24',
                }}
              >
                Rebalance needed →
              </button>
            )}
          </div>
        </div>

        {/* Allocation bar */}
        <div className="flex rounded-lg overflow-hidden h-8 mb-3">
          <div
            className="flex items-center justify-center text-[11px] font-medium transition-all duration-700"
            style={{
              width: `${Math.max(usdcPct, 5)}%`,
              background: 'rgba(200, 216, 255, 0.15)',
              color: '#c8d8ff',
            }}
          >
            {usdcPct}% USDC
          </div>
          {wethPct > 0 && (
            <div
              className="flex items-center justify-center text-[11px] font-medium transition-all duration-700"
              style={{
                width: `${Math.max(wethPct, 5)}%`,
                background: 'rgba(139, 92, 246, 0.2)',
                color: '#a78bfa',
              }}
            >
              {wethPct > 3 ? `${wethPct}% WETH` : ''}
            </div>
          )}
        </div>

        {/* Values */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(200,216,255,0.5)' }} />
              <span className="text-[12px] text-zinc-400">
                <span className="text-white font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {usdcVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {' '}USDC
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(139,92,246,0.5)' }} />
              <span className="text-[12px] text-zinc-400">
                <span className="text-white font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {wethVal.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                </span>
                {' '}WETH
              </span>
            </div>
          </div>
          {needsRebalance && (
            <span className="text-[10px] text-amber-500/70">
              {Math.abs(usdcPct - targetUsdc)}% off target
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
