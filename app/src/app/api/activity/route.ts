import { NextResponse } from 'next/server'
import { getAssistantMessagesWithToolCalls } from '@/lib/db'

export const dynamic = 'force-dynamic'

const TOOL_TYPE_MAP: Record<string, string> = {
  private_transfer: 'transfer',
  batch_private_transfer: 'transfer',
  schedule_payroll: 'payroll',
  execute_strategy: 'payroll',
  create_strategy: 'payroll',
  create_escrow: 'escrow',
  check_escrow: 'escrow',
  verify_payment_proof: 'verification',
  private_swap: 'swap',
  deposit_to_unlink: 'deposit',
  private_cross_chain_transfer: 'transfer',
}

interface ActivityItem {
  id: string
  type: string
  title: string
  detail: string
  amount?: string
  token?: string
  timestamp: number
  status: 'success' | 'failed' | 'pending'
  txHash?: string
}

/** Extract a human-readable name from a recipient field. */
function humanName(raw: unknown): string {
  const s = String(raw || 'unknown')
  // ENS name — show as-is
  if (s.endsWith('.eth')) return s
  // Raw unlink address — truncate
  if (s.startsWith('unlink1')) return `${s.slice(0, 10)}…${s.slice(-4)}`
  // EVM address — truncate
  if (s.startsWith('0x') && s.length > 12) return `${s.slice(0, 6)}…${s.slice(-4)}`
  return s
}

function buildTitle(tc: { name: string; input?: Record<string, unknown>; result?: string }): string {
  const input = tc.input || {}
  switch (tc.name) {
    case 'private_transfer':
      return `Private transfer — ${humanName(input.recipient || input.recipientAddress)}`
    case 'batch_private_transfer':
      return `Batch transfer — ${Array.isArray(input.transfers) ? input.transfers.length : '?'} recipients`
    case 'schedule_payroll':
      return 'Payroll scheduled'
    case 'create_strategy':
      return `Payroll configured — ${input.name || 'new strategy'}`
    case 'execute_strategy':
      return `Payroll executed — ${input.strategyId || 'strategy'}`
    case 'create_escrow':
      return `Escrow created — ${humanName(input.recipient)}`
    case 'verify_payment_proof':
      return `Income verified — ${input.name || input.ensName || 'unknown'}`
    case 'private_swap':
      return `Swap — ${input.tokenIn || input.fromToken || 'USDC'} → ${input.tokenOut || input.toToken || 'WETH'}`
    case 'deposit_to_unlink':
      return 'Deposit to Unlink vault'
    default:
      return tc.name.replace(/_/g, ' ')
  }
}

function buildDetail(tc: { name: string; input?: Record<string, unknown> }): string {
  const input = tc.input || {}
  switch (tc.name) {
    case 'private_transfer':
      return 'Shielded via Unlink pool'
    case 'batch_private_transfer':
      return `${Array.isArray(input.transfers) ? input.transfers.length : '?'} private transfers`
    case 'schedule_payroll':
      return `Schedule: ${input.schedule || 'unknown'}`
    case 'create_strategy':
      return `${input.schedule || 'Recurring'} · Private (Unlink)`
    case 'execute_strategy':
      return `Strategy execution`
    case 'create_escrow':
      return `Trigger: ${input.triggerCondition || input.operator || 'milestone-based'}`
    case 'verify_payment_proof':
      return 'ZK proof generated · ENS record updated'
    case 'private_swap':
      return 'Via Uniswap V3 through Unlink'
    case 'deposit_to_unlink':
      return 'USDC moved from public wallet to privacy pool'
    default:
      return ''
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    const items: ActivityItem[] = []
    const messages = getAssistantMessagesWithToolCalls()

    for (const msg of messages) {
      try {
        const tools = JSON.parse(msg.tool_calls)
        for (const tc of tools) {
          const type = TOOL_TYPE_MAP[tc.name]
          if (!type) continue

          let status: 'success' | 'failed' | 'pending' = 'success'
          let txHash: string | undefined
          if (tc.result) {
            try {
              const result = typeof tc.result === 'string' ? JSON.parse(tc.result) : tc.result
              if (result.error || result.status === 'failed') status = 'failed'
              // Extract txHash from result
              if (result.txHash) txHash = result.txHash
              else if (result.transactionHash) txHash = result.transactionHash
              else if (result.hash) txHash = result.hash
            } catch {
              if (typeof tc.result === 'string' && tc.result.toLowerCase().includes('error')) {
                status = 'failed'
              }
              // Try to extract txHash from string result
              if (typeof tc.result === 'string') {
                const hashMatch = tc.result.match(/0x[a-fA-F0-9]{64}/)
                if (hashMatch) txHash = hashMatch[0]
              }
            }
          }

          items.push({
            id: `${msg.id}-${tc.name}-${tc.timestamp || msg.created_at}`,
            type,
            title: buildTitle(tc),
            detail: buildDetail(tc),
            amount: tc.input?.amount?.toString(),
            token: tc.input?.token?.toString() || 'USDC',
            timestamp: tc.timestamp || msg.created_at,
            status,
            txHash,
          })
        }
      } catch {}
    }

    // Sort by timestamp desc and limit
    items.sort((a, b) => b.timestamp - a.timestamp)

    return NextResponse.json({ items: items.slice(0, limit) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch activity'
    return NextResponse.json({ error: message, items: [] }, { status: 500 })
  }
}
