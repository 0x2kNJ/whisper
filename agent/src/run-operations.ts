import dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(process.cwd(), '../.env'), override: true })

import { createUnlinkClientWrapper, deposit, transfer, getBalances, buildUniswapExecuteCall } from './unlink.js'
import { getQuote } from './uniswap.js'
import { baseSepolia, arcTestnet, getEnvOrThrow } from './config.js'
import { createPublicClient, createWalletClient, http, parseUnits, encodeFunctionData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia as baseSepoliaChain } from 'viem/chains'

const USDC = baseSepolia.tokens.USDC.address
const WETH = baseSepolia.tokens.WETH.address

async function run() {
  const op = process.argv[2]

  if (op === 'deposit') {
    console.log('\n🔒 OPERATION: Deposit USDC into Unlink')
    console.log('═══════════════════════════════════════')
    const client = await createUnlinkClientWrapper(
      getEnvOrThrow('UNLINK_MNEMONIC'),
      getEnvOrThrow('BASE_SEPOLIA_RPC_URL')
    )
    console.log('Client created ✓')
    const result = await deposit(client, { token: USDC, amount: '2' })
    console.log('✅ Deposit result:', JSON.stringify(result, null, 2))
  }

  else if (op === 'balance') {
    console.log('\n💰 OPERATION: Check Unlink Balance')
    console.log('═══════════════════════════════════════')
    const client = await createUnlinkClientWrapper(
      getEnvOrThrow('UNLINK_MNEMONIC'),
      getEnvOrThrow('BASE_SEPOLIA_RPC_URL')
    )
    const balances = await getBalances(client)
    console.log('✅ Balances:', JSON.stringify(balances, null, 2))
  }

  else if (op === 'transfer') {
    console.log('\n📤 OPERATION: Private Transfer via Unlink')
    console.log('═══════════════════════════════════════')
    const client = await createUnlinkClientWrapper(
      getEnvOrThrow('UNLINK_MNEMONIC'),
      getEnvOrThrow('BASE_SEPOLIA_RPC_URL')
    )
    // Transfer 0.5 USDC to ourselves (demo tx)
    const result = await transfer(client, {
      token: USDC,
      recipientAddress: '0x712B593eB5Ae6dE062206880BE1BD0121a86ec21',
      amount: '0.5'
    })
    console.log('✅ Transfer result:', JSON.stringify(result, null, 2))
  }

  else if (op === 'quote') {
    console.log('\n💱 OPERATION: Uniswap Quote')
    console.log('═══════════════════════════════════════')
    const result = await getQuote({
      tokenIn: USDC,
      tokenOut: WETH,
      amount: (1 * 1_000_000).toString(), // 1 USDC
      chainId: 84532,
      swapper: '0x712B593eB5Ae6dE062206880BE1BD0121a86ec21',
      type: 'EXACT_INPUT',
    })
    console.log('✅ Quote:', JSON.stringify(result, null, 2))
  }

  else if (op === 'escrow') {
    console.log('\n📋 OPERATION: Create Escrow on Arc')
    console.log('═══════════════════════════════════════')

    const escrowAddress = process.env.WHISPER_ESCROW_ADDRESS
    if (!escrowAddress) {
      console.error('❌ WHISPER_ESCROW_ADDRESS not set')
      process.exit(1)
    }

    const account = privateKeyToAccount(getEnvOrThrow('PRIVATE_KEY') as `0x${string}`)
    const arcChain = {
      id: 5042002,
      name: 'Arc Testnet',
      nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
      rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
    } as const

    const publicClient = createPublicClient({ chain: arcChain, transport: http() })
    const walletClient = createWalletClient({ account, chain: arcChain, transport: http() })

    const arcUSDC = '0x3600000000000000000000000000000000000000'
    const recipient1 = '0x1111111111111111111111111111111111111111'
    const recipient2 = '0x2222222222222222222222222222222222222222'

    // First approve USDC to escrow
    console.log('Approving USDC to escrow...')
    const approveData = encodeFunctionData({
      abi: [{ name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }],
      functionName: 'approve',
      args: [escrowAddress as `0x${string}`, parseUnits('0.1', 6)]
    })

    const approveTx = await walletClient.sendTransaction({
      to: arcUSDC as `0x${string}`,
      data: approveData,
    })
    console.log('Approve tx:', approveTx)
    await publicClient.waitForTransactionReceipt({ hash: approveTx })
    console.log('Approved ✓')

    // Create payroll with 1 milestone (immediate release, no oracle)
    console.log('Creating escrow payroll...')
    const createData = encodeFunctionData({
      abi: [{
        name: 'createPayroll',
        type: 'function',
        inputs: [
          { name: 'token', type: 'address' },
          { name: 'recipients', type: 'address[]' },
          { name: 'shares', type: 'uint256[]' },
          { name: 'milestones', type: 'tuple[]', components: [
            { name: 'amount', type: 'uint256' },
            { name: 'unlockTime', type: 'uint256' },
            { name: 'oracle', type: 'address' },
            { name: 'triggerPrice', type: 'uint256' },
            { name: 'operator', type: 'uint8' },
            { name: 'released', type: 'bool' },
          ]}
        ],
        outputs: [{ name: 'payrollId', type: 'uint256' }]
      }],
      functionName: 'createPayroll',
      args: [
        arcUSDC as `0x${string}`,
        [recipient1 as `0x${string}`, recipient2 as `0x${string}`],
        [6000n, 4000n], // 60% / 40% split
        [{
          amount: parseUnits('0.1', 6),
          unlockTime: 0n, // immediate
          oracle: '0x0000000000000000000000000000000000000000' as `0x${string}`,
          triggerPrice: 0n,
          operator: 0,
          released: false
        }]
      ]
    })

    const createTx = await walletClient.sendTransaction({
      to: escrowAddress as `0x${string}`,
      data: createData,
    })
    console.log('✅ Escrow created!')
    console.log('Tx hash:', createTx)
    console.log('Explorer: https://testnet.arcscan.app/tx/' + createTx)
  }

  else {
    console.log('Usage: npx tsx src/run-operations.ts <deposit|balance|transfer|quote|escrow>')
  }
}

run().catch(e => {
  console.error('❌ ERROR:', e.message)
  if (e.cause) console.error('Cause:', e.cause)
  process.exit(1)
})
