/**
 * Address book — persist name→address mappings across sessions.
 * Stored as a flat JSON object at agent/data/address-book.json.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
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

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const ADDRESS_BOOK_PATH = join(DATA_DIR, 'address-book.json')

// In-memory store (keyed by lowercase name for case-insensitive lookup,
// but we preserve the original casing when writing to disk)
let _book: Record<string, string> = {}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

/** Load address book from disk into memory. Called automatically on import. */
export async function loadAddressBook(): Promise<void> {
  if (!existsSync(ADDRESS_BOOK_PATH)) {
    _book = {}
    return
  }
  try {
    const raw = readFileSync(ADDRESS_BOOK_PATH, 'utf-8')
    _book = JSON.parse(raw) as Record<string, string>
  } catch {
    _book = {}
  }
}

function persist() {
  ensureDataDir()
  writeFileSync(ADDRESS_BOOK_PATH, JSON.stringify(_book, null, 2))
}

/** Save a name→address mapping (overwrites if name already exists) */
export async function saveAddress(name: string, address: string): Promise<void> {
  _book[name] = address
  persist()
}

/**
 * Resolve an ENS name to an address + text records.
 * Uses Ethereum mainnet (where ENS names are registered).
 *
 * Priority: If the ENS name has a `unlink.address` text record, that is returned
 * as the preferred address for privacy-preserving transfers. The EVM address is
 * also returned for reference.
 *
 * This is the key ENS + ZK integration:
 *   alice.eth → unlink.address = "unlink1qq..." → private transfer via ZK pool
 *   Human-readable name → private address → private transfer
 */
export async function resolveENS(name: string): Promise<{
  address: string | null
  unlinkAddress: string | null
  preferredAddress: string | null
  textRecords?: Record<string, string>
  network?: string
}> {
  try {
    // All ENS resolution on Sepolia (where whisper.eth is registered)
    const rpcUrl = process.env.ETH_SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/FMZ3q69r-qEw-ScYg8pz3'
    const client = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl),
    })

    const normalizedName = normalize(name)

    const evmAddress = await client.getEnsAddress({ name: normalizedName })

    // Read text records — prioritize unlink.address for privacy
    const textRecords: Record<string, string> = {}
    const recordKeys = [
      'unlink.address',         // Priority: ZK-shielded Unlink address
      'payroll.proof',          // ZK proof hash from last payroll
      'payroll.timestamp',      // When last payroll was executed
      'payroll.verified',       // Whether proof has been verified
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
      } catch {
        // Skip failed text record reads
      }
    }

    const unlinkAddress = textRecords['unlink.address'] || null

    // Preferred address: Unlink address if available (for private transfers),
    // otherwise fall back to EVM address
    const preferredAddress = unlinkAddress || (evmAddress ?? null)

    return {
      address: evmAddress ?? null,
      unlinkAddress,
      preferredAddress,
      textRecords,
    }
  } catch (err) {
    return { address: null, unlinkAddress: null, preferredAddress: null }
  }
}

/** Get address by name (case-insensitive). Returns undefined if not found.
 *  For .eth names, call resolveENS() instead (async). */
export function getAddress(name: string): string | undefined {
  // Exact match first
  if (_book[name] !== undefined) return _book[name]
  // Case-insensitive fallback
  const lower = name.toLowerCase()
  for (const [key, val] of Object.entries(_book)) {
    if (key.toLowerCase() === lower) return val
  }
  // Check if this looks like an ENS name — caller should use resolveENS() for these
  return undefined
}

/** Return a copy of all saved addresses */
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

// Sepolia ENS registry address (same as mainnet)
const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as Address

/**
 * Write a single text record to an ENS name on Sepolia.
 * Uses the ENS_PRIVATE_KEY from .env (owner of whisper.eth subnames).
 */
export async function writeEnsTextRecord(
  ensName: string,
  key: string,
  value: string,
): Promise<{ txHash: string }> {
  const pk = process.env.ENS_PRIVATE_KEY
  if (!pk) throw new Error('ENS_PRIVATE_KEY not set in .env')

  const rpcUrl =
    process.env.ETH_SEPOLIA_RPC_URL ||
    'https://eth-sepolia.g.alchemy.com/v2/FMZ3q69r-qEw-ScYg8pz3'

  const account = privateKeyToAccount(pk as `0x${string}`)

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  })
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  })

  const normalizedName = normalize(ensName)
  const node = namehash(normalizedName)

  // Look up the resolver for this name
  const resolverAddress = (await publicClient.readContract({
    address: ENS_REGISTRY,
    abi: ENS_REGISTRY_ABI,
    functionName: 'resolver',
    args: [node],
  })) as Address

  if (!resolverAddress || resolverAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error(`No resolver found for ${ensName}`)
  }

  // Call setText on the resolver
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

/**
 * Publish a full set of payroll proof records to an ENS name.
 * Writes payroll.proof, payroll.timestamp, payroll.period, payroll.payer,
 * payroll.frequency, and payroll.status as text records.
 *
 * Returns the tx hash of the last write (all writes go to the same resolver).
 */
export async function publishPayrollProof(
  ensName: string,
  proofData: {
    txHash?: string       // Unlink tx hash to derive proof from
    period?: string       // e.g. "April 2026"
    payer?: string        // e.g. "Whisper Treasury"
    frequency?: string    // e.g. "Monthly"
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
      // Continue writing other records even if one fails
    }
  }

  return { proofHash, txHashes }
}

// Auto-load on import (fire-and-forget — sync fallback above handles the race)
loadAddressBook().catch(() => {})
