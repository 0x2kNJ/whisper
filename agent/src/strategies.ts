/**
 * Payroll Strategy Management — Whisper private AI treasury agent.
 *
 * Provides CRUD operations for named payroll strategies with predefined
 * templates. Each strategy is persisted as a JSON file under
 * agent/data/strategies/{id}.json and carries its full execution history.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'node:crypto'

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
  schedule: string           // "weekly", "biweekly", "monthly", "one-time"
  privacyLevel: 'private' | 'public'
  conditions?: {
    vestingDuration?: number   // seconds
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
    conditions: {
      vestingDuration: 31_536_000, // 12 months in seconds
    },
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
      oracleAddress: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419', // Chainlink ETH/USD mainnet
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
// Paths
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AGENT_ROOT = path.resolve(__dirname, '..')
const STRATEGIES_DIR = path.join(AGENT_ROOT, 'data', 'strategies')

function ensureStrategiesDir(): void {
  fs.mkdirSync(STRATEGIES_DIR, { recursive: true })
}

function strategyPath(id: string): string {
  return path.join(STRATEGIES_DIR, `${id}.json`)
}

// ---------------------------------------------------------------------------
// Low-level storage helpers
// ---------------------------------------------------------------------------

function readStrategyFile(id: string): PayrollStrategy | null {
  const filePath = strategyPath(id)
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as PayrollStrategy
  } catch {
    return null
  }
}

function writeStrategyFile(strategy: PayrollStrategy): void {
  ensureStrategiesDir()
  fs.writeFileSync(strategyPath(strategy.id), JSON.stringify(strategy, null, 2), 'utf8')
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Create a new payroll strategy and persist it to disk.
 */
export async function createStrategy(params: Partial<PayrollStrategy>): Promise<PayrollStrategy> {
  ensureStrategiesDir()

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

  writeStrategyFile(strategy)
  return strategy
}

/**
 * List all persisted payroll strategies.
 */
export async function listStrategies(): Promise<PayrollStrategy[]> {
  ensureStrategiesDir()

  const files = fs.readdirSync(STRATEGIES_DIR).filter((f) => f.endsWith('.json'))
  const strategies: PayrollStrategy[] = []

  for (const file of files) {
    const id = file.replace(/\.json$/, '')
    const strategy = readStrategyFile(id)
    if (strategy) strategies.push(strategy)
  }

  // Sort by creation time, newest first
  return strategies.sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Retrieve a single strategy by id. Returns null if not found.
 */
export async function getStrategy(id: string): Promise<PayrollStrategy | null> {
  return readStrategyFile(id)
}

/**
 * Apply partial updates to an existing strategy and persist.
 * Throws if the strategy does not exist.
 */
export async function updateStrategy(
  id: string,
  updates: Partial<PayrollStrategy>,
): Promise<PayrollStrategy> {
  const existing = readStrategyFile(id)
  if (!existing) throw new Error(`Strategy not found: ${id}`)

  // Prevent id from being changed
  const { id: _ignoredId, ...safeUpdates } = updates as PayrollStrategy & { id?: string }

  const updated: PayrollStrategy = { ...existing, ...safeUpdates, id }
  writeStrategyFile(updated)
  return updated
}

/**
 * Pause an active strategy. Idempotent for already-paused strategies.
 */
export async function pauseStrategy(id: string): Promise<PayrollStrategy> {
  const strategy = readStrategyFile(id)
  if (!strategy) throw new Error(`Strategy not found: ${id}`)
  if (strategy.status === 'completed') {
    throw new Error(`Cannot pause a completed strategy (id: ${id})`)
  }

  strategy.status = 'paused'
  writeStrategyFile(strategy)
  return strategy
}

/**
 * Resume a paused strategy. Idempotent for already-active strategies.
 */
export async function resumeStrategy(id: string): Promise<PayrollStrategy> {
  const strategy = readStrategyFile(id)
  if (!strategy) throw new Error(`Strategy not found: ${id}`)
  if (strategy.status === 'completed') {
    throw new Error(`Cannot resume a completed strategy (id: ${id})`)
  }

  strategy.status = 'active'
  writeStrategyFile(strategy)
  return strategy
}

/**
 * Permanently delete a strategy file. Returns true if deleted, false if it
 * did not exist.
 */
export async function deleteStrategy(id: string): Promise<boolean> {
  const filePath = strategyPath(id)
  if (!fs.existsSync(filePath)) return false
  fs.unlinkSync(filePath)
  return true
}

/**
 * Retrieve the execution history for a strategy.
 */
export async function getStrategyHistory(id: string): Promise<ExecutionRecord[]> {
  const strategy = readStrategyFile(id)
  if (!strategy) throw new Error(`Strategy not found: ${id}`)
  return strategy.executions
}

/**
 * Instantiate a new strategy from a named template, optionally overriding
 * any field. Deep-clones the template so mutations don't affect the source.
 */
export async function createFromTemplate(
  templateName: string,
  overrides: Partial<PayrollStrategy> = {},
): Promise<PayrollStrategy> {
  const template = STRATEGY_TEMPLATES[templateName]
  if (!template) {
    const available = Object.keys(STRATEGY_TEMPLATES).join(', ')
    throw new Error(
      `Unknown template "${templateName}". Available: ${available}`,
    )
  }

  // Deep-clone the template to avoid mutation
  const base = JSON.parse(JSON.stringify(template)) as typeof template

  return createStrategy({
    ...base,
    ...overrides,
    // Recipients from overrides fully replace template recipients when provided
    recipients: overrides.recipients ?? base.recipients,
    // Conditions are merged if both exist
    conditions:
      base.conditions || overrides.conditions
        ? { ...base.conditions, ...overrides.conditions }
        : undefined,
  })
}
