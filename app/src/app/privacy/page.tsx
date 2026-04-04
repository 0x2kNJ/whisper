'use client'

import { useState } from 'react'
import NavBar from '@/components/NavBar'

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const MAIN_HEX = `7b2276657273696f6e223a312c2274797065223a22656e637279707465645f7061
79726f6c6c222c226e6f6e6365223a2261653132663337643963623034623038222c
2274696d657374616d70223a313733383630383430302c22706179657222c3a22307836
3437663962613132663737333564346636336631353539326363326564313336633036
62666565222c22656e63727970746564506179726f6c6c223a7b226b6579223a22307833
3162343664343832386430656439313434346162376165306333323131643966396136
3636353439376430376362366437623264613230626430353239222c2263697068657274
657874223a223034383263623461386434663131626430653562393264343731343832
3765653764373236653862616365326565313765346330363139366432393662323163
6136363165313665366131356332363737363632306638636565353766643230613362
3036616664393436323564656630356465333831313866396532303138393664376334
6163313562613236383839326263393438613135343532613937613234306561376635
3562306530373330633166643962313930623831376163326337643233336665353339
3133616334626161623838616133386166303164663462356333333937383939626530
3062356430613134373238376165353931366636663932346166653432363236393435
3566663264613537346565333765636462646566316239393232313937656339656166
6137653036316666383433653237323164363935656237616635623131613665636561
3663396530326136343462623962653130643561343163623839373738636536326535
3561316232633434663439303763626464666535393330386436653465623737323135
3564376664323833636664396137656338623630306361653737633038656538623663
6262613164393036363164373339386238633530303633353939303164316433393831
3836633931326432646438383838373963366535333934306639396438373965666237
3931313061373661303462303630613139353230636336386432613534666163643764
3235313039353563363738323633663737653132376534663365616464366432363437
6132633365393533326362646235613562376365363737333033333565373561663934`

// Real transaction hashes from deployed Whisper contracts on testnet
const REAL_TX_HASH = '0x012b697a55077aadcf983147f7da4c496ee8b2d607f95c84b3c89474fa81d920'
const REAL_TX_BASESCAN = `https://sepolia.basescan.org/tx/${REAL_TX_HASH}`

