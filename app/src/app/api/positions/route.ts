import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

interface Strategy {
  id: string
  name: string
  type: string
  status: string
  recipients: Array<{ name?: string; address: string; amount: string }>
  token: string
  schedule: string
  privacyLevel: string
  totalBudget?: string
  spent: string
  executions: Array<{ timestamp: number; amount: string; success: boolean }>
  createdAt: number
  lastExecutedAt?: number
}

export async function GET() {
  try {
    const strategiesDir = path.resolve(process.cwd(), '../agent/data/strategies')
    const positions: Array<Strategy & { progress: number; executionCount: number }> = []

    if (fs.existsSync(strategiesDir)) {
      const files = fs.readdirSync(strategiesDir).filter(f => f.endsWith('.json'))

      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(strategiesDir, file), 'utf-8')
          const data: Strategy = JSON.parse(raw)

          const spent = parseFloat(data.spent || '0')
          const budget = parseFloat(data.totalBudget || '0')
          const progress = budget > 0 ? Math.round((spent / budget) * 100) : 0

          positions.push({
            ...data,
            progress,
            executionCount: data.executions?.length || 0,
          })
        } catch {}
      }
    }

    // Sort: active first, then by lastExecutedAt desc, then by createdAt desc
    positions.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1
      if (a.status !== 'active' && b.status === 'active') return 1
      const aTime = a.lastExecutedAt || a.createdAt
      const bTime = b.lastExecutedAt || b.createdAt
      return bTime - aTime
    })

    return NextResponse.json({ positions })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch positions'
    return NextResponse.json({ error: message, positions: [] }, { status: 500 })
  }
}
