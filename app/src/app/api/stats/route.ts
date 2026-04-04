import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getAssistantMessagesWithToolCalls } from '@/lib/db'

export const dynamic = 'force-dynamic'

const TX_TOOLS = [
  'private_transfer',
  'batch_private_transfer',
  'private_swap',
  'deposit_to_unlink',
  'create_escrow',
  'schedule_payroll',
  'execute_strategy',
]

const PRIVATE_TOOLS = [
  'private_transfer',
  'batch_private_transfer',
  'private_swap',
]

export async function GET() {
  try {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const messages = getAssistantMessagesWithToolCalls(monthStart.getTime())

    let totalMoved = 0
    let transactionCount = 0
    let payrollCount = 0
    let escrowCount = 0
    let transferCount = 0
    let swapCount = 0
    let privateCount = 0
    let totalTxCount = 0

    for (const msg of messages) {
      try {
        const tools = JSON.parse(msg.tool_calls)
        for (const tc of tools) {
          if (!TX_TOOLS.includes(tc.name)) continue
          transactionCount++
          totalTxCount++

          if (PRIVATE_TOOLS.includes(tc.name)) privateCount++

          if (tc.name === 'schedule_payroll' || tc.name === 'execute_strategy') payrollCount++
          else if (tc.name === 'create_escrow') escrowCount++
          else if (tc.name === 'private_swap') swapCount++
          else transferCount++

          const amount = parseFloat(tc.input?.amount || '0')
          if (!isNaN(amount)) totalMoved += amount

          if (tc.name === 'batch_private_transfer' && Array.isArray(tc.input?.transfers)) {
            for (const t of tc.input.transfers) {
              const a = parseFloat(t.amount || '0')
              if (!isNaN(a)) totalMoved += a
            }
          }
        }
      } catch {}
    }

    // Count active strategies
    const strategiesDir = path.resolve(process.cwd(), '../agent/data/strategies')
    let activePositions = 0
    let activePayrolls = 0
    let activeEscrows = 0

    if (fs.existsSync(strategiesDir)) {
      const files = fs.readdirSync(strategiesDir).filter(f => f.endsWith('.json'))
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(strategiesDir, file), 'utf-8'))
          if (data.status === 'active') {
            activePositions++
            if (data.type === 'standard' || data.type === 'contractor') activePayrolls++
            else activeEscrows++
          }
        } catch {}
      }
    }

    const privacyScore = totalTxCount > 0
      ? Math.round((privateCount / totalTxCount) * 100)
      : 100

    const breakdown = [
      payrollCount > 0 ? `${payrollCount} payrolls` : null,
      escrowCount > 0 ? `${escrowCount} escrows` : null,
      transferCount > 0 ? `${transferCount} transfers` : null,
      swapCount > 0 ? `${swapCount} swaps` : null,
    ].filter(Boolean).join(' · ') || 'No transactions'

    const activeBreakdown = [
      activePayrolls > 0 ? `${activePayrolls} payrolls` : null,
      activeEscrows > 0 ? `${activeEscrows} escrows` : null,
    ].filter(Boolean).join(' · ') || 'No active positions'

    return NextResponse.json({
      totalMoved,
      transactionCount,
      transactionBreakdown: breakdown,
      activePositions,
      activeBreakdown,
      privacyScore,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch stats'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
