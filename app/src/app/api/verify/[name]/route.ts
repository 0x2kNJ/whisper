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

    // Read all relevant text records
    const recordKeys = [
      'unlink.address',
      'payroll.proof',
      'payroll.timestamp',
      'payroll.period',
      'payroll.frequency',
      'payroll.payer',
      'payroll.status',
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
    const payrollPeriod = textRecords['payroll.period'] || null
    const payrollFrequency = textRecords['payroll.frequency'] || null
    const payrollPayer = textRecords['payroll.payer'] || null
    const payrollStatus = textRecords['payroll.status'] || null

    // Derive the display name from the ENS subname
    const displayName = ensName.split('.')[0]
    const parentDomain = ensName.split('.').slice(1).join('.')

    return NextResponse.json({
      name: ensName,
      displayName,
      parentDomain,
      address: address ?? null,
      unlinkAddress,
      proofHash,
      proofTimestamp,
      payroll: {
        period: payrollPeriod,
        frequency: payrollFrequency,
        payer: payrollPayer,
        status: payrollStatus,
      },
      isPrivate: !!unlinkAddress,
      isVerified: !!proofHash,
    })
  } catch (err) {
    return NextResponse.json(
      {
        name: ensName,
        displayName: ensName.split('.')[0],
        parentDomain: ensName.split('.').slice(1).join('.'),
        address: null,
        unlinkAddress: null,
        proofHash: null,
        proofTimestamp: null,
        payroll: {},
        isPrivate: false,
        isVerified: false,
        error: err instanceof Error ? err.message : 'Resolution failed',
      },
      { status: 500 },
    )
  }
}
