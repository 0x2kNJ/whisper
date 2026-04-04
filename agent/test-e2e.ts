/**
 * E2E on-chain test runner for Whisper agent tools.
 * Runs real transactions on Base Sepolia testnet with small amounts.
 *
 * Usage: npx tsx test-e2e.ts
 */

import { executeTool } from './src/tools.js'

interface TestResult {
  name: string
  passed: boolean
  duration: number
  result?: unknown
  error?: string
}

const results: TestResult[] = []

async function runTest(name: string, toolName: string, input: Record<string, unknown>) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`TEST: ${name}`)
  console.log(`Tool: ${toolName}`)
  console.log(`Input: ${JSON.stringify(input)}`)
  console.log('='.repeat(60))

  const start = Date.now()
  try {
    const raw = await executeTool(toolName, input)
    const duration = Date.now() - start
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = { raw }
    }

    const success = parsed.success === true
    console.log(`Result (${duration}ms):`, JSON.stringify(parsed, null, 2))
    console.log(success ? '  PASSED' : '  FAILED (success !== true)')

    results.push({ name, passed: success, duration, result: parsed })
  } catch (err) {
    const duration = Date.now() - start
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`  ERROR (${duration}ms): ${msg}`)
    results.push({ name, passed: false, duration, error: msg })
  }
}

async function main() {
  console.log('Whisper E2E On-Chain Tests')
  console.log('Network: Base Sepolia (84532)')
  console.log(`Time: ${new Date().toISOString()}\n`)

  // 1. Check balance
  await runTest(
    'Check Unlink balance',
    'check_balance',
    {},
  )

  // 2. Get Uniswap quote
  await runTest(
    'Get Uniswap quote: 0.01 USDC -> WETH',
    'get_quote',
    { tokenIn: 'USDC', tokenOut: 'WETH', amount: '0.01' },
  )

  // 3. Private transfer
  await runTest(
    'Private transfer: 0.001 USDC to alice.whisper.eth',
    'private_transfer',
    { recipient: 'alice.whisper.eth', amount: '0.001', token: 'USDC' },
  )

  // 4. Verify income
  await runTest(
    'Verify income for alice.whisper.eth',
    'verify_payment_proof',
    { name: 'alice.whisper.eth' },
  )

  // ── Summary ──
  console.log(`\n${'='.repeat(60)}`)
  console.log('E2E TEST SUMMARY')
  console.log('='.repeat(60))

  let passed = 0
  let failed = 0
  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL'
    const icon = r.passed ? '\u2713' : '\u2717'
    console.log(`  ${icon} ${status}  ${r.name} (${r.duration}ms)`)
    if (r.passed) passed++
    else failed++
  }

  console.log(`\nTotal: ${results.length}  Passed: ${passed}  Failed: ${failed}`)

  if (failed > 0) {
    console.log('\nFailed tests:')
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error || JSON.stringify(r.result)}`)
    }
  }

  process.exit(failed > 0 ? 1 : 0)
}

main()
