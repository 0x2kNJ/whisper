/**
 * E2E On-Chain Test Suite
 *
 * Tests the core tool flows against live testnets:
 * 1. check_balance — Unlink pool balance on Base Sepolia
 * 2. private_transfer — Send USDC via Unlink (sender hidden)
 * 3. private_cross_chain_transfer — CCTP V2 burn (Base → Arc)
 * 4. create_escrow — WhisperEscrow on Arc Testnet
 * 5. check_escrow — Read escrow state
 * 6. verify_payment_proof — ENS ZK proof
 * 7. resolve_ens — ENS name resolution
 *
 * Run: npx tsx src/test-e2e-onchain.ts
 */
import dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(process.cwd(), '../.env'), override: true })

import { executeTool } from './tools.js'

const PASS = '✅'
const FAIL = '❌'
const SKIP = '⏭️'

interface TestResult {
  name: string
  status: 'pass' | 'fail' | 'skip'
  duration: number
  detail: string
}

const results: TestResult[] = []

async function runTest(name: string, fn: () => Promise<string>) {
  const start = Date.now()
  try {
    const raw = await fn()
    const parsed = JSON.parse(raw)
    const duration = Date.now() - start

    if (parsed.success === false) {
      results.push({ name, status: 'fail', duration, detail: parsed.error || 'success: false' })
      console.log(`${FAIL} ${name} (${duration}ms) — ${parsed.error || 'failed'}`)
    } else {
      results.push({ name, status: 'pass', duration, detail: JSON.stringify(parsed).slice(0, 120) })
      console.log(`${PASS} ${name} (${duration}ms)`)
    }
    return parsed
  } catch (err: any) {
    const duration = Date.now() - start
    results.push({ name, status: 'fail', duration, detail: err.message })
    console.log(`${FAIL} ${name} (${duration}ms) — ${err.message}`)
    return null
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════')
  console.log('  Whisper E2E On-Chain Tests')
  console.log('  Base Sepolia + Arc Testnet')
  console.log('═══════════════════════════════════════════════\n')

  // 1. Check balance
  console.log('── Step 1: Check Unlink Balance ──')
  const balResult = await runTest('check_balance', () =>
    executeTool('check_balance', {})
  )

  if (balResult) {
    const usdcBal = parseFloat(balResult.balances?.USDC || '0')
    console.log(`   USDC balance: ${usdcBal}`)
    if (usdcBal < 0.005) {
      console.log(`   ⚠️  Low balance — some tests may fail\n`)
    }
  }

  // 2. Resolve ENS
  console.log('\n── Step 2: Resolve ENS ──')
  await runTest('resolve_ens (alice.whisper.eth)', () =>
    executeTool('resolve_ens', { name: 'alice.whisper.eth' })
  )

  // 3. Verify payment proof
  console.log('\n── Step 3: Verify Payment Proof ──')
  await runTest('verify_payment_proof (alice.whisper.eth)', () =>
    executeTool('verify_payment_proof', { name: 'alice.whisper.eth' })
  )

  // 4. Private transfer (tiny amount)
  console.log('\n── Step 4: Private Transfer (0.001 USDC) ──')
  const transferResult = await runTest('private_transfer (0.001 USDC → alice)', () =>
    executeTool('private_transfer', {
      recipient: 'alice.whisper.eth',
      amount: '0.001',
      token: 'USDC',
    })
  )

  if (transferResult?.success) {
    console.log(`   TX: ${transferResult.txHash || transferResult.result?.txHash || 'n/a'}`)
    console.log(`   Verify: ${transferResult.verifyUrl || 'n/a'}`)
  }

  // 5. Check escrow (read existing — non-destructive)
  console.log('\n── Step 5: Check Escrow #1 ──')
  await runTest('check_escrow (payrollId: 1)', () =>
    executeTool('check_escrow', { payrollId: 1 })
  )

  // 6. Private cross-chain transfer (CCTP burn only — doesn't wait for attestation)
  console.log('\n── Step 6: Cross-Chain Transfer (0.001 USDC Base→Arc) ──')
  const cctpResult = await runTest('private_cross_chain_transfer (0.001 USDC)', async () => {
    // Get our Arc address first
    const balRaw = await executeTool('check_balance', {})
    const balParsed = JSON.parse(balRaw)
    // Use the wallet address from env
    const privateKey = process.env.PRIVATE_KEY
    if (!privateKey) throw new Error('PRIVATE_KEY not set')

    const { privateKeyToAccount } = await import('viem/accounts')
    const account = privateKeyToAccount(privateKey as `0x${string}`)

    return executeTool('private_cross_chain_transfer', {
      amount: '0.001',
      recipient: account.address,
    })
  })

  if (cctpResult?.success) {
    console.log(`   Bridge TX: ${cctpResult.txHash}`)
    console.log(`   Flow: ${cctpResult.flow?.join(' → ')}`)
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════')
  console.log('  SUMMARY')
  console.log('═══════════════════════════════════════════════')

  const passed = results.filter(r => r.status === 'pass').length
  const failed = results.filter(r => r.status === 'fail').length
  const skipped = results.filter(r => r.status === 'skip').length

  console.log(`  ${PASS} Passed: ${passed}`)
  console.log(`  ${FAIL} Failed: ${failed}`)
  console.log(`  ${SKIP} Skipped: ${skipped}`)
  console.log(`  Total: ${results.length}`)
  console.log()

  if (failed > 0) {
    console.log('  Failed tests:')
    for (const r of results.filter(r => r.status === 'fail')) {
      console.log(`    ${FAIL} ${r.name}: ${r.detail}`)
    }
  }

  console.log('\n═══════════════════════════════════════════════')
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
