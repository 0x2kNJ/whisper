'use client'

import { useState } from 'react'
import NavBar from '@/components/NavBar'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WHISPER_ESCROW_ADDRESS = '0xf4e13a7d98A8Eb7945D937Fa33e5BBa287329eD6'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Milestone {
  id: string
  amount: string
  token: string
  unlockTime: string       // human readable countdown
  unlockTimestamp: number  // unix
  oracle: string
  triggerPrice: string
  oracleCurrentPrice: string
  operator: 'GT' | 'LT'
  released: boolean
}

interface Escrow {
  id: string
  token: string
  totalAmount: string
  recipientCount: number
  recipients: { address: string; share: number }[]
  milestones: Milestone[]
  creator: string
  createdAt: string
  status: 'Active' | 'Completed' | 'Cancelled'
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_ESCROWS: Escrow[] = [
  {
    id: 'escrow_001',
    token: 'USDC',
    totalAmount: '3,500.00',
    recipientCount: 2,
    recipients: [
      { address: '0xabc1...def2', share: 60 },
      { address: '0x3f7e...91ca', share: 40 },
    ],
    milestones: [
      {
        id: 'm1',
        amount: '1,500.00',
        token: 'USDC',
        unlockTime: 'Unlocked',
        unlockTimestamp: Date.now() - 3600000,
        oracle: '0xOracle...1234',
        triggerPrice: '3200',
        oracleCurrentPrice: '3410',
        operator: 'GT',
        released: true,
      },
      {
        id: 'm2',
        amount: '1,000.00',
        token: 'USDC',
        unlockTime: '2d 14h 30m',
        unlockTimestamp: Date.now() + 222600000,
        oracle: '0xOracle...1234',
        triggerPrice: '3200',
        oracleCurrentPrice: '3410',
        operator: 'GT',
        released: false,
      },
      {
        id: 'm3',
        amount: '1,000.00',
        token: 'USDC',
        unlockTime: '7d 0h 0m',
        unlockTimestamp: Date.now() + 604800000,
        oracle: '0xOracle...1234',
        triggerPrice: '3500',
        oracleCurrentPrice: '3410',
        operator: 'GT',
        released: false,
      },
    ],
    creator: '0x1a2b...9f0e',
    createdAt: '2026-04-01 10:00',
    status: 'Active',
  },
  {
    id: 'escrow_002',
    token: 'USDC',
    totalAmount: '800.00',
    recipientCount: 1,
    recipients: [
      { address: '0x88d4...5b3f', share: 100 },
    ],
    milestones: [
      {
        id: 'm1',
        amount: '400.00',
        token: 'USDC',
        unlockTime: '12h 00m',
        unlockTimestamp: Date.now() + 43200000,
        oracle: '0x0000...0000',
        triggerPrice: '0',
        oracleCurrentPrice: '—',
        operator: 'GT',
        released: false,
      },
      {
        id: 'm2',
        amount: '400.00',
        token: 'USDC',
        unlockTime: '5d 12h 00m',
        unlockTimestamp: Date.now() + 475200000,
        oracle: '0x0000...0000',
        triggerPrice: '0',
        oracleCurrentPrice: '—',
        operator: 'GT',
        released: false,
      },
    ],
    creator: '0x1a2b...9f0e',
    createdAt: '2026-04-03 08:30',
    status: 'Active',
  },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBar({ released, total }: { released: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((released / total) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#c8d8ff] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-zinc-500 shrink-0">{pct}%</span>
    </div>
  )
}

function MilestoneRow({ m }: { m: Milestone }) {
  const timeLocked = m.unlockTimestamp > Date.now()
  const oracleConditionMet =
    m.operator === 'GT'
      ? parseFloat(m.oracleCurrentPrice.replace(',', '')) > parseFloat(m.triggerPrice)
      : parseFloat(m.oracleCurrentPrice.replace(',', '')) < parseFloat(m.triggerPrice)
  const canRelease = !timeLocked && (m.triggerPrice === '0' || oracleConditionMet) && !m.released

  return (
    <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-semibold text-white">
          {m.amount} <span className="text-zinc-500">{m.token}</span>
        </span>
        {m.released ? (
          <span className="rounded border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
            Released
          </span>
        ) : (
          <span className="rounded border border-zinc-700 bg-zinc-800/30 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
            Pending
          </span>
        )}
      </div>

      {/* Conditions */}
      <div className="flex flex-wrap gap-3 text-[11px]">
        {/* Time lock */}
        <div className="flex items-center gap-1.5">
          <svg
            className={`h-3 w-3 ${timeLocked ? 'text-yellow-400' : 'text-emerald-400'}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" d="M12 6v6l4 2" />
          </svg>
          <span className={timeLocked ? 'text-yellow-400' : 'text-emerald-400'}>
            {m.unlockTime}
          </span>
        </div>

        {/* Oracle condition */}
        {m.triggerPrice !== '0' && (
          <div className="flex items-center gap-1.5">
            <svg
              className={`h-3 w-3 ${oracleConditionMet ? 'text-emerald-400' : 'text-zinc-500'}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" d="M3 12h18M3 6l6 6-6 6" />
            </svg>
            <span className="text-zinc-500">
              ETH/USD{' '}
              <span className={oracleConditionMet ? 'text-emerald-400' : 'text-zinc-400'}>
                {m.operator === 'GT' ? '>' : '<'} ${m.triggerPrice}
              </span>
              <span className="text-zinc-600"> (now: ${m.oracleCurrentPrice})</span>
            </span>
          </div>
        )}
      </div>

      {/* Release button per milestone */}
      {!m.released && (
        <button
          disabled={!canRelease}
          className={`mt-1 self-start rounded-lg border px-3 py-1 text-[11px] font-medium transition-colors ${
            canRelease
              ? 'border-[#c8d8ff]/30 bg-[#c8d8ff]/10 text-[#c8d8ff] hover:bg-[#c8d8ff]/20'
              : 'border-[#222] bg-[#111] text-zinc-600 cursor-not-allowed'
          }`}
        >
          {canRelease ? 'Release' : 'Conditions not met'}
        </button>
      )}
    </div>
  )
}

function EscrowCard({ escrow }: { escrow: Escrow }) {
  const [expanded, setExpanded] = useState(true)
  const releasedCount = escrow.milestones.filter((m) => m.released).length
  const totalCount = escrow.milestones.length

  return (
    <div className="rounded-xl border border-[#222] bg-[#0a0a0a] overflow-hidden">
      {/* Card header */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[#0d0d0d] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-[#c8d8ff]">{escrow.id}</span>
            <span className="rounded border border-[#222] bg-[#111] px-1.5 py-0.5 text-[9px] font-mono text-zinc-500">
              {escrow.status}
            </span>
          </div>
          <div className="mt-0.5 text-[10px] text-zinc-600">
            Created {escrow.createdAt} by{' '}
            <span className="font-mono">{escrow.creator}</span>
          </div>
        </div>

        {/* Summary */}
        <div className="shrink-0 text-right">
          <div className="font-mono text-sm font-semibold text-white">
            {escrow.totalAmount} <span className="text-zinc-500 text-xs">{escrow.token}</span>
          </div>
          <div className="text-[10px] text-zinc-600">
            {escrow.recipientCount} recipient{escrow.recipientCount !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Chevron */}
        <svg
          className={`h-4 w-4 text-zinc-600 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
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
          {/* Milestone progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-600">
                Milestones
              </span>
              <span className="text-[10px] text-zinc-500">
                {releasedCount}/{totalCount} released
              </span>
            </div>
            <ProgressBar released={releasedCount} total={totalCount} />
          </div>

          {/* Recipients */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">
              Recipients
            </div>
            <div className="flex flex-col gap-1.5">
              {escrow.recipients.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] px-3 py-2"
                >
                  <span className="font-mono text-xs text-zinc-300">{r.address}</span>
                  <span className="text-xs font-medium text-[#c8d8ff]">{r.share}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Milestone details */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">
              Milestone Details
            </div>
            <div className="flex flex-col gap-2">
              {escrow.milestones.map((m) => (
                <MilestoneRow key={m.id} m={m} />
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 hover:border-red-500/30 transition-colors">
              Cancel Escrow
            </button>
            <span className="text-[10px] text-zinc-700">Only callable by creator</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create Escrow form
// ---------------------------------------------------------------------------

interface RecipientField {
  address: string
  share: string
}

interface MilestoneField {
  amount: string
  unlockTime: string
  oracle: string
  triggerPrice: string
  operator: 'GT' | 'LT'
}

function CreateEscrowForm() {
  const [token, setToken] = useState('USDC')
  const [recipients, setRecipients] = useState<RecipientField[]>([
    { address: '', share: '100' },
  ])
  const [milestones, setMilestones] = useState<MilestoneField[]>([
    { amount: '', unlockTime: '', oracle: '', triggerPrice: '', operator: 'GT' },
  ])
  const [submitted, setSubmitted] = useState(false)

  function addRecipient() {
    setRecipients((prev) => [...prev, { address: '', share: '' }])
  }

  function removeRecipient(i: number) {
    setRecipients((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateRecipient(i: number, field: keyof RecipientField, value: string) {
    setRecipients((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)),
    )
  }

  function addMilestone() {
    setMilestones((prev) => [
      ...prev,
      { amount: '', unlockTime: '', oracle: '', triggerPrice: '', operator: 'GT' },
    ])
  }

  function removeMilestone(i: number) {
    setMilestones((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateMilestone(i: number, field: keyof MilestoneField, value: string) {
    setMilestones((prev) =>
      prev.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)),
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setTimeout(() => setSubmitted(false), 3000)
  }

  const inputClass =
    'w-full rounded-lg border border-[#222] bg-[#0d0d0d] px-3 py-2 text-xs text-white placeholder-zinc-600 outline-none focus:border-[#333] transition-colors'

  const labelClass = 'block text-[10px] uppercase tracking-widest text-zinc-600 mb-1'

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-[#222] bg-[#0a0a0a] px-6 py-5 space-y-6">
      {/* Token selector */}
      <div>
        <label className={labelClass}>Token</label>
        <select
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className={`${inputClass} appearance-none`}
        >
          <option value="USDC">USDC</option>
          <option value="WETH">WETH</option>
        </select>
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
                placeholder="0x address"
                value={r.address}
                onChange={(e) => updateRecipient(i, 'address', e.target.value)}
                className="flex-1 rounded-lg border border-[#222] bg-[#0d0d0d] px-3 py-2 text-xs text-white placeholder-zinc-600 outline-none focus:border-[#333] transition-colors font-mono"
              />
              <input
                type="number"
                placeholder="%"
                min="0"
                max="100"
                value={r.share}
                onChange={(e) => updateRecipient(i, 'share', e.target.value)}
                className="w-20 rounded-lg border border-[#222] bg-[#0d0d0d] px-3 py-2 text-xs text-white placeholder-zinc-600 outline-none focus:border-[#333] transition-colors"
              />
              {recipients.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRecipient(i)}
                  className="text-zinc-600 hover:text-red-400 transition-colors text-sm"
                  aria-label="Remove recipient"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Milestones */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={labelClass}>Milestones</label>
          <button
            type="button"
            onClick={addMilestone}
            className="text-[10px] text-[#c8d8ff] hover:text-white transition-colors"
          >
            + Add milestone
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {milestones.map((m, i) => (
            <div
              key={i}
              className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] px-4 py-3 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">Milestone {i + 1}</span>
                {milestones.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMilestone(i)}
                    className="text-zinc-600 hover:text-red-400 transition-colors text-xs"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Amount ({token})</label>
                  <input
                    type="text"
                    placeholder="1000.00"
                    value={m.amount}
                    onChange={(e) => updateMilestone(i, 'amount', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Unlock time (unix)</label>
                  <input
                    type="number"
                    placeholder="1774000000"
                    value={m.unlockTime}
                    onChange={(e) => updateMilestone(i, 'unlockTime', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Oracle address</label>
                  <input
                    type="text"
                    placeholder="0x0000...0000"
                    value={m.oracle}
                    onChange={(e) => updateMilestone(i, 'oracle', e.target.value)}
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div>
                  <label className={labelClass}>Trigger price</label>
                  <input
                    type="text"
                    placeholder="3200"
                    value={m.triggerPrice}
                    onChange={(e) => updateMilestone(i, 'triggerPrice', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Operator</label>
                  <select
                    value={m.operator}
                    onChange={(e) => updateMilestone(i, 'operator', e.target.value)}
                    className={`${inputClass} appearance-none`}
                  >
                    <option value="GT">Greater than (GT)</option>
                    <option value="LT">Less than (LT)</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          className="rounded-xl border border-[#c8d8ff]/30 bg-[#c8d8ff]/10 px-6 py-2.5 text-sm font-medium text-[#c8d8ff] hover:bg-[#c8d8ff]/20 hover:border-[#c8d8ff]/50 transition-colors"
        >
          {submitted ? 'Submitted!' : 'Create Escrow'}
        </button>
        <p className="text-[10px] text-zinc-700">
          Contract: <span className="font-mono">{WHISPER_ESCROW_ADDRESS}</span>
        </p>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EscrowPage() {
  return (
    <div className="flex flex-col h-screen bg-black overflow-hidden">
      <NavBar />

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-8">

          {/* Page title */}
          <div>
            <h1 className="text-xl font-semibold text-white">Escrow</h1>
            <p className="text-xs text-zinc-500 mt-1">
              Manage conditional payroll and milestone-based payment escrows.
            </p>
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] px-3 py-1.5">
              <span className="text-[10px] text-zinc-600">WhisperEscrow contract</span>
              <span className="font-mono text-[10px] text-[#c8d8ff]">{WHISPER_ESCROW_ADDRESS}</span>
            </div>
          </div>

          {/* Active escrows */}
          <section>
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-3">
              Active Escrows
            </div>
            <div className="flex flex-col gap-4">
              {DEMO_ESCROWS.map((escrow) => (
                <EscrowCard key={escrow.id} escrow={escrow} />
              ))}
            </div>
          </section>

          {/* Create escrow */}
          <section>
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-3">
              Create Escrow
            </div>
            <CreateEscrowForm />
          </section>

          <p className="text-center text-[10px] text-zinc-700 pb-4">
            Whisper operates on testnet. No real funds will be transferred.
          </p>
        </div>
      </div>
    </div>
  )
}
