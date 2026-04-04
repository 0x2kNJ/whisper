'use client'

interface QuickActionsProps {
  onAction: (prompt: string) => void
}

const actions = [
  { label: 'Transfer', icon: '→', prompt: 'Transfer USDC to ' },
  { label: 'Run Payroll', icon: '◷', prompt: 'Run payroll for ' },
  { label: 'Create Escrow', icon: '⊡', prompt: 'Create escrow for ' },
  { label: 'Verify Income', icon: '◈', prompt: 'Verify income for ' },
  { label: 'Swap', icon: '⇄', prompt: 'Swap ' },
]

export default function QuickActions({ onAction }: QuickActionsProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => onAction(action.prompt)}
          className="bg-surface-2 border border-border rounded-[10px] px-4 py-2.5 flex items-center gap-2 text-sm text-zinc-400 hover:bg-[rgba(200,216,255,0.06)] hover:border-[rgba(200,216,255,0.15)] hover:text-[#c8d8ff] transition-all duration-150 cursor-pointer"
        >
          <span className="opacity-70 text-[15px]">{action.icon}</span>
          {action.label}
        </button>
      ))}
    </div>
  )
}
