'use client'

interface StatsRowProps {
  stats?: {
    totalMoved: number
    transactionCount: number
    transactionBreakdown: string
    activePositions: number
    activeBreakdown: string
    privacyScore: number
  } | null
  loading?: boolean
}

export default function StatsRow({ stats, loading }: StatsRowProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-4 gap-3 px-7 pb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="shimmer h-[88px] rounded-xl" />
        ))}
      </div>
    )
  }

  const cards = [
    {
      label: 'Total Moved',
      value: stats?.totalMoved?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00',
      unit: 'USDC',
      detail: stats && stats.totalMoved > 0 ? '+12% from last month' : 'No activity yet',
      detailColor: stats && stats.totalMoved > 0 ? 'text-emerald-400' : 'text-zinc-500',
    },
    {
      label: 'Transactions',
      value: stats?.transactionCount?.toString() ?? '0',
      unit: null,
      detail: stats?.transactionBreakdown || 'No transactions',
      detailColor: 'text-zinc-500',
    },
    {
      label: 'Active Positions',
      value: stats?.activePositions?.toString() ?? '0',
      unit: null,
      detail: stats?.activeBreakdown || 'No active positions',
      detailColor: 'text-zinc-500',
    },
    {
      label: 'Privacy Score',
      value: stats?.privacyScore?.toString() ?? '100',
      unit: '%',
      detail: (stats?.privacyScore ?? 100) >= 90 ? 'All transactions shielded' : 'Some public transactions',
      detailColor: (stats?.privacyScore ?? 100) >= 90 ? 'text-emerald-400' : 'text-zinc-500',
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-3 px-7 pb-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-[rgba(255,255,255,0.03)] backdrop-blur-sm border border-[rgba(255,255,255,0.06)] rounded-xl p-4 hover:border-[rgba(200,216,255,0.15)] transition-colors duration-200"
        >
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
            {card.label}
          </div>
          <div className="text-[22px] font-semibold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {card.value}
            {card.unit && (
              <span className="text-xs font-normal text-zinc-500 ml-1">{card.unit}</span>
            )}
          </div>
          <div className={`text-[11px] mt-1 ${card.detailColor}`}>
            {card.detail}
          </div>
        </div>
      ))}
    </div>
  )
}
