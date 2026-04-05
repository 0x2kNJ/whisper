import { NextResponse } from 'next/server'
import { privateKeyToAccount } from 'viem/accounts'

export const dynamic = 'force-dynamic'
import { baseSepolia, getEnvOrThrow } from '@/agent/config'
import { createUnlinkClientWrapper, getBalances } from '@/agent/unlink'
import { dbReadBalanceCache } from '@/lib/db'

const USDC_ADDR = baseSepolia.tokens.USDC.address.toLowerCase()
const WETH_ADDR = '0x4200000000000000000000000000000000000006'

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

    // Try to get pool balances from Unlink SDK
    let poolUsdc = 0
    let poolWeth = 0
    let poolError: string | null = null

    try {
      const rawBalances = await getBalances(client)
      for (const b of rawBalances as Array<{ token: string; balance: string }>) {
        const addr = b.token.toLowerCase()
        if (addr === USDC_ADDR) poolUsdc += parseFloat(b.balance)
        else if (addr === WETH_ADDR) poolWeth += parseFloat(b.balance)
      }
    } catch (err) {
      poolError = err instanceof Error ? err.message : String(err)
      console.error('[balances] Unlink pool fetch failed:', poolError)
    }

    // Merge with balance cache:
    // - WETH: pool never reports it, always use cache
    // - USDC: use pool when available, fall back to cache if pool failed
    try {
      const cache = await dbReadBalanceCache()
      if (poolWeth === 0 && cache['WETH']) {
        poolWeth = Math.max(0, parseFloat(cache['WETH'].balance))
      }
      if (poolUsdc === 0 && cache['USDC']) {
        const cached = parseFloat(cache['USDC'].balance)
        if (cached > 0) poolUsdc = cached
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

    return NextResponse.json({
      wallet,
      balances,
      ...(poolError ? { warning: `Pool fetch failed: ${poolError}` } : {}),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch balances'
    console.error('[balances] API error:', message)
    return NextResponse.json({ error: message, wallet: null, balances: [] }, { status: 500 })
  }
}
