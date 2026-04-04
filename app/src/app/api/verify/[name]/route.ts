import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { normalize } from 'viem/ens'

export async function GET(
  _req: NextRequest,
  { params }: { params: { name: string } },
) {
  const ensName = decodeURIComponent(params.name)

  try {
    const rpcUrl =
      process.env.ETH_SEPOLIA_RPC_URL ||
      'https://eth-sepolia.g.alchemy.com/v2/FMZ3q69r-qEw-ScYg8pz3'

    const client = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl),
    })

    const normalizedName = normalize(ensName)
    const address = await client.getEnsAddress({ name: normalizedName })

    // Read text records
    const recordKeys = [
      'unlink.address',
      'payroll.proof',
      'payroll.timestamp',
      'payroll.verified',
      'description',
    ]

    const textRecords: Record<string, string> = {}
    for (const key of recordKeys) {
      try {
        const value = await client.getEnsText({ name: normalizedName, key })
        if (value) textRecords[key] = value
      } catch {
        // Skip
      }
    }

    const unlinkAddress = textRecords['unlink.address'] || null
    const proofHash = textRecords['payroll.proof'] || null
    const proofTimestamp = textRecords['payroll.timestamp'] || null

    return NextResponse.json({
      name: ensName,
      address: address ?? null,
      unlinkAddress,
      proofHash,
      proofTimestamp,
      isPrivate: !!unlinkAddress,
      isVerified: !!proofHash,
    })
  } catch (err) {
    return NextResponse.json(
      {
        name: ensName,
        address: null,
        unlinkAddress: null,
        proofHash: null,
        proofTimestamp: null,
        isPrivate: false,
        isVerified: false,
        error: err instanceof Error ? err.message : 'Resolution failed',
      },
      { status: 500 },
    )
  }
}
