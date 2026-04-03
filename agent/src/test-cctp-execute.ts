/**
 * Test: Unlink execute() → CCTP depositForBurn
 *
 * Tests whether Unlink's execute() can call CCTP's TokenMessenger
 * to burn USDC on Base Sepolia and mint on Arc Testnet.
 *
 * This is the critical path for cross-chain private payroll.
 * If this works: sender is Unlink pool, not user. Private cross-chain.
 * If this fails: we know the limitation and can document it honestly.
 */
import dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(process.cwd(), '../.env'), override: true })

import { createUnlink, unlinkAccount, unlinkEvm } from '@unlink-xyz/sdk'
import { mnemonicToAccount } from 'viem/accounts'
import { createPublicClient, createWalletClient, http, encodeFunctionData, parseUnits } from 'viem'
import { baseSepolia } from 'viem/chains'

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const CCTP_TOKEN_MESSENGER = '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5' // Base Sepolia TokenMessenger
const ARC_DOMAIN = 12 // Arc's CCTP domain — may need to verify this

// TokenMessenger ABI for depositForBurn
const TOKEN_MESSENGER_ABI = [
  {
    name: 'depositForBurn',
    type: 'function' as const,
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'mintRecipient', type: 'bytes32' },
      { name: 'burnToken', type: 'address' },
    ],
    outputs: [{ name: 'nonce', type: 'uint64' }],
    stateMutability: 'nonpayable' as const,
  },
] as const

async function main() {
  console.log('═══════════════════════════════════════════════')
  console.log('  TEST: Unlink execute() → CCTP depositForBurn')
  console.log('═══════════════════════════════════════════════\n')

  const mnemonic = process.env.UNLINK_MNEMONIC!
  const apiKey = process.env.UNLINK_API_KEY!
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL!

  const viemAccount = mnemonicToAccount(mnemonic)
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) })
  const walletClient = createWalletClient({ account: viemAccount, chain: baseSepolia, transport: http(rpcUrl) })

  console.log('1. Creating Unlink client...')
  const account = unlinkAccount.fromMnemonic({ mnemonic })
  const evm = unlinkEvm.fromViem({ publicClient: publicClient as any, walletClient: walletClient as any })
  const unlink = createUnlink({
    engineUrl: 'https://staging-api.unlink.xyz',
    apiKey,
    account,
    evm,
  })
  await unlink.ensureRegistered()
  console.log('   ✓ Client ready\n')

  // Check balance first
  console.log('2. Checking Unlink balance...')
  const balances = await unlink.getBalances()
  console.log('   Balances:', JSON.stringify(balances, null, 2))

  if (!balances.balances || balances.balances.length === 0) {
    console.log('\n   ⚠️  No balance in Unlink. Need to deposit first.')
    console.log('   Depositing 0.5 USDC...')
    try {
      const depositResult = await unlink.deposit({
        token: USDC,
        amount: '500000', // 0.5 USDC
      })
      console.log('   Deposit result:', JSON.stringify(depositResult))
      console.log('\n   ⏳ Waiting 30s for deposit to be relayed...')
      await new Promise(r => setTimeout(r, 30000))

      const b2 = await unlink.getBalances()
      console.log('   Updated balances:', JSON.stringify(b2))
      if (!b2.balances || b2.balances.length === 0) {
        console.log('   ❌ Still no balance. Deposit not yet confirmed.')
        console.log('   Run this script again in a few minutes.')
        process.exit(1)
      }
    } catch (e: any) {
      console.log('   ❌ Deposit failed:', e.message)
      process.exit(1)
    }
  }

  // Build CCTP calldata
  console.log('\n3. Building CCTP depositForBurn calldata...')

  // mintRecipient must be bytes32 — pad the address to 32 bytes
  const recipientAddress = viemAccount.address // send to self on Arc
  const mintRecipient = ('0x' + '00'.repeat(12) + recipientAddress.slice(2)) as `0x${string}`

  const amount = '100000' // 0.1 USDC (tiny amount for test)

  const approveCalldata = encodeFunctionData({
    abi: [{
      name: 'approve', type: 'function' as const,
      inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
      outputs: [{ type: 'bool' }],
      stateMutability: 'nonpayable' as const,
    }],
    functionName: 'approve',
    args: [CCTP_TOKEN_MESSENGER as `0x${string}`, BigInt(amount)],
  })

  const cctpCalldata = encodeFunctionData({
    abi: TOKEN_MESSENGER_ABI,
    functionName: 'depositForBurn',
    args: [
      BigInt(amount),
      ARC_DOMAIN,
      mintRecipient,
      USDC as `0x${string}`,
    ],
  })

  console.log('   Approve calldata:', approveCalldata.slice(0, 20) + '...')
  console.log('   CCTP calldata:', cctpCalldata.slice(0, 20) + '...')
  console.log('   Amount: 0.1 USDC')
  console.log('   Recipient:', recipientAddress, '(self on Arc)')
  console.log('   Destination domain:', ARC_DOMAIN)

  // Try Unlink execute()
  console.log('\n4. Calling Unlink execute() with CCTP calls...')
  try {
    const result = await unlink.execute({
      calls: [
        { to: USDC, data: approveCalldata },
        { to: CCTP_TOKEN_MESSENGER, data: cctpCalldata },
      ],
      withdrawals: [{ token: USDC, amount }],
      outputs: [], // no outputs — USDC is burned, not returned
    })

    console.log('\n   ✅ SUCCESS! Unlink execute() → CCTP worked!')
    console.log('   Result:', JSON.stringify(result, null, 2))
    console.log('\n   This means:')
    console.log('   • Sender on-chain = Unlink pool (0x647f9b99...) — PRIVATE')
    console.log('   • USDC burned on Base Sepolia')
    console.log('   • USDC will mint on Arc Testnet to', recipientAddress)
    console.log('   • Cross-chain private payroll is REAL')
  } catch (e: any) {
    console.log('\n   ❌ FAILED:', e.message)
    if (e.cause) console.log('   Cause:', e.cause.message || e.cause)
    console.log('\n   This means Unlink execute() cannot call CCTP directly.')
    console.log('   Possible reasons:')
    console.log('   • CCTP TokenMessenger address is wrong for Base Sepolia')
    console.log('   • Arc domain ID is incorrect')
    console.log('   • Unlink execute() restricts which contracts can be called')
    console.log('   • Insufficient Unlink balance')
    console.log('\n   Fallback: encrypt message + send as calldata in regular tx')
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
