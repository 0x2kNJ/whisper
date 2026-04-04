import { NextResponse } from 'next/server'
import path from 'path'

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

    const balances = rawBalances
      .filter((b: { symbol: string }) => {
        // Filter out unrecognized pool tokens — only show tokens we can identify
        return b.symbol !== 'UNKNOWN'
      })
      .map(
      (b: { token: string; symbol: string; balance: string }) => {
        const matched = allTokens.find(
          (t) => t.address.toLowerCase() === b.token.toLowerCase(),
        )

        return {
          symbol: matched?.symbol ?? b.symbol,
          balance: b.balance,
          chain: matched?.chain ?? 'Base Sepolia',
          tokenAddress: b.token,
          explorerUrl: matched?.explorer ?? null,
        }
      },
    )

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
