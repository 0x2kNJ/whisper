/**
 * Address book — persist name->address mappings in Turso.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  namehash,
  keccak256,
  toHex,
  encodeFunctionData,
  type Address,
} from 'viem'
import { normalize } from 'viem/ens'
import { sepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { dbSaveAddress, dbLoadAddressBook } from '@/lib/db'

let _book: Record<string, string> = {}

export async function loadAddressBook(): Promise<void> {
  try {
    _book = await dbLoadAddressBook()
  } catch {
    _book = {}
  }
}

export async function saveAddress(name: string, address: string): Promise<void> {
  _book[name] = address
  await dbSaveAddress(name, address)
}

export async function resolveENS(name: string): Promise<{
  address: string | null
  unlinkAddress: string | null
  preferredAddress: string | null
  textRecords?: Record<string, string>
  network?: string
}> {
  try {
    const rpcUrl = process.env.ETH_SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/FMZ3q69r-qEw-ScYg8pz3'
    const client = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl),
    })

    const normalizedName = normalize(name)
    const evmAddress = await client.getEnsAddress({ name: normalizedName })

    const textRecords: Record<string, string> = {}
    const recordKeys = [
      'unlink.address',
      'payroll.proof',
      'payroll.timestamp',
      'payroll.verified',
      'description',
      'url',
      'ai.model',
      'ai.capabilities',
      'ai.protocol',
      'com.twitter',
      'com.github',
    ]
    for (const key of recordKeys) {
      try {
        const value = await client.getEnsText({ name: normalizedName, key })
        if (value) textRecords[key] = value
      } catch {}
    }

    const unlinkAddress = textRecords['unlink.address'] || null
    const preferredAddress = unlinkAddress || (evmAddress ?? null)

    return { address: evmAddress ?? null, unlinkAddress, preferredAddress, textRecords }
  } catch {
    return { address: null, unlinkAddress: null, preferredAddress: null }
  }
}

export function getAddress(name: string): string | undefined {
  if (_book[name] !== undefined) return _book[name]
  const lower = name.toLowerCase()
  for (const [key, val] of Object.entries(_book)) {
    if (key.toLowerCase() === lower) return val
  }
  // Try with .whisper.eth suffix
  const withSuffix = `${lower}.whisper.eth`
  for (const [key, val] of Object.entries(_book)) {
    if (key.toLowerCase() === withSuffix) return val
  }
  return undefined
}

export function listAddresses(): Record<string, string> {
  return { ..._book }
}

// ---------------------------------------------------------------------------
// ENS Text Record Writing
// ---------------------------------------------------------------------------

const ENS_RESOLVER_ABI = [
  {
    name: 'setText',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
    outputs: [],
  },
] as const

const ENS_REGISTRY_ABI = [
  {
    name: 'resolver',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ type: 'address' }],
  },
] as const

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as Address

export async function writeEnsTextRecord(
  ensName: string,
  key: string,
  value: string,
): Promise<{ txHash: string }> {
  const pk = process.env.ENS_PRIVATE_KEY
  if (!pk) throw new Error('ENS_PRIVATE_KEY not set')

  const rpcUrl =
    process.env.ETH_SEPOLIA_RPC_URL ||
    'https://eth-sepolia.g.alchemy.com/v2/FMZ3q69r-qEw-ScYg8pz3'

  const account = privateKeyToAccount(pk as `0x${string}`)
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) })
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) })

  const normalizedName = normalize(ensName)
  const node = namehash(normalizedName)

  const resolverAddress = (await publicClient.readContract({
    address: ENS_REGISTRY,
    abi: ENS_REGISTRY_ABI,
    functionName: 'resolver',
    args: [node],
  })) as Address

  if (!resolverAddress || resolverAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error(`No resolver found for ${ensName}`)
  }

  const txHash = await walletClient.sendTransaction({
    to: resolverAddress,
    data: encodeFunctionData({
      abi: ENS_RESOLVER_ABI,
      functionName: 'setText',
      args: [node, key, value],
    }),
  })

  await publicClient.waitForTransactionReceipt({ hash: txHash })
  return { txHash }
}

export async function publishPayrollProof(
  ensName: string,
  proofData: {
    txHash?: string
    period?: string
    payer?: string
    frequency?: string
  },
): Promise<{ proofHash: string; txHashes: string[] }> {
  const timestamp = new Date().toISOString()
  const seed = `${proofData.txHash || ensName}:${ensName}:${timestamp}`
  const proofHash = keccak256(toHex(seed))

  const records: [string, string][] = [
    ['payroll.proof', proofHash],
    ['payroll.timestamp', timestamp],
    ['payroll.period', proofData.period || new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })],
    ['payroll.payer', proofData.payer || 'Whisper Treasury'],
    ['payroll.frequency', proofData.frequency || 'Monthly'],
    ['payroll.status', 'Confirmed'],
  ]

  const txHashes: string[] = []
  for (const [key, value] of records) {
    try {
      const result = await writeEnsTextRecord(ensName, key, value)
      txHashes.push(result.txHash)
    } catch (err) {
      console.error(`Failed to write ${key} for ${ensName}:`, err)
    }
  }

  return { proofHash, txHashes }
}

loadAddressBook().catch(() => {})
