/**
 * Payroll Strategy Management — Whisper private AI treasury agent.
 * Persisted in Turso database (strategies table).
 */

import { randomUUID } from 'node:crypto'
import { dbSaveStrategy, dbGetStrategy, dbListStrategies, dbDeleteStrategy } from '@/lib/db'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PayrollStrategy {
  id: string
  name: string
  type: 'standard' | 'vesting' | 'performance' | 'contractor'
  status: 'active' | 'paused' | 'completed'
  recipients: Array<{ name: string; address: string; amount: string; share?: number }>
  token: string
  schedule: string
  privacyLevel: 'private' | 'public'
  conditions?: {
    vestingDuration?: number
    oracleAddress?: string
    triggerPrice?: string
    operator?: 'GT' | 'LT'
  }
  totalBudget?: string
  spent: string
  executions: ExecutionRecord[]
  createdAt: number
  lastExecutedAt?: number
}

export interface ExecutionRecord {
  timestamp: number
  txHash?: string
  amount: string
  recipients: number
  success: boolean
  error?: string
}

// ---------------------------------------------------------------------------
// Predefined templates
// ---------------------------------------------------------------------------

export const STRATEGY_TEMPLATES: Record<string, Omit<PayrollStrategy, 'id' | 'createdAt' | 'spent' | 'executions'>> = {
  standard_payroll: {
    name: 'Standard Team Payroll',
    type: 'standard',
    status: 'active',
    recipients: [
      { name: 'Alice (Engineering)', address: '0x0000000000000000000000000000000000000001', amount: '3500' },
      { name: 'Bob (Design)',        address: '0x0000000000000000000000000000000000000002', amount: '2800' },
      { name: 'Carol (Operations)',  address: '0x0000000000000000000000000000000000000003', amount: '2200' },
    ],
    token: 'USDC',
    schedule: 'weekly',
    privacyLevel: 'private',
    totalBudget: '500000',
  },
  vesting_schedule: {
    name: '12-Month Token Vesting',
    type: 'vesting',
    status: 'active',
    recipients: [
      { name: 'Co-Founder', address: '0x0000000000000000000000000000000000000004', amount: '10000', share: 6000 },
      { name: 'Early Hire', address: '0x0000000000000000000000000000000000000005', amount: '5000',  share: 4000 },
    ],
    token: 'USDC',
    schedule: 'monthly',
    privacyLevel: 'private',
    conditions: { vestingDuration: 31_536_000 },
    totalBudget: '180000',
  },
  performance_bonus: {
    name: 'ETH Price Performance Bonus',
    type: 'performance',
    status: 'active',
    recipients: [
      { name: 'Trading Desk Lead', address: '0x0000000000000000000000000000000000000006', amount: '5000', share: 5000 },
      { name: 'Quant Analyst',     address: '0x0000000000000000000000000000000000000007', amount: '5000', share: 5000 },
    ],
    token: 'USDC',
    schedule: 'one-time',
    privacyLevel: 'private',
    conditions: {
      oracleAddress: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
      triggerPrice: '4000',
      operator: 'GT',
    },
    totalBudget: '10000',
  },
  contractor_payment: {
    name: 'Contractor Delivery Payment',
    type: 'contractor',
    status: 'active',
    recipients: [
      { name: 'Contractor', address: '0x0000000000000000000000000000000000000008', amount: '7500' },
    ],
    token: 'USDC',
    schedule: 'one-time',
    privacyLevel: 'public',
    totalBudget: '7500',
  },
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

export async function createStrategy(params: Partial<PayrollStrategy>): Promise<PayrollStrategy> {
  const now = Date.now()
  const strategy: PayrollStrategy = {
    id: params.id ?? randomUUID(),
    name: params.name ?? 'Unnamed Strategy',
    type: params.type ?? 'standard',
    status: params.status ?? 'active',
    recipients: params.recipients ?? [],
    token: params.token ?? 'USDC',
    schedule: params.schedule ?? 'monthly',
    privacyLevel: params.privacyLevel ?? 'private',
    conditions: params.conditions,
    totalBudget: params.totalBudget,
    spent: params.spent ?? '0',
    executions: params.executions ?? [],
    createdAt: params.createdAt ?? now,
    lastExecutedAt: params.lastExecutedAt,
  }

  await dbSaveStrategy(strategy.id, JSON.stringify(strategy))
  return strategy
}

export async function listStrategies(): Promise<PayrollStrategy[]> {
  const rows = await dbListStrategies()
  const strategies: PayrollStrategy[] = []
  for (const row of rows) {
    try {
      strategies.push(JSON.parse(row.data) as PayrollStrategy)
    } catch {}
  }
  return strategies.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getStrategy(id: string): Promise<PayrollStrategy | null> {
  const data = await dbGetStrategy(id)
  if (!data) return null
  try {
    return JSON.parse(data) as PayrollStrategy
  } catch {
    return null
  }
}

export async function updateStrategy(
  id: string,
  updates: Partial<PayrollStrategy>,
): Promise<PayrollStrategy> {
  const existing = await getStrategy(id)
  if (!existing) throw new Error(`Strategy not found: ${id}`)

  const { id: _ignoredId, ...safeUpdates } = updates as PayrollStrategy & { id?: string }
  const updated: PayrollStrategy = { ...existing, ...safeUpdates, id }
  await dbSaveStrategy(id, JSON.stringify(updated))
  return updated
}

export async function pauseStrategy(id: string): Promise<PayrollStrategy> {
  const strategy = await getStrategy(id)
  if (!strategy) throw new Error(`Strategy not found: ${id}`)
  if (strategy.status === 'completed') throw new Error(`Cannot pause a completed strategy (id: ${id})`)
  strategy.status = 'paused'
  await dbSaveStrategy(id, JSON.stringify(strategy))
  return strategy
}

export async function resumeStrategy(id: string): Promise<PayrollStrategy> {
  const strategy = await getStrategy(id)
  if (!strategy) throw new Error(`Strategy not found: ${id}`)
  if (strategy.status === 'completed') throw new Error(`Cannot resume a completed strategy (id: ${id})`)
  strategy.status = 'active'
  await dbSaveStrategy(id, JSON.stringify(strategy))
  return strategy
}

export async function deleteStrategy(id: string): Promise<boolean> {
  return dbDeleteStrategy(id)
}

export async function getStrategyHistory(id: string): Promise<ExecutionRecord[]> {
  const strategy = await getStrategy(id)
  if (!strategy) throw new Error(`Strategy not found: ${id}`)
  return strategy.executions
}

export async function createFromTemplate(
  templateName: string,
  overrides: Partial<PayrollStrategy> = {},
): Promise<PayrollStrategy> {
  const template = STRATEGY_TEMPLATES[templateName]
  if (!template) {
    const available = Object.keys(STRATEGY_TEMPLATES).join(', ')
    throw new Error(`Unknown template "${templateName}". Available: ${available}`)
  }

  const base = JSON.parse(JSON.stringify(template)) as typeof template

  return createStrategy({
    ...base,
    ...overrides,
    recipients: overrides.recipients ?? base.recipients,
    conditions:
      base.conditions || overrides.conditions
        ? { ...base.conditions, ...overrides.conditions }
        : undefined,
  })
}
