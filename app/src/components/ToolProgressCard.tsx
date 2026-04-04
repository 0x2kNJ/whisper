'use client'

/** Labels and estimated durations for tool progress indicators. */
const TOOL_PROGRESS: Record<string, { label: string; detail: string }> = {
  private_transfer: { label: 'Sending private transfer', detail: 'Generating ZK proof via Unlink...' },
  batch_private_transfer: { label: 'Running batch transfer', detail: 'Generating ZK proofs for all recipients...' },
  private_swap: { label: 'Executing private swap', detail: 'Routing through Uniswap + Unlink ZK proof...' },
  deposit_to_unlink: { label: 'Depositing to privacy pool', detail: 'Approving ERC-20 + depositing via Permit2...' },
  create_escrow: { label: 'Creating escrow', detail: 'Bridging via CCTP V2 to Arc Testnet...' },
  private_cross_chain_transfer: { label: 'Cross-chain transfer', detail: 'Unlink execute + CCTP V2 bridge...' },
  get_quote: { label: 'Fetching swap quote', detail: 'Querying Uniswap V3...' },
  verify_payment_proof: { label: 'Verifying income', detail: 'Resolving ENS + reading proof records...' },
  resolve_ens: { label: 'Resolving ENS name', detail: 'Querying Ethereum Sepolia...' },
  check_balance: { label: 'Checking balance', detail: 'Reading Unlink pool state...' },
  encrypt_payroll_message: { label: 'Encrypting payroll', detail: 'NaCl box encryption...' },
}

interface ToolProgressCardProps {
  toolName: string
}

export default function ToolProgressCard({ toolName }: ToolProgressCardProps) {
  const info = TOOL_PROGRESS[toolName] ?? {
    label: toolName.replace(/_/g, ' '),
    detail: 'Processing...',
  }

  return (
    <div className="animate-slide-up my-2 rounded-lg border border-[rgba(200,216,255,0.15)] bg-[rgba(200,216,255,0.04)] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="relative h-4 w-4 shrink-0">
          <svg className="h-4 w-4 animate-spin text-[#c8d8ff]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[#c8d8ff] text-sm font-medium">{info.label}</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">{info.detail}</div>
        </div>
      </div>
      {/* Indeterminate progress bar */}
      <div className="h-0.5 w-full bg-[rgba(200,216,255,0.08)] overflow-hidden">
        <div
          className="h-full w-1/3 bg-[#c8d8ff]/40 rounded-full"
          style={{ animation: 'indeterminate 1.5s ease-in-out infinite' }}
        />
      </div>
    </div>
  )
}
