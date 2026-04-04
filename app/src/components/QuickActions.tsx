'use client'

interface QuickActionsProps {
  onAction: (prompt: string) => void
}

const actions = [
  { label: 'Transfer Funds', icon: '→', prompt: 'Pay alice.whisper.eth 0.001 USDC privately' },
  { label: 'Run Payroll', icon: '◷', prompt: 'Run payroll: alice and bob — 0.001 USDC each' },
  { label: 'Milestone Pay', icon: '⊡', prompt: 'Create escrow for alice.whisper.eth: 0.01 USDC, release when ETH > $4k' },
  { label: 'Proof of Income', icon: '◈', prompt: 'Verify income for alice.whisper.eth' },
  { label: 'Rebalance', icon: '⇄', prompt: 'Rebalance treasury to 80% USDC / 20% WETH' },
]

export default function QuickActions({ onAction }: QuickActionsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto sm:flex-wrap pb-1 sm:pb-0 scrollbar-hide">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => onAction(action.prompt)}
          className="bg-[rgba(255,255,255,0.03)] backdrop-blur-sm border border-[rgba(255,255,255,0.06)] rounded-[10px] px-4 py-2.5 flex items-center gap-2 text-sm text-zinc-400 hover:bg-[rgba(200,216,255,0.08)] hover:border-[rgba(200,216,255,0.2)] hover:text-[#c8d8ff] hover:shadow-[0_0_15px_rgba(200,216,255,0.06)] transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 sm:shrink"
        >
          <span className="opacity-70 text-[15px]">{action.icon}</span>
          {action.label}
          <span className="text-[9px] opacity-50">🔒</span>
        </button>
      ))}
    </div>
  )
}
