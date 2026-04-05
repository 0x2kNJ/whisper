import { NextResponse } from 'next/server'
import { privateKeyToAccount } from 'viem/accounts'

export const dynamic = 'force-dynamic'
import { baseSepolia, getEnvOrThrow } from '@/agent/config'
import { createUnlinkClientWrapper, getBalances, type UnlinkClient } from '@/agent/unlink'
import { dbReadBalanceCache } from '@/lib/db'

const USDC_ADDR = baseSepolia.tokens.USDC.address.toLowerCase()
const WETH_ADDR = '0x4200000000000000000000000000000000000006'

// Singleton client — same pattern as tools.ts to avoid initialization race
let _client: UnlinkClient | null = null
function getClient(): UnlinkClient {
  if (!_client) {
    const mnemonic = getEnvOrThrow('UNLINK_MNEMONIC')
    const rpcUrl = baseSepolia.rpcUrl || getEnvOrThrow('BASE_SEPOLIA_RPC_URL')
    _client = createUnlinkClientWrapper(mnemonic, rpcUrl)
  }
  return _client
}

export async function GET() {
  try {
    const client = getClient()

    let wallet = client.evmAddress
    try {
      const pk = getEnvOrThrow('PRIVATE_KEY')
      const account = privateKeyToAccount(pk as `0x${string}`)
      wallet = account.address
    } catch {}

    let poolUsdc = 0
    let poolWeth = 0

    const rawBalances = await getBalances(client)
    for (const b of rawBalances as Array<{ token: string; balance: string }>) {
      const addr = b.token.toLowerCase()
      if (addr === USDC_ADDR) poolUsdc += parseFloat(b.balance)
      else if (addr === WETH_ADDR) poolWeth += parseFloat(b.balance)
    }

    // SDK doesn't report WETH from swaps — check cache
    if (poolWeth === 0) {
      try {
        const cache = await dbReadBalanceCache()
        if (cache['WETH']) poolWeth = Math.max(0, parseFloat(cache['WETH'].balance))
      } catch {}
    }

    return NextResponse.json({
      wallet,
      balances: [
        { symbol: 'USDC', balance: poolUsdc.toFixed(6), chain: 'Base Sepolia', tokenAddress: baseSepolia.tokens.USDC.address, explorerUrl: 'https://sepolia.basescan.org/address/0x647f9b99af97e4b79DD9Dd6de3b583236352f482' },
        { symbol: 'WETH', balance: poolWeth.toFixed(6), chain: 'Base Sepolia', tokenAddress: WETH_ADDR, explorerUrl: 'https://sepolia.basescan.org/address/0x647f9b99af97e4b79DD9Dd6de3b583236352f482' },
      ],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch balances'
    return NextResponse.json({ error: message, wallet: null, balances: [] }, { status: 500 })
  }
}
