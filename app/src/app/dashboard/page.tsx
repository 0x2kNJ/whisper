'use client'

import NavBar from '@/components/NavBar'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Transaction {
  id: string
  type: 'Deposit' | 'Private Transfer' | 'Private Swap' | 'Escrow Creation' | 'Payroll'
  amount: string
  token: string
  status: 'Confirmed' | 'Pending' | 'Failed'
  txHash: string
  time: string
}

interface Receipt {
  paymentId: string
  recipient: string
  amount: string
  token: string
  timestamp: string
  txHash: string
  private: boolean
}

// ---------------------------------------------------------------------------
// Hardcoded demo data
// ---------------------------------------------------------------------------

const BALANCES = [
  {
    label: 'USDC',
    chain: 'Base Sepolia',
    amount: '12,450.00',
    usd: '$12,450.00',
    change: '+2.3%',
    positive: true,
  },
  {
    label: 'WETH',
    chain: 'Base Sepolia',
    amount: '3.2500',
    usd: '≈ $9,100.00',
    change: '+1.1%',
    positive: true,
  },
  {
    label: 'USDC',
    chain: 'Arc Testnet',
    amount: '5,000.00',
    usd: '$5,000.00',
    change: '0.0%',
    positive: true,
  },
]

const TRANSACTIONS: Transaction[] = [
  {
    id: 'tx1',
    type: 'Deposit',
    amount: '5,000.00',
    token: 'USDC',
    status: 'Confirmed',
    txHash: '0x4f3a...c12e',
    time: '2 min ago',
  },
  {
    id: 'tx2',
    type: 'Private Transfer',
    amount: '250.00',
    token: 'USDC',
    status: 'Confirmed',
    txHash: '0x9b1d...4a77',
    time: '18 min ago',
  },
  {
    id: 'tx3',
    type: 'Private Swap',
    amount: '1,000.00',
    token: 'USDC → WETH',
    status: 'Confirmed',
    txHash: '0x2c8e...f391',
    time: '1 hr ago',
  },
  {
    id: 'tx4',
    type: 'Escrow Creation',
    amount: '3,500.00',
    token: 'USDC',
    status: 'Confirmed',
    txHash: '0xa71b...0d54',
    time: '3 hr ago',
  },
  {
    id: 'tx5',
    type: 'Payroll',
    amount: '2,200.00',
    token: 'USDC',
    status: 'Pending',
    txHash: '0x5e2f...8bc3',
    time: '6 hr ago',
  },
  {
    id: 'tx6',
    type: 'Private Transfer',
    amount: '0.5000',
    token: 'WETH',
    status: 'Confirmed',
    txHash: '0x1d9a...e620',
    time: '1 day ago',
  },
]

