/**
 * Test: Unlink execute() → CCTP V2 depositForBurn
 *
 * Single execute with approve + depositForBurn in the same calls array.
 * Per Unlink team: "If you tried to transfer some erc20 in execute you should
 * also create the approval call in the calls array."
 *
 * Architecture:
 *   Pool (0x647f...) → transfers USDC → Adapter (0x41BF...) → executes calls → CCTP TokenMessengerV2
 *   calls[0]: USDC.approve(TokenMessengerV2, amount)
 *   calls[1]: TokenMessengerV2.depositForBurn(amount, 26, recipient, USDC, ...)
 *
 * Key: withdraw more than burn amount so adapter has leftover for output re-deposit.
 */
import dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(process.cwd(), '../.env'), override: true })

import { encodeFunctionData, parseUnits } from 'viem'
import {
  createUnlinkClientWrapper,
  getBalances,
  execute,
} from './unlink.js'
import { getEnvOrThrow, CCTP_TOKEN_MESSENGER_V2, CCTP_ARC_DOMAIN } from './config.js'

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'

async function main() {
  console.log('═══════════════════════════════════════════════')
  console.log('  TEST: Unlink execute() → CCTP V2 depositForBurn')
  console.log('  (approve + depositForBurn in same calls array)')
  console.log('═══════════════════════════════════════════════\n')

  const mnemonic = getEnvOrThrow('UNLINK_MNEMONIC')
  const rpcUrl = getEnvOrThrow('BASE_SEPOLIA_RPC_URL')

  const client = createUnlinkClientWrapper(mnemonic, rpcUrl)
  const unlinkAddress = await client.sdk.getAddress()
  client.unlinkAddress = unlinkAddress

  console.log('1. Client ready')
  console.log('   EVM address:', client.evmAddress, '\n')

  // Check balance
  console.log('2. Checking Unlink balance...')
  const balances = await getBalances(client)
  const usdcBal = balances.find(b => b.symbol === 'USDC')
  console.log('   USDC:', usdcBal?.balance || '0')
  if (!usdcBal || parseFloat(usdcBal.balance) < 0.2) {
    console.log('   Need at least 0.2 USDC (0.1 burn + buffer). Exiting.')
    process.exit(1)
  }

  // Build calldata
  const recipientAddress = client.evmAddress
  const mintRecipient = ('0x' + '00'.repeat(12) + recipientAddress.slice(2).toLowerCase()) as `0x${string}`
  const burnAmount = '0.1'
  const rawBurnAmount = parseUnits(burnAmount, 6)
  const withdrawAmount = '0.11' // burn + 0.01 buffer for output re-deposit

  // calls[0]: approve
  const approveCalldata = encodeFunctionData({
    abi: [{
      name: 'approve', type: 'function' as const,
      inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
      outputs: [{ type: 'bool' }],
      stateMutability: 'nonpayable' as const,
    }],
    functionName: 'approve',
    args: [CCTP_TOKEN_MESSENGER_V2 as `0x${string}`, rawBurnAmount],
  })

  // calls[1]: depositForBurn (CCTP V2 — 7 params)
  const cctpCalldata = encodeFunctionData({
    abi: [{
      name: 'depositForBurn', type: 'function' as const,
      inputs: [
        { name: 'amount', type: 'uint256' },
        { name: 'destinationDomain', type: 'uint32' },
        { name: 'mintRecipient', type: 'bytes32' },
        { name: 'burnToken', type: 'address' },
        { name: 'destinationCaller', type: 'bytes32' },
        { name: 'maxFee', type: 'uint256' },
        { name: 'minFinalityThreshold', type: 'uint32' },
      ],
      outputs: [{ name: 'nonce', type: 'uint64' }],
      stateMutability: 'nonpayable' as const,
    }],
    functionName: 'depositForBurn',
    args: [
      rawBurnAmount,
      CCTP_ARC_DOMAIN,
      mintRecipient,
      USDC as `0x${string}`,
      ('0x' + '00'.repeat(32)) as `0x${string}`, // permissionless
      BigInt(0), // maxFee: 0 (testnet)
      0, // minFinalityThreshold: default
    ],
  })

  console.log('\n3. Executing approve + depositForBurn...')
  console.log('   Burn:', burnAmount, 'USDC | Withdraw:', withdrawAmount, 'USDC')
  console.log('   Recipient:', recipientAddress, '→ Arc domain', CCTP_ARC_DOMAIN)

  try {
    const result = await execute(client, {
      withdrawals: [{ token: USDC, amount: withdrawAmount }],
      calls: [
        { to: USDC, data: approveCalldata },
        { to: CCTP_TOKEN_MESSENGER_V2, data: cctpCalldata },
      ],
      outputs: [{ token: USDC, minAmount: '0' }],
      deadline: Math.floor(Date.now() / 1000) + 3600,
    })

    console.log('\n   ✅ SUCCESS!')
    console.log('   Tx ID:', result.txHash)

    // Fetch on-chain hash
    try {
      const resp = await client.api.GET('/transactions/{tx_id}' as any, {
        params: { path: { tx_id: result.txHash } },
      })
      const data = (resp.data as any)?.data || resp.data
      if (data?.tx_hash) console.log('   On-chain hash:', data.tx_hash)
    } catch {}

    console.log('\n   Private cross-chain transfer complete:')
    console.log('   • Sender: Unlink adapter — PRIVATE')
    console.log('   • Burned:', burnAmount, 'USDC on Base Sepolia')
    console.log('   • Minting:', burnAmount, 'USDC on Arc Testnet to', recipientAddress)
  } catch (e: any) {
    console.log('\n   ❌ FAILED:', e.message)

    const match = e.message.match(/Unlink transaction ([\w-]+)/)
    if (match) {
      try {
        const resp = await client.api.GET('/transactions/{tx_id}' as any, {
          params: { path: { tx_id: match[1] } },
        })
        const data = (resp.data as any)?.data || resp.data
        console.log('   Status:', data?.status, '| tx_hash:', data?.tx_hash || 'NOT SET')
      } catch {}
    }
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