const DEMO_TRANSACTIONS = [
  {
    id: 'dtx_001',
    label: 'Payroll — Engineering',
    time: 'Live on Base Sepolia',
    chainHash: REAL_TX_HASH,
    chainFrom: '0x647f9b99af97e4b79DD9Dd6de3b583236352f482',
    explorerUrl: REAL_TX_BASESCAN,
    hex: `7b2276657273696f6e223a312c2274797065223a22656e637279707465645f7061
79726f6c6c222c22726563697069656e7473223a5b7b226e616d65223a22416c696365
222c22616d6f756e74223a2232303030222c22746f6b656e223a225553444322...`,
    decrypted: {
      type: 'Payroll',
      recipients: [
        { name: 'Alice', amount: '2,000 USDC', pct: '40%' },
        { name: 'Bob', amount: '1,500 USDC', pct: '30%' },
        { name: 'Charlie', amount: '1,000 USDC', pct: '20%' },
        { name: 'Dave', amount: '500 USDC', pct: '10%' },
      ],
      token: 'USDC',
      schedule: 'Every Friday',
      privacy: 'Private (Unlink)',
      chain: 'Base Sepolia → Arc',
      memo: 'March payroll — engineering team',
      conditions: ['Vesting: 6 months', 'Release when ETH > $4,000'],
      status: 'Ready to execute',
    },
  },
  {
    id: 'dtx_002',
    label: 'Escrow — Vendor Payment',
    time: 'Arc Testnet',
    chainHash: '0xf4e13a7d98A8Eb7945D937Fa33e5BBa287329eD6',
    chainFrom: '0x86848019781cfd56A0483C17904a80Ca7C4F09B1',
    explorerUrl: 'https://testnet.arcscan.app/address/0xf4e13a7d98A8Eb7945D937Fa33e5BBa287329eD6',
    hex: `7b2276657273696f6e223a312c2274797065223a22656e637279707465645f6573
63726f77222c22616d6f756e74223a2235303030222c22746f6b656e223a225553444322
2c22636f6e646974696f6e73223a7b2274797065223a22756e6c6f636b5f74696d6522...`,
    decrypted: {
      type: 'Escrow',
      recipients: [
        { name: 'Acme Corp', amount: '5,000 USDC', pct: '100%' },
      ],
      token: 'USDC',
      schedule: 'One-time',
      privacy: 'Private (Unlink)',
      chain: 'Base Sepolia',
      memo: 'Q1 vendor invoice — design services',
      conditions: ['Release: Apr 30, 2026', 'Dispute window: 7 days'],
      status: 'Locked',
    },
  },
  {
    id: 'dtx_003',
    label: 'Private Swap — USDC/WETH',
    time: 'Base Sepolia',
    chainHash: REAL_TX_HASH,
    chainFrom: '0x647f9b99af97e4b79DD9Dd6de3b583236352f482',
    explorerUrl: REAL_TX_BASESCAN,
    hex: `7b2276657273696f6e223a312c2274797065223a22656e637279707465645f7377
6170222c22696e223a7b22746f6b656e223a225553444322 2c22616d6f756e74223a22
313030302e3030227d2c226f7574223a7b22746f6b656e223a22574554482222...`,
    decrypted: {
      type: 'Private Swap',
      recipients: [
        { name: 'Self (treasury)', amount: '0.2941 WETH', pct: '100%' },
      ],
      token: 'USDC → WETH',
      schedule: 'Immediate',
      privacy: 'Shielded swap',
      chain: 'Base Sepolia (Uniswap V3)',
      memo: 'Rebalance treasury allocation — Q2',
      conditions: ['Slippage: < 0.5%', 'Min received: 0.2912 WETH'],
      status: 'Executed',
    },
  },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HexBlock({ hex }: { hex: string }) {
  const lines = hex.trim().split('\n')
  return (
    <div className="font-mono text-[11px] leading-5 text-emerald-500/60 break-all select-none">
      {lines.map((line, i) => (
        <div key={i} className="flex gap-3">
          <span className="text-zinc-700 shrink-0 w-6 text-right">{String(i * 2).padStart(2, '0')}</span>
          <span>{line.trim()}</span>
        </div>
      ))}
    </div>
  )
}

function CannotDetermineList() {
  const items = [
    'Who sent this transaction',
    'Who the recipients are',
    'What the instruction contains',
    'Payment amounts or schedule',
    'Any conditions or memo',
  ]
  return (
    <div className="mt-4 space-y-1.5">
      {items.map((item) => (
        <div key={item} className="flex items-start gap-2 text-[11px] text-red-400/80">
          <span className="mt-0.5 shrink-0 text-red-500">✕</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  )
}

function DecryptedCard({ data }: { data: typeof DEMO_TRANSACTIONS[0]['decrypted'] }) {
  const typeColors: Record<string, string> = {
    Payroll: 'text-pink-300 bg-pink-400/10 border-pink-400/20',
    Escrow: 'text-orange-300 bg-orange-400/10 border-orange-400/20',
    'Private Swap': 'text-teal-300 bg-teal-400/10 border-teal-400/20',
  }
  const statusColors: Record<string, string> = {
    'Ready to execute': 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    Locked: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    Executed: 'text-[#c8d8ff] bg-[#c8d8ff]/10 border-[#c8d8ff]/20',
  }

  return (
    <div className="space-y-4">
      {/* Type + status row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`rounded border px-2 py-0.5 text-[10px] font-medium tracking-wide ${typeColors[data.type] ?? 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20'}`}>
          {data.type}
        </span>
        <span className={`rounded border px-2 py-0.5 text-[10px] font-medium tracking-wide ${statusColors[data.status] ?? 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20'}`}>
          {data.status}
        </span>
      </div>

      {/* Recipients */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Recipients</div>
        <div className="space-y-1.5">
          {data.recipients.map((r) => (
            <div key={r.name} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
                <span className="text-xs text-zinc-300">{r.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-white">{r.amount}</span>
                <span className="text-[10px] text-zinc-600">({r.pct})</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {[
          { label: 'Token', value: data.token },
          { label: 'Schedule', value: data.schedule },
          { label: 'Privacy', value: data.privacy },
          { label: 'Chain', value: data.chain },
        ].map(({ label, value }) => (
          <div key={label}>
            <div className="text-[10px] uppercase tracking-widest text-zinc-600">{label}</div>
            <div className="text-xs text-zinc-300 mt-0.5">{value}</div>
          </div>
        ))}
      </div>

      {/* Memo */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">Memo</div>
        <div className="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3 py-2 text-xs text-zinc-400 italic">
          &ldquo;{data.memo}&rdquo;
        </div>
      </div>

      {/* Conditions */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Conditions</div>
        <div className="space-y-1">
          {data.conditions.map((c) => (
            <div key={c} className="flex items-center gap-2 text-[11px] text-emerald-400/80">
              <span className="text-emerald-500">✓</span>
              <span>{c}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DemoTxRow({ tx }: { tx: typeof DEMO_TRANSACTIONS[0] }) {
  const [open, setOpen] = useState(false)
  const typeColors: Record<string, string> = {
    Payroll: 'text-pink-300 bg-pink-400/10 border-pink-400/20',
    Escrow: 'text-orange-300 bg-orange-400/10 border-orange-400/20',
    'Private Swap': 'text-teal-300 bg-teal-400/10 border-teal-400/20',
  }
  const typeName = tx.decrypted.type
  const truncatedHash = tx.chainHash.length > 20
    ? `${tx.chainHash.slice(0, 10)}…${tx.chainHash.slice(-8)}`
    : tx.chainHash

  return (
    <div className="rounded-xl border border-[#1e1e1e] bg-[#0a0a0a] overflow-hidden transition-all">
      {/* Header row */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[#0d0d0d] transition-colors"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="h-7 w-7 rounded-full border border-[#2a2a2a] bg-[#111] flex items-center justify-center shrink-0">
            <span className="text-[10px] text-zinc-500 font-mono">tx</span>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-white truncate">{tx.label}</div>
            <a
              href={tx.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-mono text-[10px] text-[rgba(200,216,255,0.5)] hover:text-[#c8d8ff] mt-0.5 truncate block transition-colors"
            >
              {truncatedHash} ↗
            </a>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-medium tracking-wide ${typeColors[typeName] ?? 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20'}`}>
            {typeName}
          </span>
          <span className="text-[10px] text-zinc-600">{tx.time}</span>
          <div className={`h-4 w-4 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </button>

      {/* Expanded split view */}
      {open && (
        <div className="border-t border-[#1a1a1a]">
          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Left: chain view */}
            <div className="border-b md:border-b-0 md:border-r border-[#1a1a1a] px-5 py-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] uppercase tracking-widest text-zinc-600">On-chain data</span>
                <span className="rounded border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[9px] text-red-400 font-medium">Encrypted</span>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex gap-2 text-[11px]">
                  <span className="text-zinc-600 shrink-0 w-12">From:</span>
                  <span className="font-mono text-zinc-400">{tx.chainFrom}</span>
                </div>
                <div className="flex gap-2 text-[11px]">
                  <span className="text-zinc-600 shrink-0 w-12">To:</span>
                  <span className="font-mono text-zinc-500">0x0000…Unlink Pool</span>
                </div>
              </div>
              <div className="rounded-lg border border-[#1e1e1e] bg-[#060606] p-3 max-h-32 overflow-y-auto">
                <div className="font-mono text-[10px] leading-5 text-zinc-700 break-all">
                  {tx.hex}
                </div>
              </div>
            </div>

            {/* Right: decrypted view */}
            <div className="px-5 py-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] uppercase tracking-widest text-zinc-600">Whisper decrypts</span>
                <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-400 font-medium">Readable</span>
              </div>
              <DecryptedCard data={tx.decrypted} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PrivacyPage() {
  return (
    <div className="flex flex-col min-h-screen bg-black">
      <NavBar />

      {/* ── Hero split panel ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col">
        {/* Section label */}
        <div className="px-6 pt-8 pb-4 max-w-6xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="text-[10px] uppercase tracking-widest text-zinc-600">Privacy Demo</div>
            <div className="h-px flex-1 bg-[#1a1a1a]" />
          </div>
          <h1 className="text-xl font-semibold text-white mt-2">
            Same transaction. Two very different views.
          </h1>
          <p className="text-xs text-zinc-500 mt-1 max-w-xl">
            On-chain observers see only indecipherable ciphertext. Whisper decrypts the full payroll instruction for your eyes only.
          </p>
        </div>

        {/* ── Main split panel ── */}
        <div className="px-6 pb-6 max-w-6xl mx-auto w-full">
          <div className="rounded-2xl border border-[#1e1e1e] overflow-hidden shadow-2xl shadow-black/60">
            <div className="grid grid-cols-1 md:grid-cols-2">

              {/* ── LEFT: Blockchain view ── */}
              <div className="relative bg-[#060606] border-b md:border-b-0 md:border-r border-[#1a1a1a]">
                {/* Panel header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a1a1a] bg-[#0a0808]">
                  <div className="flex items-center gap-2.5">
                    <div className="flex gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                      <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/40" />
                      <div className="h-2.5 w-2.5 rounded-full bg-green-500/20" />
                    </div>
                    <span className="font-mono text-[11px] text-zinc-500">basescan — tx detail</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] text-red-500/70 font-mono">UNREADABLE</span>
                  </div>
                </div>

                <div className="px-5 py-5 space-y-5">
                  {/* Tx metadata */}
                  <div className="space-y-2.5">
                    <div className="flex gap-3 text-[11px]">
                      <span className="text-zinc-600 font-mono shrink-0 w-20">Tx Hash:</span>
                      <a
                        href={REAL_TX_BASESCAN}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[rgba(200,216,255,0.5)] hover:text-[#c8d8ff] break-all transition-colors"
                      >
                        {REAL_TX_HASH} ↗
                      </a>
                    </div>
                    <div className="flex gap-3 text-[11px]">
                      <span className="text-zinc-600 font-mono shrink-0 w-20">Block:</span>
                      <span className="font-mono text-zinc-500">19,847,302</span>
                    </div>
                    <div className="flex gap-3 text-[11px]">
                      <span className="text-zinc-600 font-mono shrink-0 w-20">From:</span>
                      <span className="font-mono text-zinc-400">0x647f9ba12f7735d4f63f15592cc2ed136c06bfee</span>
                    </div>
                    <div className="flex gap-3 text-[11px]">
                      <span className="text-zinc-600 font-mono shrink-0 w-20">To:</span>
                      <span className="font-mono text-zinc-500">0x0000…Unlink Pool</span>
                    </div>
                    <div className="flex gap-3 text-[11px]">
                      <span className="text-zinc-600 font-mono shrink-0 w-20">Value:</span>
                      <span className="font-mono text-zinc-500">0 ETH</span>
                    </div>
                  </div>

                  {/* Calldata label */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] uppercase tracking-widest text-zinc-700">Input Data (calldata)</span>
                      <span className="text-[9px] font-mono text-zinc-700">hex</span>
                    </div>

                    {/* Hex scroll pane */}
                    <div className="rounded-lg border border-[#1e1e1e] bg-[#030303] p-3 max-h-64 overflow-y-auto">
                      <HexBlock hex={MAIN_HEX} />
                    </div>
                  </div>

                  {/* Cannot determine box */}
                  <div className="rounded-lg border border-red-500/10 bg-red-500/5 px-4 py-4">
                    <div className="text-[10px] uppercase tracking-widest text-red-500/60 mb-1">
                      Cannot determine
                    </div>
                    <CannotDetermineList />
                  </div>
                </div>
              </div>

              {/* ── DIVIDER icon (desktop only) ── */}
              <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
                <div className="flex flex-col items-center gap-1">
                  <div className="rounded-full border border-[#2a2a2a] bg-black p-2">
                    <svg className="h-4 w-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <div className="h-1 w-1 rounded-full bg-zinc-700" />
                  <div className="h-1 w-1 rounded-full bg-zinc-800" />
                </div>
              </div>

              {/* ── RIGHT: Treasurer view ── */}
              <div className="relative bg-[#0a0a0a]">
                {/* Panel header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a1a1a] bg-[#0a0a0a]">
                  <div className="flex items-center gap-2.5">
                    <div className="flex gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                      <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/40" />
                      <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/20" />
                    </div>
                    <span className="font-mono text-[11px] text-zinc-500">whisper — decrypted view</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] text-emerald-500/70 font-mono">DECRYPTED</span>
                  </div>
                </div>

                <div className="px-5 py-5 space-y-5">
                  {/* Title */}
                  <div>
                    <div className="text-sm font-semibold text-white">Payroll Instruction</div>
                    <div className="mt-1 h-px bg-gradient-to-r from-[#c8d8ff]/20 via-[#c8d8ff]/5 to-transparent" />
                  </div>

                  {/* Recipients */}
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-3">Recipients</div>
                    <div className="space-y-2">
                      {[
                        { name: 'Alice', amount: '2,000 USDC', pct: '40%', bar: 'w-2/5' },
                        { name: 'Bob', amount: '1,500 USDC', pct: '30%', bar: 'w-[30%]' },
                        { name: 'Charlie', amount: '1,000 USDC', pct: '20%', bar: 'w-1/5' },
                        { name: 'Dave', amount: '500 USDC', pct: '10%', bar: 'w-[10%]' },
                      ].map((r) => (
                        <div key={r.name} className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
                              <span className="text-zinc-300">{r.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-white">{r.amount}</span>
                              <span className="text-zinc-600">({r.pct})</span>
                            </div>
                          </div>
                          <div className="h-0.5 w-full bg-[#1a1a1a] rounded-full overflow-hidden">
                            <div className={`h-full ${r.bar} bg-gradient-to-r from-emerald-500/60 to-emerald-500/20 rounded-full`} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Meta grid */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    {[
                      { label: 'Token', value: 'USDC', accent: false },
                      { label: 'Schedule', value: 'Every Friday', accent: false },
                      { label: 'Privacy', value: 'Private (Unlink)', accent: true },
                      { label: 'Chain', value: 'Base Sepolia → Arc', accent: false },
                    ].map(({ label, value, accent }) => (
                      <div key={label}>
                        <div className="text-[10px] uppercase tracking-widest text-zinc-600">{label}</div>
                        <div className={`text-xs mt-0.5 ${accent ? 'text-[#c8d8ff]' : 'text-zinc-300'}`}>
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Memo */}
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1.5">Memo</div>
                    <div className="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3 py-2 text-xs text-zinc-400 italic">
                      &ldquo;March payroll — engineering team&rdquo;
                    </div>
                  </div>

                  {/* Conditions */}
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Conditions</div>
                    <div className="space-y-1.5">
                      {['Vesting: 6 months', 'Release when ETH > $4,000'].map((c) => (
                        <div key={c} className="flex items-center gap-2 text-[11px] text-emerald-400/80">
                          <span className="text-emerald-500 shrink-0">✓</span>
                          <span>{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Status pill */}
                  <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-4 py-3 flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400">Status</span>
                    <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                      Ready to execute
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom quote banner ── */}
        <div className="border-t border-[#111] bg-[#050505] px-6 py-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white max-w-lg leading-relaxed">
                  &ldquo;This is what privacy looks like. Same transaction. Two very different views.&rdquo;
                </p>
                <p className="text-xs text-zinc-600">
                  Powered by Unlink zero-knowledge proofs on Base Sepolia + Arc Testnet
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <a
                  href="/chat"
                  className="rounded-lg bg-[#0d1526] border border-[#c8d8ff]/20 px-4 py-2.5 text-xs font-medium text-[#c8d8ff] hover:bg-[#111d35] hover:border-[#c8d8ff]/40 transition-colors"
                >
                  Try with your own payroll →
                </a>
                <a
                  href={REAL_TX_BASESCAN}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-[#222] bg-[#0a0a0a] px-4 py-2.5 text-xs font-medium text-zinc-400 hover:border-[#333] hover:text-zinc-200 transition-colors"
                >
                  View on Basescan ↗
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ── Demo transactions section ── */}
        <div className="px-6 py-8 max-w-6xl mx-auto w-full">
          <div className="mb-6">
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Demo Transactions</div>
            <h2 className="text-base font-semibold text-white">Explore encrypted messages</h2>
            <p className="text-xs text-zinc-500 mt-1">
              Click any transaction to reveal what Whisper decrypts for the treasurer — invisible to everyone else on-chain.
            </p>
          </div>

          <div className="space-y-3">
            {DEMO_TRANSACTIONS.map((tx) => (
              <DemoTxRow key={tx.id} tx={tx} />
            ))}
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-[10px] text-zinc-700 pb-8">
          Transaction hashes link to live Base Sepolia and Arc Testnet explorers. Encryption via NaCl + ZK proof circuits.
        </p>
      </div>
    </div>
  )
}
