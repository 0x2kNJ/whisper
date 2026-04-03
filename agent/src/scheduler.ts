/**
 * Recurring payroll scheduler for Whisper — private AI treasury agent.
 *
 * Persists PayrollConfig JSON files under agent/data/payroll-configs/.
 * Checks every 60 seconds for due payrolls and executes them via
 * Unlink batchTransfer. Appends execution results to agent/data/payroll-log.jsonl.
 *
 * Security: each config must carry a valid EIP-191 signature from ownerAddress
 * before execution is allowed.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { verifyMessage } from 'viem'
import type { PayrollConfig } from './types.js'
import { batchTransfer, createUnlinkClientWrapper } from './unlink.js'
import { baseSepolia, getEnvOrThrow } from './config.js'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Resolve relative to agent/ root (one level up from src/)
const AGENT_ROOT = path.resolve(__dirname, '..')
const CONFIGS_DIR = path.join(AGENT_ROOT, 'data', 'payroll-configs')
const LOG_FILE = path.join(AGENT_ROOT, 'data', 'payroll-log.jsonl')

function ensureDirs(): void {
  fs.mkdirSync(CONFIGS_DIR, { recursive: true })
  // Ensure parent of log file exists
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
}

// ---------------------------------------------------------------------------
// Extended config type stored on disk (includes runtime tracking)
// ---------------------------------------------------------------------------

type StoredPayrollConfig = PayrollConfig & {
  lastExecuted?: number
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

/** Save a payroll config to disk as {id}.json. */
export async function savePayrollConfig(config: PayrollConfig): Promise<void> {
  ensureDirs()
  const filePath = path.join(CONFIGS_DIR, `${config.id}.json`)
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8')
  console.log(`[scheduler] Saved payroll config: ${config.id}`)
}

/** Load all payroll configs from disk. */
export async function loadPayrollConfigs(): Promise<PayrollConfig[]> {
  ensureDirs()
  const files = fs.readdirSync(CONFIGS_DIR).filter((f) => f.endsWith('.json'))
  const configs: PayrollConfig[] = []
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(CONFIGS_DIR, file), 'utf8')
      const config = JSON.parse(raw) as PayrollConfig
      configs.push(config)
    } catch (err) {
      console.warn(`[scheduler] Failed to parse config file ${file}:`, err)
    }
  }
  return configs
}

/** Delete a payroll config by id. */
export async function deletePayrollConfig(id: string): Promise<void> {
  ensureDirs()
  const filePath = path.join(CONFIGS_DIR, `${id}.json`)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
    console.log(`[scheduler] Deleted payroll config: ${id}`)
  } else {
    console.warn(`[scheduler] Config not found for deletion: ${id}`)
  }
}

// ---------------------------------------------------------------------------
// Schedule parsing
// ---------------------------------------------------------------------------

const MS_MINUTE = 60 * 1_000
const MS_HOUR = 60 * MS_MINUTE
const MS_DAY = 24 * MS_HOUR
const MS_WEEK = 7 * MS_DAY

/**
 * Parse a simple human-readable schedule string into an interval in ms.
 *
 * Supported values (case-insensitive):
 *   "daily"             → every 24 hours
 *   "weekly"            → every 7 days
 *   "monthly"           → every 30 days
 *   "every friday"      → every 7 days (alias for weekly, anchored externally)
 *   "biweekly"          → every 14 days
 *   "every <N> days"    → every N days
 *   "every <N> hours"   → every N hours
 *   "every <N> minutes" → every N minutes
 */
