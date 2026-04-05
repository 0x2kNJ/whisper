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

/** Known Unlink address → ENS name reverse map (loaded from address book). */
let _reverseMap: Record<string, string> | null = null

async function getReverseMap(): Promise<Record<string, string>> {
  if (_reverseMap) return _reverseMap
  try {
    const { dbLoadAddressBook } = await import('@/lib/db')
    const book = await dbLoadAddressBook()
    _reverseMap = {}
    for (const [name, addr] of Object.entries(book)) {
      const ensName = name.endsWith('.eth') ? name : `${name.toLowerCase()}.whisper.eth`
      _reverseMap[addr.toLowerCase()] = ensName
    }
  } catch {
    _reverseMap = {}
  }
  return _reverseMap
}

/** Extract a human-readable name from a recipient field. */
function humanName(raw: unknown, reverseMap?: Record<string, string>): string {
  const s = String(raw || 'unknown')

  // Unlink address (with or without .eth suffix) — try reverse map first
  if (s.startsWith('unlink1')) {
    // Strip any appended .eth suffix to get the raw address for lookup
    const rawAddr = s.includes('.') ? s.substring(0, s.indexOf('.')) : s
    const mapped = reverseMap?.[rawAddr.toLowerCase()]
    if (mapped) return mapped
    // If it has an ENS-like suffix (e.g. unlink1<hash>.whisper.eth), extract just the domain
    if (s.includes('.') && s.endsWith('.eth')) {
      const domain = s.substring(s.indexOf('.') + 1)
      // Only return the domain if it's a clean ENS name (not another mangled address)
      if (!domain.startsWith('unlink1') && domain.length < 60) return domain
    }
    return 'whisper.eth'
  }

  // Clean ENS name — show as-is
  if (s.endsWith('.eth') && s.length < 60) return s
  // Short name (likely already resolved) — show as-is
  if (!s.startsWith('0x') && s.length < 40) return s
  // EVM address — truncate
  if (s.startsWith('0x') && s.length > 12) return `${s.slice(0, 6)}…${s.slice(-4)}`
  return s
}

function extractNameFromResult(tc: { result?: string }): string | null {
  if (!tc.result) return null
  try {
    const r = typeof tc.result === 'string' ? JSON.parse(tc.result) : tc.result
    // Check verifyUrl for ENS name: /verify/alice.whisper.eth
    if (r.verifyUrl && typeof r.verifyUrl === 'string') {
      const match = r.verifyUrl.match(/\/verify\/([^/]+\.eth)/)
      // Only use if it's a clean ENS name (not a mangled unlink address)
      if (match && !match[1].startsWith('unlink1')) return match[1]
    }
    // Check recipient field
    if (r.recipient && typeof r.recipient === 'string' && r.recipient.endsWith('.eth') && !r.recipient.startsWith('unlink1')) return r.recipient
  } catch {}
  return null
}

function buildTitle(tc: { name: string; input?: Record<string, unknown>; result?: string }, reverseMap: Record<string, string>): string {
  const input = tc.input || {}
  switch (tc.name) {
    case 'private_transfer': {
      const name = extractNameFromResult(tc) || humanName(input.recipient || input.recipientAddress, reverseMap)
      return `Private transfer — ${name}`
    }
    case 'batch_private_transfer':
      return `Batch transfer — ${Array.isArray(input.transfers) ? input.transfers.length : '?'} recipients`
    case 'schedule_payroll':
      return 'Payroll scheduled'
    case 'create_strategy':
      return `Payroll configured — ${input.name || 'new strategy'}`
    case 'execute_strategy':
      return `Payroll executed — ${input.strategyId || 'strategy'}`
    case 'create_escrow':
      return `Smart escrow created — ${humanName(input.recipient, reverseMap)}`
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

    // Load address book reverse map for ENS name resolution
    const reverseMap = await getReverseMap()

    const items: ActivityItem[] = []
    const messages = await getAssistantMessagesWithToolCalls()

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
            title: buildTitle(tc, reverseMap),
            detail: buildDetail(tc),
            amount: tc.input?.amount?.toString()
              || (tc.name === 'batch_private_transfer' && Array.isArray(tc.input?.recipients)
                ? tc.input.recipients.reduce((sum: number, r: { amount?: string }) => sum + parseFloat(r.amount || '0'), 0).toString()
                : undefined),
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
