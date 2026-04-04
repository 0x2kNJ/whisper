/**
 * Deposit USDC to Unlink, then test cross-chain transfer
 */
import dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(process.cwd(), '../.env'), override: true })

import { executeTool } from './tools.js'

async function main() {
  // Step 1: Check current balance
  console.log('1. Checking balance...')
  const bal = JSON.parse(await executeTool('check_balance', {}))
  console.log(`   USDC: ${bal.balances?.USDC || '0'}`)

  const usdcBal = parseFloat(bal.balances?.USDC || '0')

  if (usdcBal < 0.01) {
    // Step 2: Deposit
    console.log('\n2. Depositing 0.02 USDC to Unlink...')
    const dep = JSON.parse(await executeTool('deposit_to_unlink', { amount: '0.02', token: 'USDC' }))
    if (dep.success) {
      console.log(`   ✅ Deposited. TX: ${dep.txHash}`)
    } else {
      console.log(`   ❌ Deposit failed: ${dep.error}`)
      process.exit(1)
    }

    // Re-check balance
    console.log('\n   Re-checking balance...')
    const bal2 = JSON.parse(await executeTool('check_balance', {}))
    console.log(`   USDC: ${bal2.balances?.USDC || '0'}`)
  }

  // Step 3: CCTP transfer
  console.log('\n3. Cross-chain transfer (0.001 USDC → Arc)...')
  const { privateKeyToAccount } = await import('viem/accounts')
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`)

  const cctp = JSON.parse(await executeTool('private_cross_chain_transfer', {
    amount: '0.001',
    recipient: account.address,
  }))

  if (cctp.success) {
    console.log(`   ✅ CCTP burn succeeded!`)
    console.log(`   TX: ${cctp.txHash}`)
    console.log(`   Privacy: sender = Unlink adapter (hidden)`)
    cctp.flow?.forEach((s: string) => console.log(`   → ${s}`))
  } else {
    console.log(`   ❌ CCTP failed: ${cctp.error}`)
    if (cctp.debug) console.log(`   Debug:`, cctp.debug)
  }

  console.log('\n════════════════════════════════')
  console.log(cctp.success ? '  ALL E2E TESTS PASSED ✅' : '  CCTP TEST FAILED ❌')
  console.log('════════════════════════════════')
  process.exit(cctp.success ? 0 : 1)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
