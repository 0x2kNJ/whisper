'use client'

import { useState } from 'react'
import NavBar from '@/components/NavBar'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StrategyType = 'Standard' | 'Vesting' | 'Performance' | 'Contractor'
type StrategyStatus = 'Active' | 'Paused' | 'Completed'
type Schedule = 'Weekly' | 'Biweekly' | 'Monthly' | 'One-time'

interface Recipient {
  name: string
  address: string
  amount: string
  token: string
}

interface ExecutionRun {
  txHash: string
  amount: string
  token: string
  time: string
  status: 'Success' | 'Failed' | 'Pending'
}

interface Strategy {
  id: string
  name: string
  type: StrategyType
  status: StrategyStatus
  schedule: Schedule
  private: boolean
  recipients: Recipient[]
  budgetSpent: number
  budgetTotal: number
  token: string
  lastRun: string
  nextRun: string | null
  history: ExecutionRun[]
  condition?: string
  conditionMet?: boolean
  conditionNote?: string
  pauseReason?: string
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_STRATEGIES: Strategy[] = [
  {
    id: 'strat_001',
    name: 'Engineering Team Payroll',
    type: 'Standard',
    status: 'Active',
    schedule: 'Weekly',
    private: true,
    token: 'USDC',
    recipients: [
      { name: 'Alice', address: '0xabc1...def2', amount: '2,000', token: 'USDC' },
      { name: 'Bob', address: '0x3f7e...91ca', amount: '1,500', token: 'USDC' },
      { name: 'Charlie', address: '0x88d4...5b3f', amount: '1,000', token: 'USDC' },
    ],
    budgetSpent: 18000,
    budgetTotal: 50000,
    lastRun: '2 hours ago',
    nextRun: 'in 5 days',
    history: [
      { txHash: '0x4f3a...c12e', amount: '4,500', token: 'USDC', time: '2 hr ago', status: 'Success' },
      { txHash: '0x9b1d...4a77', amount: '4,500', token: 'USDC', time: '9 days ago', status: 'Success' },
      { txHash: '0x2c8e...f391', amount: '4,500', token: 'USDC', time: '16 days ago', status: 'Success' },
    ],
  },
  {
    id: 'strat_002',
    name: 'Q2 Performance Bonus',
    type: 'Performance',
    status: 'Active',
    schedule: 'One-time',
    private: false,
    token: 'USDC',
    recipients: [
      { name: 'Dave', address: '0xa71b...0d54', amount: '5,000', token: 'USDC' },
    ],
    budgetSpent: 0,
    budgetTotal: 5000,
    lastRun: 'Never',
    nextRun: 'When condition met',
    condition: 'ETH > $4,000',
    conditionMet: false,
    conditionNote: 'ETH: $3,245',
    history: [],
  },
  {
    id: 'strat_003',
    name: 'Design Contractor',
    type: 'Contractor',
    status: 'Completed',
    schedule: 'One-time',
    private: false,
    token: 'USDC',
    recipients: [
      { name: 'Eve', address: '0x5e2f...8bc3', amount: '3,000', token: 'USDC' },
    ],
    budgetSpent: 3000,
    budgetTotal: 3000,
    lastRun: '3 days ago',
    nextRun: null,
    history: [
      { txHash: '0x1d9a...e620', amount: '3,000', token: 'USDC', time: '3 days ago', status: 'Success' },
    ],
  },
  {
    id: 'strat_004',
    name: 'Advisor Vesting',
    type: 'Vesting',
    status: 'Paused',
    schedule: 'Monthly',
    private: true,
    token: 'USDC',
    recipients: [
      { name: 'Frank', address: '0x7c3b...2af1', amount: '1,000/month', token: 'USDC' },
    ],
    budgetSpent: 4000,
    budgetTotal: 12000,
    lastRun: '34 days ago',
    nextRun: null,
    pauseReason: 'Paused by owner',
    history: [
      { txHash: '0xa1b2...c3d4', amount: '1,000', token: 'USDC', time: '34 days ago', status: 'Success' },
      { txHash: '0xe5f6...a7b8', amount: '1,000', token: 'USDC', time: '64 days ago', status: 'Success' },
      { txHash: '0xc9d0...e1f2', amount: '1,000', token: 'USDC', time: '94 days ago', status: 'Success' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

const TEMPLATES = [
  {
    id: 'standard',
    label: 'Standard Payroll',
    description: 'Recurring salary payments on a fixed schedule.',
    type: 'Standard' as StrategyType,
    schedule: 'Weekly' as Schedule,
  },
  {
    id: 'vesting',
    label: 'Vesting Schedule',
    description: 'Token/USDC release over a defined vesting period.',
    type: 'Vesting' as StrategyType,
    schedule: 'Monthly' as Schedule,
  },
  {
    id: 'performance',
    label: 'Performance Bonus',
    description: 'One-time payment triggered by an oracle condition.',
    type: 'Performance' as StrategyType,
    schedule: 'One-time' as Schedule,
  },
  {
    id: 'contractor',
    label: 'Contractor Payment',
    description: 'Single payment to an external contractor.',
    type: 'Contractor' as StrategyType,
    schedule: 'One-time' as Schedule,
  },
]

// ---------------------------------------------------------------------------
// Badge components
// ---------------------------------------------------------------------------

function TypeBadge({ type }: { type: StrategyType }) {
  const map: Record<StrategyType, string> = {
    Standard: 'text-[#c8d8ff] bg-[#c8d8ff]/10 border-[#c8d8ff]/20',
    Vesting: 'text-purple-300 bg-purple-400/10 border-purple-400/20',
    Performance: 'text-teal-300 bg-teal-400/10 border-teal-400/20',
    Contractor: 'text-orange-300 bg-orange-400/10 border-orange-400/20',
  }
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide ${map[type]}`}>
      {type}
    </span>
  )
}

function StatusBadge({ status }: { status: StrategyStatus }) {
  const map: Record<StrategyStatus, string> = {
    Active: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    Paused: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    Completed: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20',
  }
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide ${map[status]}`}>
      {status}
    </span>
  )
}

function RunStatusBadge({ status }: { status: ExecutionRun['status'] }) {
  const map: Record<ExecutionRun['status'], string> = {
    Success: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    Failed: 'text-red-400 bg-red-400/10 border-red-400/20',
    Pending: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  }
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide ${map[status]}`}>
      {status}
    </span>
  )
}

function PrivacyBadge({ isPrivate }: { isPrivate: boolean }) {
  return isPrivate ? (
    <span className="rounded border border-purple-400/20 bg-purple-400/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-300 tracking-wide">
      Private 🔒
    </span>
  ) : (
    <span className="rounded border border-zinc-700 bg-zinc-800/30 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 tracking-wide">
      Public
    </span>
  )
}

// ---------------------------------------------------------------------------
// Budget progress bar
// ---------------------------------------------------------------------------

function BudgetBar({ spent, total }: { spent: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((spent / total) * 100)
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-zinc-600">
          {spent.toLocaleString()} / {total.toLocaleString()} USDC
        </span>
        <span className="text-[10px] text-zinc-500">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#c8d8ff] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Strategy Card
// ---------------------------------------------------------------------------

function StrategyCard({
  strategy,
  onTogglePause,
}: {
  strategy: Strategy
  onTogglePause: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="rounded-xl border border-[#222] bg-[#0a0a0a] overflow-hidden">
      {/* Header */}
      <div
        className="flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-[#0d0d0d] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{strategy.name}</span>
            <TypeBadge type={strategy.type} />
            <StatusBadge status={strategy.status} />
            <PrivacyBadge isPrivate={strategy.private} />
          </div>
          <div className="mt-1 flex items-center gap-3 text-[10px] text-zinc-600">
            <span>{strategy.schedule}</span>
            <span>·</span>
            <span>{strategy.recipients.length} recipient{strategy.recipients.length !== 1 ? 's' : ''}</span>
            {strategy.lastRun !== 'Never' && (
              <>
                <span>·</span>
                <span>Last run: {strategy.lastRun}</span>
              </>
            )}
          </div>
        </div>

        {/* Budget summary */}
        <div className="shrink-0 text-right">
          <div className="font-mono text-sm font-semibold text-white">
            {strategy.budgetSpent.toLocaleString()}{' '}
            <span className="text-zinc-500 text-xs">/ {strategy.budgetTotal.toLocaleString()} USDC</span>
          </div>
          <div className="text-[10px] text-zinc-600 mt-0.5">budget used</div>
        </div>

        {/* Chevron */}
        <svg
          className={`h-4 w-4 text-zinc-600 transition-transform shrink-0 mt-0.5 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-[#111] px-5 pb-5 pt-4 space-y-5">

          {/* Condition banner (Performance strategies) */}
          {strategy.condition && (
            <div className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${
              strategy.conditionMet
                ? 'border-emerald-400/20 bg-emerald-400/5'
                : 'border-yellow-400/20 bg-yellow-400/5'
            }`}>
              <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                strategy.conditionMet ? 'bg-emerald-400' : 'bg-yellow-400'
              }`} />
              <span className="text-xs font-medium text-zinc-300">
                Condition: <span className="text-white">{strategy.condition}</span>
              </span>
              {strategy.conditionNote && (
                <span className={`ml-auto text-[11px] font-mono ${
                  strategy.conditionMet ? 'text-emerald-400' : 'text-yellow-400'
                }`}>
                  {strategy.conditionNote}
                </span>
              )}
              <span className={`text-[10px] font-medium ${
                strategy.conditionMet ? 'text-emerald-400' : 'text-zinc-500'
              }`}>
                {strategy.conditionMet ? 'Met' : 'Not met'}
              </span>
            </div>
          )}

          {/* Pause reason */}
          {strategy.pauseReason && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-400/20 bg-yellow-400/5 px-4 py-2.5">
              <span className="text-xs text-yellow-400">{strategy.pauseReason}</span>
            </div>
          )}

          {/* Recipients */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">
              Recipients
            </div>
            <div className="flex flex-col gap-1.5">
              {strategy.recipients.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-white">{r.name}</span>
                    <span className="font-mono text-[11px] text-zinc-500">{r.address}</span>
                  </div>
                  <span className="font-mono text-xs font-medium text-[#c8d8ff]">
                    {r.amount} {r.token}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Schedule + next run */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] px-3 py-2.5">
              <div className="text-[10px] text-zinc-600 mb-0.5">Schedule</div>
              <div className="text-xs text-white font-medium">{strategy.schedule}</div>
            </div>
            <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] px-3 py-2.5">
              <div className="text-[10px] text-zinc-600 mb-0.5">Next Execution</div>
              <div className={`text-xs font-medium ${
                strategy.nextRun ? 'text-white' : 'text-zinc-600'
              }`}>
                {strategy.nextRun ?? '—'}
              </div>
            </div>
          </div>

          {/* Budget */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">
              Budget
            </div>
            <BudgetBar spent={strategy.budgetSpent} total={strategy.budgetTotal} />
          </div>

          {/* Execution history */}
          {strategy.history.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">
                Recent Executions
              </div>
              <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1a1a1a]">
                      {['Tx Hash', 'Amount', 'Time', 'Status'].map((col) => (
                        <th
                          key={col}
                          className="text-left text-[10px] uppercase tracking-widest text-zinc-600 px-3 py-2 font-medium"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {strategy.history.map((run, i) => (
                      <tr
                        key={i}
                        className={`${i < strategy.history.length - 1 ? 'border-b border-[#111]' : ''} hover:bg-[#111] transition-colors`}
                      >
                        <td className="px-3 py-2 font-mono text-zinc-500">{run.txHash}</td>
                        <td className="px-3 py-2 font-mono text-white">
                          {run.amount} <span className="text-zinc-600">{run.token}</span>
                        </td>
                        <td className="px-3 py-2 text-zinc-600 whitespace-nowrap">{run.time}</td>
                        <td className="px-3 py-2">
                          <RunStatusBadge status={run.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            {/* Pause / Resume */}
            {strategy.status !== 'Completed' && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onTogglePause(strategy.id)
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  strategy.status === 'Paused'
                    ? 'border-emerald-400/20 bg-emerald-400/5 text-emerald-400 hover:bg-emerald-400/10'
                    : 'border-yellow-400/20 bg-yellow-400/5 text-yellow-400 hover:bg-yellow-400/10'
                }`}
              >
                {strategy.status === 'Paused' ? 'Resume' : 'Pause'}
              </button>
            )}

            {/* Edit */}
            {strategy.status !== 'Completed' && (
              <button className="rounded-lg border border-[#333] bg-[#111] px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-[#c8d8ff]/40 hover:text-[#c8d8ff] transition-colors">
                Edit
              </button>
            )}

            {/* Execute Now */}
            {strategy.status === 'Active' && (
              <button className="rounded-lg border border-[#c8d8ff]/30 bg-[#c8d8ff]/10 px-3 py-1.5 text-xs font-medium text-[#c8d8ff] hover:bg-[#c8d8ff]/20 hover:border-[#c8d8ff]/50 transition-colors">
                Execute Now
              </button>
            )}

            {/* Delete */}
            <button className="ml-auto rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 hover:border-red-500/30 transition-colors">
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create Strategy Modal
// ---------------------------------------------------------------------------

interface RecipientField {
  name: string
  address: string
  amount: string
}

const EMPTY_RECIPIENT: RecipientField = { name: '', address: '', amount: '' }

function CreateStrategyModal({ onClose }: { onClose: () => void }) {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [strategyName, setStrategyName] = useState('')
  const [schedule, setSchedule] = useState<Schedule>('Weekly')
  const [isPrivate, setIsPrivate] = useState(true)
  const [recipients, setRecipients] = useState<RecipientField[]>([{ ...EMPTY_RECIPIENT }])
  const [budget, setBudget] = useState('')
  // Condition fields
  const [vestingDuration, setVestingDuration] = useState('')
  const [oracleAddress, setOracleAddress] = useState('')
  const [triggerPrice, setTriggerPrice] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const activeTemplate = TEMPLATES.find((t) => t.id === selectedTemplate)

  function selectTemplate(id: string) {
    const tpl = TEMPLATES.find((t) => t.id === id)
    if (!tpl) return
    setSelectedTemplate(id)
    setSchedule(tpl.schedule)
  }

  function addRecipient() {
    setRecipients((prev) => [...prev, { ...EMPTY_RECIPIENT }])
  }

  function removeRecipient(i: number) {
    setRecipients((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateRecipient(i: number, field: keyof RecipientField, value: string) {
    setRecipients((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)),
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setTimeout(() => {
      setSubmitted(false)
      onClose()
    }, 1500)
  }

  const inputClass =
    'w-full rounded-lg border border-[#222] bg-[#0d0d0d] px-3 py-2 text-xs text-white placeholder-zinc-600 outline-none focus:border-[#333] transition-colors'

  const labelClass = 'block text-[10px] uppercase tracking-widest text-zinc-600 mb-1'

  const showConditions =
    selectedTemplate === 'vesting' || selectedTemplate === 'performance'

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[#222] bg-[#0a0a0a] shadow-2xl">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#111]">
          <div>
            <h2 className="text-sm font-semibold text-white">Create Strategy</h2>
            <p className="text-[10px] text-zinc-600 mt-0.5">
              Configure a new payroll strategy
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-[#222] bg-[#111] p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">

          {/* Template selector */}
          <div>
            <label className={labelClass}>Template</label>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => selectTemplate(tpl.id)}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                    selectedTemplate === tpl.id
                      ? 'border-[#c8d8ff]/40 bg-[#c8d8ff]/8 text-[#c8d8ff]'
                      : 'border-[#1a1a1a] bg-[#0d0d0d] text-zinc-400 hover:border-[#333] hover:text-zinc-200'
                  }`}
                >
                  <div className="text-xs font-medium">{tpl.label}</div>
                  <div className="text-[10px] text-zinc-600 mt-0.5 leading-relaxed">
                    {tpl.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Strategy name */}
          <div>
            <label className={labelClass}>Strategy Name</label>
            <input
              type="text"
              placeholder={activeTemplate ? `e.g. ${activeTemplate.label}` : 'My Strategy'}
              value={strategyName}
              onChange={(e) => setStrategyName(e.target.value)}
              className={inputClass}
              required
            />
          </div>

          {/* Recipients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelClass}>Recipients</label>
              <button
                type="button"
                onClick={addRecipient}
                className="text-[10px] text-[#c8d8ff] hover:text-white transition-colors"
              >
                + Add recipient
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {recipients.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Name"
                    value={r.name}
                    onChange={(e) => updateRecipient(i, 'name', e.target.value)}
                    className="w-24 rounded-lg border border-[#222] bg-[#0d0d0d] px-3 py-2 text-xs text-white placeholder-zinc-600 outline-none focus:border-[#333] transition-colors"
                  />
                  <input
                    type="text"
                    placeholder="0x address"
                    value={r.address}
                    onChange={(e) => updateRecipient(i, 'address', e.target.value)}
                    className="flex-1 rounded-lg border border-[#222] bg-[#0d0d0d] px-3 py-2 text-xs text-white placeholder-zinc-600 outline-none focus:border-[#333] transition-colors font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Amount (USDC)"
                    value={r.amount}
                    onChange={(e) => updateRecipient(i, 'amount', e.target.value)}
                    className="w-32 rounded-lg border border-[#222] bg-[#0d0d0d] px-3 py-2 text-xs text-white placeholder-zinc-600 outline-none focus:border-[#333] transition-colors"
                  />
                  {recipients.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRecipient(i)}
                      className="text-zinc-600 hover:text-red-400 transition-colors text-base leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Schedule + privacy row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Schedule</label>
              <select
                value={schedule}
                onChange={(e) => setSchedule(e.target.value as Schedule)}
                className={`${inputClass} appearance-none`}
              >
                <option value="Weekly">Weekly</option>
                <option value="Biweekly">Biweekly</option>
                <option value="Monthly">Monthly</option>
                <option value="One-time">One-time</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Privacy</label>
              <div className="flex items-center gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setIsPrivate(true)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    isPrivate
                      ? 'border-purple-400/30 bg-purple-400/10 text-purple-300'
                      : 'border-[#222] bg-[#0d0d0d] text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Private 🔒
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrivate(false)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    !isPrivate
                      ? 'border-zinc-400/30 bg-zinc-400/10 text-zinc-300'
                      : 'border-[#222] bg-[#0d0d0d] text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Public
                </button>
              </div>
            </div>
          </div>

          {/* Conditions section */}
          {showConditions && (
            <div className="rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] px-4 py-4 space-y-4">
              <div className="text-[10px] uppercase tracking-widest text-zinc-600">
                Conditions (optional)
              </div>

              {selectedTemplate === 'vesting' && (
                <div>
                  <label className={labelClass}>Vesting Duration (months)</label>
                  <input
                    type="number"
                    placeholder="12"
                    value={vestingDuration}
                    onChange={(e) => setVestingDuration(e.target.value)}
                    className={inputClass}
                    min="1"
                  />
                </div>
              )}

              {selectedTemplate === 'performance' && (
                <>
                  <div>
                    <label className={labelClass}>Oracle Address</label>
                    <input
                      type="text"
                      placeholder="0xOracle...address"
                      value={oracleAddress}
                      onChange={(e) => setOracleAddress(e.target.value)}
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Trigger Price (USD)</label>
                    <input
                      type="text"
                      placeholder="4000"
                      value={triggerPrice}
                      onChange={(e) => setTriggerPrice(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Total budget */}
          <div>
            <label className={labelClass}>Total Budget (USDC)</label>
            <input
              type="text"
              placeholder="50000"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className={inputClass}
              required
            />
          </div>

          {/* Submit */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              className="rounded-xl border border-[#c8d8ff]/30 bg-[#c8d8ff]/10 px-6 py-2.5 text-sm font-medium text-[#c8d8ff] hover:bg-[#c8d8ff]/20 hover:border-[#c8d8ff]/50 transition-colors"
            >
              {submitted ? 'Creating...' : 'Create Strategy'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#222] bg-[#111] px-5 py-2.5 text-sm font-medium text-zinc-500 hover:text-zinc-300 hover:border-[#333] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>(DEMO_STRATEGIES)
  const [showModal, setShowModal] = useState(false)

  function togglePause(id: string) {
    setStrategies((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s
        return {
          ...s,
          status: s.status === 'Paused' ? 'Active' : 'Paused',
          pauseReason: s.status === 'Paused' ? undefined : 'Paused by owner',
          nextRun: s.status === 'Paused' ? 'Resuming...' : null,
        }
      }),
    )
  }

  const activeCount = strategies.filter((s) => s.status === 'Active').length
  const totalBudget = strategies.reduce((sum, s) => sum + s.budgetTotal, 0)
  const totalSpent = strategies.reduce((sum, s) => sum + s.budgetSpent, 0)

  return (
    <div className="flex flex-col h-screen bg-black overflow-hidden">
      <NavBar />

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-8">

          {/* Page header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-white">Payroll Strategies</h1>
              <p className="text-xs text-zinc-500 mt-1">
                Automate recurring and conditional payments with privacy-preserving strategies.
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="shrink-0 rounded-xl border border-[#c8d8ff]/30 bg-[#c8d8ff]/10 px-4 py-2 text-sm font-medium text-[#c8d8ff] hover:bg-[#c8d8ff]/20 hover:border-[#c8d8ff]/50 transition-colors"
            >
              + Create Strategy
            </button>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-[#222] bg-[#0a0a0a] px-5 py-4">
              <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">
                Active Strategies
              </div>
              <div className="text-2xl font-semibold text-white font-mono">{activeCount}</div>
              <div className="text-[10px] text-zinc-600 mt-0.5">of {strategies.length} total</div>
            </div>
            <div className="rounded-xl border border-[#222] bg-[#0a0a0a] px-5 py-4">
              <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">
                Total Disbursed
              </div>
              <div className="text-2xl font-semibold text-white font-mono">
                {totalSpent.toLocaleString()}
              </div>
              <div className="text-[10px] text-zinc-600 mt-0.5">USDC across all strategies</div>
            </div>
            <div className="rounded-xl border border-[#222] bg-[#0a0a0a] px-5 py-4">
              <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">
                Total Budget
              </div>
              <div className="text-2xl font-semibold text-white font-mono">
                {totalBudget.toLocaleString()}
              </div>
              <div className="text-[10px] text-zinc-600 mt-0.5">
                {Math.round((totalSpent / totalBudget) * 100)}% utilized
              </div>
            </div>
          </div>

          {/* Strategy cards */}
          <section>
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-3">
              All Strategies
            </div>
            <div className="flex flex-col gap-4">
              {strategies.map((s) => (
                <StrategyCard key={s.id} strategy={s} onTogglePause={togglePause} />
              ))}
            </div>
          </section>

          <p className="text-center text-[10px] text-zinc-700 pb-4">
            Whisper strategies execute via zero-knowledge proofs. Recipient details remain shielded on-chain.
          </p>
        </div>
      </div>

      {/* Modal */}
      {showModal && <CreateStrategyModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
