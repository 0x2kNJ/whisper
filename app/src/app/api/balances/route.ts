import { NextResponse } from 'next/server'
import { formatUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

export const dynamic = 'force-dynamic'
import { baseSepolia, getEnvOrThrow } from '@/agent/config'
import { createUnlinkClientWrapper, getBalances } from '@/agent/unlink'
import { dbReadBalanceCache } from '@/lib/db'

export async function GET() {
  try {
    const mnemonic = getEnvOrThrow('UNLINK_MNEMONIC')
    const rpcUrl = baseSepolia.rpcUrl || getEnvOrThrow('BASE_SEPOLIA_RPC_URL')
    const client = createUnlinkClientWrapper(mnemonic, rpcUrl)

    // Show the public wallet address in the header
    let wallet = client.evmAddress
    try {
      const pk = getEnvOrThrow('PRIVATE_KEY')
      const account = privateKeyToAccount(pk as `0x${string}`)
      wallet = account.address
    } catch {}

    const USDC_ADDR = baseSepolia.tokens.USDC.address.toLowerCase()
    const WETH_ADDR = '0x4200000000000000000000000000000000000006'

    // Get Unlink pool balances
    const rawBalances = await getBalances(client)

    let poolUsdc = 0
    let poolWeth = 0

    for (const b of rawBalances as Array<{ token: string; balance: string }>) {
      const addr = b.token.toLowerCase()
      if (addr === USDC_ADDR) {
        poolUsdc += parseFloat(b.balance)
      } else if (addr === WETH_ADDR) {
        poolWeth += parseFloat(b.balance)
      }
    }

    // Merge with balance cache for tokens the pool doesn't report.
    // The cache stores accumulated swap deltas (e.g. WETH received from swaps).
    // For tokens the pool DOES report (USDC), the pool value is authoritative
    // since the pool balance already reflects settled swaps. Blindly adding
    // cache deltas to pool values would double-subtract spent amounts.
    try {
      const cache = await dbReadBalanceCache()
      if (poolWeth === 0 && cache['WETH']) {
        poolWeth = Math.max(0, parseFloat(cache['WETH'].balance))
      }
      // If pool returned 0 USDC but cache has a positive delta, use cache
      // (covers the window before the pool updates after a deposit)
      if (poolUsdc === 0 && cache['USDC'] && parseFloat(cache['USDC'].balance) > 0) {
        poolUsdc = parseFloat(cache['USDC'].balance)
      }
    } catch {}

    const balances = [
      {
        symbol: 'USDC',
        balance: poolUsdc.toFixed(6),
        chain: 'Base Sepolia',
        tokenAddress: baseSepolia.tokens.USDC.address,
        explorerUrl: 'https://sepolia.basescan.org/address/0x647f9b99af97e4b79DD9Dd6de3b583236352f482',
      },
      {
        symbol: 'WETH',
        balance: poolWeth.toFixed(6),
        chain: 'Base Sepolia',
        tokenAddress: WETH_ADDR,
        explorerUrl: 'https://sepolia.basescan.org/address/0x647f9b99af97e4b79DD9Dd6de3b583236352f482',
      },
    ]

    return NextResponse.json({ wallet, balances })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch balances'
    return NextResponse.json({ error: message, wallet: null, balances: [] }, { status: 500 })
  }
}
