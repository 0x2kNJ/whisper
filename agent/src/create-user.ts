import dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(process.cwd(), '../.env'), override: true })

import { createUnlink, unlinkAccount, unlinkEvm } from '@unlink-xyz/sdk'
import { mnemonicToAccount } from 'viem/accounts'
import { createPublicClient, createWalletClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'

async function main() {
  const mnemonic = process.env.UNLINK_MNEMONIC!
  const apiKey = process.env.UNLINK_API_KEY!
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL!

  console.log('Setting up accounts...')
  const viemAccount = mnemonicToAccount(mnemonic)
  console.log('EVM address:', viemAccount.address)

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) })
  const walletClient = createWalletClient({ account: viemAccount, chain: baseSepolia, transport: http(rpcUrl) })

  const account = unlinkAccount.fromMnemonic({ mnemonic })
  const evm = unlinkEvm.fromViem({ publicClient: publicClient as any, walletClient: walletClient as any })

  console.log('Creating Unlink client...')
  const unlink = createUnlink({
    engineUrl: 'https://staging-api.unlink.xyz',
    apiKey,
    account,
    evm,
  })

  console.log('Getting Unlink address...')
  const addr = await unlink.getAddress()
  console.log('Unlink address:', addr)

  console.log('\nRegistering user...')
  await unlink.ensureRegistered()
  console.log('Registered ✓')

  console.log('\nChecking balances...')
  const balances = await unlink.getBalances()
  console.log('Balances:', JSON.stringify(balances, null, 2))

  console.log('\nWaiting 20s for deposit to be relayed...')
  await new Promise(r => setTimeout(r, 20000))

  console.log('Checking balances...')
  const balances2 = await unlink.getBalances()
  console.log('Balances:', JSON.stringify(balances2, null, 2))

  if (balances2.balances && balances2.balances.length > 0) {
    console.log('\n🎉 Balance found! Doing private transfer of 0.1 USDC to self...')
    const unlinkAddr = await unlink.getAddress()
    const transferResult = await unlink.transfer({
      token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      recipientAddress: unlinkAddr,
      amount: '100000',
    })
    console.log('✅ Transfer result:', JSON.stringify(transferResult, null, 2))
  } else {
    console.log('No balance yet — deposit may still be processing. Try again in a minute.')
  }
}

main().catch(e => { console.error('❌ ERROR:', e.message); if (e.cause) console.error('Cause:', e.cause); process.exit(1) })
