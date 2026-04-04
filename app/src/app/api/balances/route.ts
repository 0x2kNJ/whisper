import { NextResponse } from 'next/server'
import { createPublicClient, http, formatUnits } from 'viem'
import { baseSepolia as baseSepoliaChain } from 'viem/chains'
import path from 'path'
import { readFileSync } from 'fs'

async function tryImport(basePath: string) {
  const candidates = [
    basePath.replace(/\.ts$/, '.js'),
    basePath,
    basePath.replace('/src/', '/dist/').replace(/\.ts$/, '.js'),
  ]
  for (const c of candidates) {
    try {
      return await import(/* webpackIgnore: true */ c)
    } catch {
      continue
    }
  }
  throw new Error(`Could not import ${basePath}`)
}

export async function GET() {
  try {
    const agentConfigPath =
      process.env.AGENT_MODULE_PATH
        ? path.resolve(path.dirname(process.env.AGENT_MODULE_PATH), 'config.js')
        : path.resolve(process.cwd(), '../agent/src/config.ts')

    const unlinkPath =
      process.env.AGENT_MODULE_PATH
        ? path.resolve(path.dirname(process.env.AGENT_MODULE_PATH), 'unlink.js')
        : path.resolve(process.cwd(), '../agent/src/unlink.ts')

    const configMod = await tryImport(agentConfigPath)
    const unlinkMod = await tryImport(unlinkPath)

    const { baseSepolia, arcTestnet, getEnvOrThrow } = configMod
    const { createUnlinkClientWrapper, getBalances } = unlinkMod

    const mnemonic = getEnvOrThrow('UNLINK_MNEMONIC')
    const rpcUrl = baseSepolia.rpcUrl || getEnvOrThrow('BASE_SEPOLIA_RPC_URL')
    const client = createUnlinkClientWrapper(mnemonic, rpcUrl)

    const wallet = client.evmAddress

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
        // Only include known tokens — filter out unrecognized pool test tokens
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

    // Also check on-chain WETH balance (Unlink SDK doesn't always report it)
    try {
      const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'
      const onChainClient = createPublicClient({
        chain: baseSepoliaChain,
        transport: http(rpcUrl),
      })
      const wethBalance = await onChainClient.readContract({
        address: WETH_ADDRESS as `0x${string}`,
        abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }],
        functionName: 'balanceOf',
        args: [wallet as `0x${string}`],
      })
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
      // On-chain WETH check failed — proceed with SDK balances only
    }

    // Read shielded balance cache (tracks WETH from swaps that SDK doesn't report)
    try {
      const cachePath = path.resolve(process.cwd(), '../agent/data/shielded-balances.json')
      const cache = JSON.parse(readFileSync(cachePath, 'utf-8')) as Record<string, { balance: string }>
      for (const [symbol, entry] of Object.entries(cache)) {
        const bal = parseFloat(entry.balance)
        if (bal > 0 && !mapped.find((b: { symbol: string }) => b.symbol === symbol)) {
          mapped.push({
            symbol,
            balance: entry.balance,
            chain: 'Base Sepolia',
            tokenAddress: symbol === 'WETH' ? '0x4200000000000000000000000000000000000006' : '',
            explorerUrl: null,
          })
        }
      }
    } catch {
      // Cache doesn't exist yet — skip
    }

    // Aggregate same-symbol balances into one entry (pool tokens + direct tokens)
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
