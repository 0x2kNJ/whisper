/**
 * Whisper — send-private-message.ts
 *
 * Demo script that:
 *   1. Generates sender + recipient keypairs.
 *   2. Builds a demo payroll instruction (Alice 2 000 USDC, Bob 1 500 USDC).
 *   3. Encrypts it with NaCl box.
 *   4. Sends the encrypted blob as calldata on Base Sepolia.
 *   5. Prints the split-screen on-chain vs. treasurer view.
 *
 * Run with:  npx tsx src/send-private-message.ts
 */

import dotenv from 'dotenv'
import { resolve } from 'path'

// Load .env from project root (two levels up from agent/src/)
dotenv.config({ path: resolve(process.cwd(), '.env'), override: true })
dotenv.config({ path: resolve(process.cwd(), '../.env'), override: true })

import {
  createWalletClient,
  createPublicClient,
  http,
  type Hash,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia as baseSepoliaChain } from 'viem/chains'

import {
  generateKeyPair,
  encryptMessage,
  decryptMessage,
  encodeForOnChain,
  getPrivacyComparison,
  type PayrollMessage,
} from './messaging.js'
import { baseSepolia } from './config.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(hex: string, chars = 60): string {
  return hex.length > chars ? hex.slice(0, chars) + '...' : hex
}

function printDivider(): void {
  console.log('═'.repeat(68))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  printDivider()
  console.log(' PRIVATE PAYROLL MESSAGE — ON-CHAIN vs DECRYPTED')
  printDivider()

  // ── Step 1: Generate keypairs ──────────────────────────────────────────
  console.log('\n[1/4] Generating keypairs…')
  const senderKp    = generateKeyPair()
  const recipientKp = generateKeyPair()
  console.log(`      Sender    pubkey : ${senderKp.publicKey.slice(0, 20)}…`)
  console.log(`      Recipient pubkey : ${recipientKp.publicKey.slice(0, 20)}…`)

  // ── Step 2: Build demo payroll instruction ─────────────────────────────
  console.log('\n[2/4] Building payroll instruction…')
  const payrollMsg: PayrollMessage = {
    version: 1,
    type: 'payroll_instruction',
    payload: {
      recipients: [
        { name: 'Alice', address: '0x1111111111111111111111111111111111111111', amount: '2000' },
        { name: 'Bob',   address: '0x2222222222222222222222222222222222222222', amount: '1500' },
      ],
      token: 'USDC',
      schedule: 'weekly',
      memo: 'March payroll — engineering team',
    },
  }

  // ── Step 3: Encrypt ────────────────────────────────────────────────────
  console.log('[3/4] Encrypting…')
  const encrypted = encryptMessage(payrollMsg, recipientKp.publicKey, senderKp.secretKey)
  const calldata  = encodeForOnChain(encrypted) as `0x${string}`

  // ── Step 4: Send on-chain ──────────────────────────────────────────────
  console.log('[4/4] Sending transaction on Base Sepolia…')

  const rawPrivKey = process.env.PRIVATE_KEY
  let txHash: Hash | null = null

  if (!rawPrivKey) {
    console.warn('\n      ⚠  PRIVATE_KEY not set in .env — skipping on-chain send.')
    console.warn('      Set PRIVATE_KEY and BASE_SEPOLIA_RPC_URL to broadcast the tx.\n')
  } else {
    const privateKey = rawPrivKey as `0x${string}`
    const account    = privateKeyToAccount(privateKey)
    const rpcUrl     = baseSepolia.rpcUrl || process.env.BASE_SEPOLIA_RPC_URL || ''

    if (!rpcUrl) {
      console.warn('\n      ⚠  BASE_SEPOLIA_RPC_URL not set — skipping on-chain send.\n')
    } else {
      const walletClient = createWalletClient({
        account,
        chain: baseSepoliaChain,
        transport: http(rpcUrl),
      })
      const publicClient = createPublicClient({
        chain: baseSepoliaChain,
        transport: http(rpcUrl),
      })

      // Send to self (zero-value tx, data = encrypted blob)
      txHash = await walletClient.sendTransaction({
        to: account.address,
        value: 0n,
        data: calldata,
      })

      console.log(`      Waiting for receipt…`)
      await publicClient.waitForTransactionReceipt({ hash: txHash })
      console.log(`      Confirmed: ${txHash}`)
    }
  }

  // ── Step 5: Decrypt for verification ──────────────────────────────────
  const decrypted = decryptMessage(encrypted, recipientKp.secretKey)
  const comparison = getPrivacyComparison(encrypted, decrypted)

  // ── Print comparison ───────────────────────────────────────────────────
  printDivider()
  console.log()

  console.log('📡 WHAT THE BLOCKCHAIN SEES:')
  if (txHash) {
    console.log(`   Tx   : ${txHash}`)
  } else {
    console.log('   Tx   : (not sent — PRIVATE_KEY or RPC_URL missing)')
  }
  console.log(`   Data : ${truncate(comparison.blockchainView, 66)}`)
  console.log('         (encrypted — unreadable ciphertext)')

  console.log()
  console.log('🔓 WHAT THE TREASURER SEES:')
  const payload = JSON.parse(comparison.treasurerView) as typeof decrypted.payload
  console.log('   {')
  console.log('     "recipients": [')
  for (const r of payload.recipients) {
    console.log(`       { "name": "${r.name}", "address": "${r.address}", "amount": "${r.amount}" },`)
  }
  console.log('     ],')
  console.log(`     "token": "${payload.token}",`)
  console.log(`     "schedule": "${payload.schedule ?? ''}",`)
  console.log(`     "memo": "${payload.memo ?? ''}"`)
  console.log('   }')

  console.log()
  console.log('Privacy: ✅ Sender hidden (Unlink pool) | ✅ Message encrypted | ⚠️  Amount visible at CCTP layer')
  console.log()
  printDivider()
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