export function parseSchedule(schedule: string): {
  intervalMs: number
  description: string
} {
  const s = schedule.trim().toLowerCase()

  // "every <N> <unit>"
  const everyN = s.match(/^every\s+(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks)$/)
  if (everyN) {
    const n = parseInt(everyN[1], 10)
    const unit = everyN[2]
    if (unit.startsWith('minute')) {
      return { intervalMs: n * MS_MINUTE, description: `Every ${n} minute(s)` }
    }
    if (unit.startsWith('hour')) {
      return { intervalMs: n * MS_HOUR, description: `Every ${n} hour(s)` }
    }
    if (unit.startsWith('day')) {
      return { intervalMs: n * MS_DAY, description: `Every ${n} day(s)` }
    }
    if (unit.startsWith('week')) {
      return { intervalMs: n * MS_WEEK, description: `Every ${n} week(s)` }
    }
  }

  // Named weekday aliases ("every monday", "every friday", etc.)
  if (/^every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/.test(s)) {
    const day = s.replace('every ', '')
    return { intervalMs: MS_WEEK, description: `Every ${day}` }
  }

  switch (s) {
    case 'daily':
      return { intervalMs: MS_DAY, description: 'Daily' }
    case 'weekly':
      return { intervalMs: MS_WEEK, description: 'Weekly' }
    case 'biweekly':
      return { intervalMs: 14 * MS_DAY, description: 'Bi-weekly (every 2 weeks)' }
    case 'monthly':
      return { intervalMs: 30 * MS_DAY, description: 'Monthly (every 30 days)' }
    default:
      // Unknown — default to weekly and warn
      console.warn(
        `[scheduler] Unknown schedule "${schedule}", defaulting to weekly`,
      )
      return { intervalMs: MS_WEEK, description: `Weekly (fallback for "${schedule}")` }
  }
}

// ---------------------------------------------------------------------------
// Due-check
// ---------------------------------------------------------------------------

/**
 * Returns true if the payroll has never run, or if enough time has elapsed
 * since the last execution based on the parsed schedule interval.
 */
