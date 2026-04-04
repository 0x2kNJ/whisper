import { NextResponse } from 'next/server'
import path from 'path'

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

    const configMod = await tryImport(agentConfigPath)
    const unlinkMod = await tryImport(unlinkPath)

    const { baseSepolia, getEnvOrThrow } = configMod
    const { createUnlinkClientWrapper, getBalances } = unlinkMod

    const mnemonic = getEnvOrThrow('UNLINK_MNEMONIC')
    const rpcUrl = baseSepolia.rpcUrl || getEnvOrThrow('BASE_SEPOLIA_RPC_URL')
    const client = createUnlinkClientWrapper(mnemonic, rpcUrl)

    const wallet = client.evmAddress

    const rawBalances = await getBalances(client)

    const balances = rawBalances.map(
      (b: { token: string; symbol: string; balance: string }) => {
        const baseToken = Object.values(baseSepolia.tokens).find(
          (t: { address: string }) =>
            t.address.toLowerCase() === b.token.toLowerCase(),
        )
        const chain = baseToken ? 'Base Sepolia' : 'Arc Testnet'
        const explorer = baseToken
          ? `https://sepolia.basescan.org/token/${b.token}`
          : null

        return {
          symbol: b.symbol,
          balance: b.balance,
          chain,
          tokenAddress: b.token,
          explorerUrl: explorer,
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
