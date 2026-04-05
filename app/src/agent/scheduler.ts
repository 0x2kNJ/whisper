/**
 * Recurring payroll scheduler — minimal Vercel-compatible version.
 * Only exports dryRunPayroll (used by tools.ts).
 */

import type { PayrollConfig } from './types'

function computeTotalAmount(config: PayrollConfig): string {
  return config.recipients
    .reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0)
    .toString()
}

export async function dryRunPayroll(config: PayrollConfig): Promise<string> {
  const total = computeTotalAmount(config)
  const lines: string[] = [
    '',
    '='.repeat(51),
    `  DRY RUN: Payroll ${config.id.slice(0, 8)}...`,
    '='.repeat(51),
    '',
    `  Strategy: ${(config as unknown as Record<string, unknown>).name || 'Unnamed'}`,
    `  Token: USDC`,
    `  Schedule: ${config.schedule}`,
    `  Privacy: Private (Unlink batch transfer)`,
    '',
    '  Recipients:',
  ]

  for (const r of config.recipients) {
    lines.push(`    - ${r.name || r.address.slice(0, 12) + '...'}: ${r.amount} USDC`)
  }

  lines.push('')
  lines.push(`  Total: ${total} USDC`)
  lines.push(`  Timestamp: ${new Date().toISOString()}`)
  lines.push('')
  lines.push('  Execution steps:')
  lines.push('    1. Load payroll config')
  lines.push('    2. Verify owner signature')
  lines.push('    3. Build batch transfer (1 ZK proof, ' + config.recipients.length + ' payments)')
  lines.push('    4. Execute via Unlink batchTransfer [DRY RUN - skipped]')
  lines.push('')
  lines.push('  Privacy: Sender = Unlink pool (0x647f9b99...) - NOT your address')
  lines.push('  On-chain: ' + config.recipients.length + ' recipients paid, 0 sender traces')
  lines.push('')
  lines.push('='.repeat(51))

  return lines.join('\n')
}
