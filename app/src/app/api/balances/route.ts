import { NextResponse } from 'next/server'
import { privateKeyToAccount } from 'viem/accounts'
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

    const POOL_TOKEN_MAP: Record<string, { symbol: string; decimals: number }> = {
      '0x036cbd53842c5426634e7929541ec2318f3dcf7e': { symbol: 'USDC', decimals: 6 },
      '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
    }

    // Only show Unlink pool balances
    const rawBalances = await getBalances(client)

    const mapped: Array<{ symbol: string; balance: string; chain: string; tokenAddress: string; explorerUrl: string | null }> = []

    for (const b of rawBalances as Array<{ token: string; balance: string; symbol: string }>) {
      const info = POOL_TOKEN_MAP[b.token.toLowerCase()]
      if (!info) continue
      mapped.push({
        symbol: info.symbol,
        balance: b.balance,
        chain: 'Base Sepolia',
        tokenAddress: b.token,
        explorerUrl: `https://sepolia.basescan.org/address/0x647f9b99af97e4b79DD9Dd6de3b583236352f482`,
      })
    }

    // Merge shielded balance cache (deltas from swaps)
    try {
      const cache = await dbReadBalanceCache()
      for (const [symbol, entry] of Object.entries(cache)) {
        const poolBal = parseFloat(entry.balance)
        if (poolBal === 0) continue

        const existing = mapped.find((b) => b.symbol === symbol)
        if (existing) {
          const combined = parseFloat(existing.balance) + poolBal
          existing.balance = Math.max(0, combined).toString()
        } else if (poolBal > 0) {
          mapped.push({
            symbol,
            balance: entry.balance,
            chain: 'Base Sepolia',
            tokenAddress: symbol === 'WETH' ? '0x4200000000000000000000000000000000000006' : baseSepolia.tokens.USDC.address,
            explorerUrl: `https://sepolia.basescan.org/address/0x647f9b99af97e4b79DD9Dd6de3b583236352f482`,
          })
        }
      }
    } catch {}

    // Ensure USDC and WETH always appear (even if 0)
    if (!mapped.find((b) => b.symbol === 'USDC')) {
      mapped.push({ symbol: 'USDC', balance: '0', chain: 'Base Sepolia', tokenAddress: baseSepolia.tokens.USDC.address, explorerUrl: null })
    }
    if (!mapped.find((b) => b.symbol === 'WETH')) {
      mapped.push({ symbol: 'WETH', balance: '0', chain: 'Base Sepolia', tokenAddress: '0x4200000000000000000000000000000000000006', explorerUrl: null })
    }

    return NextResponse.json({ wallet, balances: mapped })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch balances'
    return NextResponse.json({ error: message, wallet: null, balances: [] }, { status: 500 })
  }
}
