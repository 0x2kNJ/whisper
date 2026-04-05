import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { normalize } from 'viem/ens'

// Force dynamic — never cache this route
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(
  _req: NextRequest,
  { params }: { params: { name: string[] } },
) {
  // Catch-all: segments like ["alice", "whisper", "eth"] → "alice.whisper.eth"
  const ensName = decodeURIComponent(params.name.join('.'))
  const displayName = ensName.split('.')[0]
  const parentDomain = ensName.split('.').slice(1).join('.')

  // Try ENS resolution, but don't let failures block verification
  let address: string | null = null
  let unlinkAddress: string | null = null
  let proofHash: string | null = null
  let proofTimestamp: string | null = null
  let payrollPeriod: string | null = null
  let payrollFrequency: string | null = null
  let payrollPayer: string | null = null
  let payrollStatus: string | null = null

  try {
    const rpcUrl =
      process.env.ETH_SEPOLIA_RPC_URL ||
      'https://eth-sepolia.g.alchemy.com/v2/FMZ3q69r-qEw-ScYg8pz3'

    const client = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl),
    })

    const normalizedName = normalize(ensName)
    address = await client.getEnsAddress({ name: normalizedName })

    // Read all relevant text records
    const recordKeys = [
      'unlink.address',
      'payroll.proof',
      'payroll.timestamp',
      'payroll.period',
      'payroll.frequency',
      'payroll.payer',
      'payroll.status',
    ]

    const results = await Promise.allSettled(
      recordKeys.map((key) => client.getEnsText({ name: normalizedName, key }).then((value) => ({ key, value }))),
    )
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.value) {
        const { key, value } = result.value
        if (key === 'unlink.address') unlinkAddress = value
        else if (key === 'payroll.proof') proofHash = value
        else if (key === 'payroll.timestamp') proofTimestamp = value
        else if (key === 'payroll.period') payrollPeriod = value
        else if (key === 'payroll.frequency') payrollFrequency = value
        else if (key === 'payroll.payer') payrollPayer = value
        else if (key === 'payroll.status') payrollStatus = value
      }
    }
  } catch {
    // ENS resolution failed (RPC down, rate limited, etc.)
    // For .whisper.eth names we can still verify — fall through
  }

  // No fake fallback — verification only succeeds when a real proof
  // exists in ENS text records (written by publish_proof / auto-publish).

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
  }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
}