export function isDue(config: StoredPayrollConfig): boolean {
  const { intervalMs } = parseSchedule(config.schedule)
  if (!config.lastExecuted) return true
  return Date.now() - config.lastExecuted >= intervalMs
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * The canonical message that must be signed when creating a payroll config.
 * Reconstructed deterministically from the config so it can be re-verified.
 */
function buildSignableMessage(config: PayrollConfig): string {
  return [
    `Whisper Payroll Authorization`,
    `ID: ${config.id}`,
    `Token: ${config.token}`,
    `Schedule: ${config.schedule}`,
    `Recipients: ${config.recipients.length}`,
    `Created: ${config.createdAt}`,
  ].join('\n')
}

async function verifyConfigSignature(config: PayrollConfig): Promise<boolean> {
  try {
    const message = buildSignableMessage(config)
    const valid = await verifyMessage({
      address: config.ownerAddress as `0x${string}`,
      message,
      signature: config.signature as `0x${string}`,
    })
    return valid
  } catch (err) {
    console.warn(
      `[scheduler] Signature verification threw for config ${config.id}:`,
      err,
    )
    return false
  }
}

// ---------------------------------------------------------------------------
// Execution log
// ---------------------------------------------------------------------------

interface LogEntry {
  id: string
  timestamp: number
  success: boolean
  txHash?: string
  error?: string
  recipients: number
  totalAmount: string
}

function appendLog(entry: LogEntry): void {
  ensureDirs()
  const line = JSON.stringify(entry) + '\n'
  fs.appendFileSync(LOG_FILE, line, 'utf8')
}

function computeTotalAmount(config: PayrollConfig): string {
  try {
    // Sum all recipient amounts as BigInt to avoid float precision issues
    const total = config.recipients.reduce((acc, r) => {
      // Amounts may be decimal strings like "100.5" — parse with parseFloat then multiply
      // by 1e6 (USDC) for safe integer arithmetic, then convert back
      const float = parseFloat(r.amount)
      return acc + BigInt(Math.round(float * 1_000_000))
    }, BigInt(0))
    // Return as a plain number string (units: micro-tokens, but readable enough for logs)
    const whole = total / BigInt(1_000_000)
    const frac = total % BigInt(1_000_000)
    return frac > 0n
      ? `${whole}.${frac.toString().padStart(6, '0').replace(/0+$/, '')}`
      : whole.toString()
  } catch {
    return config.recipients.map((r) => r.amount).join('+')
  }
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Execute a single payroll run via Unlink batchTransfer.
 *
 * Steps:
 *   1. Verify the owner's signature on the config.
 *   2. Build the transfers array from recipients.
 *   3. Call batchTransfer.
 *   4. Append to payroll-log.jsonl.
 */
export async function executePayroll(config: PayrollConfig): Promise<{
  success: boolean
  txHash?: string
  error?: string
}> {
  // 1. Verify signature
  const valid = await verifyConfigSignature(config)
  if (!valid) {
    const msg = `[scheduler] Invalid signature for payroll ${config.id} — skipping`
    console.warn(msg)
    appendLog({
      id: config.id,
      timestamp: Date.now(),
      success: false,
      error: 'Invalid owner signature',
      recipients: config.recipients.length,
      totalAmount: computeTotalAmount(config),
    })
    return { success: false, error: 'Invalid owner signature' }
  }

  // 2. Build Unlink client from environment
  let mnemonic: string
  let rpcUrl: string
  try {
    mnemonic = getEnvOrThrow('MNEMONIC')
    rpcUrl = baseSepolia.rpcUrl || getEnvOrThrow('BASE_SEPOLIA_RPC_URL')
  } catch (err) {
    const error = `Missing env configuration: ${err instanceof Error ? err.message : String(err)}`
    console.error(`[scheduler] ${error}`)
    appendLog({
      id: config.id,
      timestamp: Date.now(),
      success: false,
      error,
      recipients: config.recipients.length,
      totalAmount: computeTotalAmount(config),
    })
    return { success: false, error }
  }

  const client = createUnlinkClientWrapper(mnemonic, rpcUrl)

  // 3. Build transfers array
  const transfers = config.recipients.map((r) => ({
    recipientAddress: r.address,
    amount: r.amount,
  }))

  // 4. Execute
  try {
    console.log(
      `[scheduler] Executing payroll ${config.id} — ${transfers.length} recipients`,
    )
    const result = await batchTransfer(client, {
      token: config.token,
      transfers,
    })

    const entry: LogEntry = {
      id: config.id,
      timestamp: Date.now(),
      success: true,
      txHash: result.txHash,
      recipients: config.recipients.length,
      totalAmount: computeTotalAmount(config),
    }
    appendLog(entry)
    console.log(
      `[scheduler] Payroll ${config.id} succeeded — txHash: ${result.txHash}`,
    )
    return { success: true, txHash: result.txHash }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error(`[scheduler] Payroll ${config.id} failed:`, error)
    appendLog({
      id: config.id,
      timestamp: Date.now(),
      success: false,
      error,
      recipients: config.recipients.length,
      totalAmount: computeTotalAmount(config),
    })
    return { success: false, error }
  }
}

// ---------------------------------------------------------------------------
// Scheduler loop
// ---------------------------------------------------------------------------

let schedulerInterval: ReturnType<typeof setInterval> | null = null

/**
 * Tick function — loads all configs, checks which are due, and fires them.
 * Runs non-blocking: errors in individual payrolls are caught and logged.
 */
async function tick(): Promise<void> {
  let configs: StoredPayrollConfig[]
  try {
    configs = (await loadPayrollConfigs()) as StoredPayrollConfig[]
  } catch (err) {
    console.error('[scheduler] Failed to load payroll configs:', err)
    return
  }

  for (const config of configs) {
    if (!isDue(config)) continue

    console.log(`[scheduler] Payroll ${config.id} is due — executing…`)
    try {
      await executePayroll(config)
    } catch (err) {
      console.error(
        `[scheduler] Unexpected error executing payroll ${config.id}:`,
        err,
      )
      continue
    }

    // Update lastExecuted on disk
    config.lastExecuted = Date.now()
    try {
      const filePath = path.join(CONFIGS_DIR, `${config.id}.json`)
      fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8')
    } catch (err) {
      console.error(
        `[scheduler] Failed to persist lastExecuted for ${config.id}:`,
        err,
      )
    }
  }
}

/**
 * Start the scheduler. Checks every 60 seconds for due payrolls.
 * Safe to call multiple times — will not create duplicate intervals.
 */
export function startScheduler(): void {
  if (schedulerInterval !== null) {
    console.warn('[scheduler] Already running — ignoring startScheduler() call')
    return
  }
  ensureDirs()
  console.log('[scheduler] Starting — checking every 60 seconds')

  // Run once immediately, then on interval
  tick().catch((err) => console.error('[scheduler] Initial tick error:', err))

  schedulerInterval = setInterval(() => {
    tick().catch((err) => console.error('[scheduler] Tick error:', err))
  }, 60_000)

  // Ensure the interval doesn't prevent Node from exiting if nothing else is alive
  if (schedulerInterval.unref) schedulerInterval.unref()
}

/** Stop the scheduler. */
export function stopScheduler(): void {
  if (schedulerInterval === null) {
    console.warn('[scheduler] Not running — ignoring stopScheduler() call')
    return
  }
  clearInterval(schedulerInterval)
  schedulerInterval = null
  console.log('[scheduler] Stopped')
}
