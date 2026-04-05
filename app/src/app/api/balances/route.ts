import { NextResponse } from 'next/server'
import { createPublicClient, http, formatUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia as baseSepoliaChain } from 'viem/chains'
import { baseSepolia, arcTestnet, getEnvOrThrow } from '@/agent/config'
import { createUnlinkClientWrapper, getBalances } from '@/agent/unlink'
import { dbReadBalanceCache } from '@/lib/db'

export async function GET() {
  try {
    const mnemonic = getEnvOrThrow('UNLINK_MNEMONIC')
    const rpcUrl = baseSepolia.rpcUrl || getEnvOrThrow('BASE_SEPOLIA_RPC_URL')
    const client = createUnlinkClientWrapper(mnemonic, rpcUrl)

    // Use the public wallet (PRIVATE_KEY) as the displayed address — that's where on-chain funds live
    let wallet = client.evmAddress
    try {
      const pk = getEnvOrThrow('PRIVATE_KEY')
      const account = privateKeyToAccount(pk as `0x${string}`)
      wallet = account.address
    } catch {}

    const USDC_ADDRESS = baseSepolia.tokens.USDC.address
    const onChainClient = createPublicClient({
      chain: baseSepoliaChain,
      transport: http(rpcUrl),
    })

    // Check on-chain USDC balance for the public wallet
    const erc20Abi = [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }] as const

    const rawBalances = await getBalances(client)

    // Build a combined token lookup from both chains
    const allTokens = [
      ...Object.values(baseSepolia.tokens as Record<string, { address: string; symbol: string }>).map(
        (t) => ({ ...t, chain: 'Base Sepolia', explorer: `https://sepolia.basescan.org/token/${t.address}` }),
      ),
      ...Object.values(arcTestnet.tokens as Record<string, { address: string; symbol: string }>).map(
        (t) => ({ ...t, chain: 'Arc Testnet', explorer: null as string | null }),
      ),
    ]

    // Known Unlink pool token addresses (may differ from canonical addresses)
    const POOL_TOKEN_MAP: Record<string, string> = {
      '0x036cbd53842c5426634e7929541ec2318f3dcf7e': 'USDC',
      '0x4200000000000000000000000000000000000006': 'WETH',
    }

    const mapped = rawBalances
      .filter((b: { token: string }) => {
        const addr = b.token.toLowerCase()
        return !!allTokens.find(t => t.address.toLowerCase() === addr) || !!POOL_TOKEN_MAP[addr]
      })
      .map(
        (b: { token: string; symbol: string; balance: string }) => {
          const matched = allTokens.find(
            (t) => t.address.toLowerCase() === b.token.toLowerCase(),
          )
          const poolSymbol = POOL_TOKEN_MAP[b.token.toLowerCase()]

          return {
            symbol: matched?.symbol ?? poolSymbol ?? b.symbol,
            balance: b.balance,
            chain: matched?.chain ?? 'Base Sepolia',
            tokenAddress: b.token,
            explorerUrl: matched?.explorer ?? null,
          }
        },
      )

    // Check on-chain public wallet balances (USDC + WETH)
    try {
      const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'

      const [usdcBalance, wethBalance] = await Promise.all([
        onChainClient.readContract({
          address: USDC_ADDRESS as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [wallet as `0x${string}`],
        }),
        onChainClient.readContract({
          address: WETH_ADDRESS as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [wallet as `0x${string}`],
        }),
      ])

      const usdcFormatted = formatUnits(usdcBalance as bigint, 6)
      if (parseFloat(usdcFormatted) > 0) {
        mapped.push({
          symbol: 'USDC',
          balance: usdcFormatted,
          chain: 'Base Sepolia',
          tokenAddress: USDC_ADDRESS,
          explorerUrl: `https://sepolia.basescan.org/token/${USDC_ADDRESS}`,
        })
      }

      const wethFormatted = formatUnits(wethBalance as bigint, 18)
      if (parseFloat(wethFormatted) > 0) {
        mapped.push({
          symbol: 'WETH',
          balance: wethFormatted,
          chain: 'Base Sepolia',
          tokenAddress: WETH_ADDRESS,
          explorerUrl: `https://sepolia.basescan.org/token/${WETH_ADDRESS}`,
        })
      }
    } catch {
      // On-chain balance check failed — proceed with SDK balances only
    }

    // Merge shielded balance cache (pool deltas from swaps/deposits) into balances
    try {
      const cache = await dbReadBalanceCache()
      for (const [symbol, entry] of Object.entries(cache)) {
        const poolBal = parseFloat(entry.balance)
        if (poolBal === 0) continue

        const existing = mapped.find((b: { symbol: string }) => b.symbol === symbol)
        if (existing) {
          // Add pool balance to on-chain balance
          const combined = parseFloat(existing.balance) + poolBal
          existing.balance = Math.max(0, combined).toString()
        } else if (poolBal > 0) {
          // New token only in the pool
          mapped.push({
            symbol,
            balance: entry.balance,
            chain: 'Base Sepolia',
            tokenAddress: symbol === 'WETH' ? '0x4200000000000000000000000000000000000006' : USDC_ADDRESS,
            explorerUrl: null,
          })
        }
      }
    } catch {
      // Cache doesn't exist yet — skip
    }

    // Aggregate same-symbol balances into one entry
    const aggregated: Record<string, typeof mapped[0]> = {}
    for (const b of mapped) {
      const key = `${b.symbol}-${b.chain}`
      if (aggregated[key]) {
        const prev = parseFloat(aggregated[key].balance)
        const curr = parseFloat(b.balance)
        aggregated[key] = {
          ...aggregated[key],
          balance: (prev + curr).toString(),
        }
      } else {
        aggregated[key] = b
      }
    }
    const balances = Object.values(aggregated)

    return NextResponse.json({ wallet, balances })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to fetch balances'
    return NextResponse.json(
      { error: message, wallet: null, balances: [] },
      { status: 500 },
    )
  }
}
