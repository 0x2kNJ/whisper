import dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(process.cwd(), '../.env'), override: true })

import { createUnlink, unlinkAccount, unlinkEvm } from '@unlink-xyz/sdk'
import { mnemonicToAccount } from 'viem/accounts'
import { createPublicClient, createWalletClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'

async function main() {
  const mnemonic = process.env.UNLINK_MNEMONIC!
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL!
  const apiKey = process.env.UNLINK_API_KEY!

  const viemAccount = mnemonicToAccount(mnemonic)
  const pc = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) })
  const wc = createWalletClient({ account: viemAccount, chain: baseSepolia, transport: http(rpcUrl) })

  const account = unlinkAccount.fromMnemonic({ mnemonic })
  const evm = unlinkEvm.fromViem({ publicClient: pc as any, walletClient: wc as any })

  console.log('Creating client...')
  const unlink = createUnlink({
    engineUrl: 'https://staging-api.unlink.xyz',
    apiKey,
    account,
    evm,
  })
  await unlink.ensureRegistered()
  const addr = await unlink.getAddress()
  console.log('Unlink address:', addr)

  // Check balance before
  console.log('\nBalance before:')
  const b1 = await unlink.getBalances()
  console.log(JSON.stringify(b1))

  // Deposit 0.1 USDC (100000 raw units, 6 decimals)
  console.log('\nDepositing 0.1 USDC...')
  try {
    const result = await unlink.deposit({
      token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      amount: '100000',
    })
    console.log('Result:', JSON.stringify(result, null, 2))

    // Check if the deposit actually sent an on-chain tx
    console.log('\nChecking if USDC left our wallet...')
    const usdcBalance = await pc.readContract({
      address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`,
      abi: [{ name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }] as const,
      functionName: 'balanceOf',
      args: [viemAccount.address],
    })
    console.log('Wallet USDC after deposit:', Number(usdcBalance) / 1e6)

    // Wait and check Unlink balance
    console.log('\nWaiting 15s for relayer...')
    await new Promise(r => setTimeout(r, 15000))
    const b2 = await unlink.getBalances()
    console.log('Balance after:', JSON.stringify(b2))

    if (b2.balances && b2.balances.length > 0) {
      console.log('\n🎉 BALANCE FOUND! Deposit confirmed!')

      // Try a private transfer to self
      console.log('\nDoing private transfer of 0.01 USDC to self...')
      const txResult = await unlink.transfer({
        token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        recipientAddress: addr,
        amount: '10000',
      })
      console.log('✅ Transfer result:', JSON.stringify(txResult, null, 2))
    } else {
      console.log('\n⏳ No balance yet. Try running again in 1-2 minutes.')
    }
  } catch (e: any) {
    console.error('❌ Error:', e.message)
    if (e.cause) console.error('Cause:', JSON.stringify(e.cause, null, 2))
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