const RECEIPTS: Receipt[] = [
  {
    paymentId: 'rcpt_001',
    recipient: '0xabc1...def2',
    amount: '250.00',
    token: 'USDC',
    timestamp: '2026-04-03 14:22',
    txHash: '0x9b1d...4a77',
    private: true,
  },
  {
    paymentId: 'rcpt_002',
    recipient: '0x3f7e...91ca',
    amount: '0.5000',
    token: 'WETH',
    timestamp: '2026-04-02 09:15',
    txHash: '0x1d9a...e620',
    private: true,
  },
  {
    paymentId: 'rcpt_003',
    recipient: '0x88d4...5b3f',
    amount: '1,000.00',
    token: 'USDC',
    timestamp: '2026-04-01 17:44',
    txHash: '0x7c3b...2af1',
    private: false,
  },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatBadge({ status }: { status: Transaction['status'] }) {
  const colors: Record<Transaction['status'], string> = {
    Confirmed: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    Pending: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    Failed: 'text-red-400 bg-red-400/10 border-red-400/20',
  }
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide ${colors[status]}`}
    >
      {status}
    </span>
  )
}

function TypeBadge({ type }: { type: Transaction['type'] }) {
  const colors: Record<Transaction['type'], string> = {
    Deposit: 'text-[#c8d8ff] bg-[#c8d8ff]/10 border-[#c8d8ff]/20',
    'Private Transfer': 'text-purple-300 bg-purple-400/10 border-purple-400/20',
    'Private Swap': 'text-teal-300 bg-teal-400/10 border-teal-400/20',
    'Escrow Creation': 'text-orange-300 bg-orange-400/10 border-orange-400/20',
    Payroll: 'text-pink-300 bg-pink-400/10 border-pink-400/20',
  }
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide whitespace-nowrap ${colors[type]}`}
    >
      {type}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-screen bg-black overflow-hidden">
      <NavBar />

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-5xl mx-auto space-y-8">

          {/* Page title */}
          <div>
            <h1 className="text-xl font-semibold text-white">Dashboard</h1>
            <p className="text-xs text-zinc-500 mt-1">
              Overview of your private treasury balances and transaction history.
            </p>
          </div>

          {/* Balance cards */}
          <section>
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-3">
              Private Balances
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {BALANCES.map((b, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-[#222] bg-[#0a0a0a] px-5 py-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-xs font-semibold text-white">{b.label}</div>
                      <div className="text-[10px] text-zinc-600 mt-0.5">{b.chain}</div>
                    </div>
                    <span
                      className={`text-[10px] font-mono rounded px-1.5 py-0.5 border ${
                        b.positive
                          ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                          : 'text-red-400 bg-red-400/10 border-red-400/20'
                      }`}
                    >
                      {b.change}
                    </span>
                  </div>
                  <div className="text-lg font-semibold text-white font-mono">
                    {b.amount}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">{b.usd}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Transactions table */}
          <section>
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-3">
              Recent Transactions
            </div>
            <div className="rounded-xl border border-[#222] bg-[#0a0a0a] overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1a1a1a]">
                    {['Type', 'Amount', 'Token', 'Status', 'Tx Hash', 'Time'].map((col) => (
                      <th
                        key={col}
                        className="text-left text-[10px] uppercase tracking-widest text-zinc-600 px-4 py-3 font-medium"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TRANSACTIONS.map((tx, i) => (
                    <tr
                      key={tx.id}
                      className={`border-b border-[#111] transition-colors hover:bg-[#111] ${
                        i === TRANSACTIONS.length - 1 ? 'border-b-0' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <TypeBadge type={tx.type} />
                      </td>
                      <td className="px-4 py-3 font-mono text-white">{tx.amount}</td>
                      <td className="px-4 py-3 text-zinc-400">{tx.token}</td>
                      <td className="px-4 py-3">
                        <StatBadge status={tx.status} />
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-500">{tx.txHash}</td>
                      <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">{tx.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Payment receipts */}
          <section>
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-3">
              Payment Receipts
            </div>
            <div className="flex flex-col gap-2">
              {RECEIPTS.map((r) => (
                <div
                  key={r.paymentId}
                  className="rounded-xl border border-[#222] bg-[#0a0a0a] px-5 py-4 flex items-center gap-4 flex-wrap"
                >
                  {/* Receipt ID + private badge */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-xs text-[#c8d8ff]">{r.paymentId}</span>
                    {r.private && (
                      <span className="rounded border border-purple-400/20 bg-purple-400/10 px-1.5 py-0.5 text-[9px] font-medium text-purple-300 tracking-wide">
                        Private
                      </span>
                    )}
                  </div>

                  {/* Recipient */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-zinc-600">Recipient</div>
                    <div className="font-mono text-xs text-zinc-300 truncate">{r.recipient}</div>
                  </div>

                  {/* Amount */}
                  <div className="shrink-0">
                    <div className="text-[10px] text-zinc-600">Amount</div>
                    <div className="font-mono text-xs text-white">
                      {r.amount} {r.token}
                    </div>
                  </div>

                  {/* Tx hash */}
                  <div className="shrink-0">
                    <div className="text-[10px] text-zinc-600">Tx Hash</div>
                    <div className="font-mono text-xs text-zinc-400">{r.txHash}</div>
                  </div>

                  {/* Timestamp */}
                  <div className="shrink-0">
                    <div className="text-[10px] text-zinc-600">Time</div>
                    <div className="text-xs text-zinc-500">{r.timestamp}</div>
                  </div>

                  {/* Verify button */}
                  <button className="shrink-0 rounded-lg border border-[#333] bg-[#111] px-3 py-1.5 text-[11px] font-medium text-zinc-300 hover:border-[#c8d8ff]/40 hover:text-[#c8d8ff] transition-colors">
                    Verify
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Footer */}
          <p className="text-center text-[10px] text-zinc-700 pb-4">
            Balances are shielded via Unlink zero-knowledge proofs. Not visible on-chain.
          </p>
        </div>
      </div>
    </div>
  )
}
