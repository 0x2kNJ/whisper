/**
 * Address book — persist name→address mappings across sessions.
 * Stored as a flat JSON object at agent/data/address-book.json.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPublicClient, http } from 'viem'
import { normalize } from 'viem/ens'
import { mainnet } from 'viem/chains'

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
}> {
  try {
    const rpcUrl = process.env.ETH_RPC_URL || 'https://eth.drpc.org'
    const client = createPublicClient({
      chain: mainnet,
      transport: http(rpcUrl),
    })

    const normalizedName = normalize(name)

    const evmAddress = await client.getEnsAddress({ name: normalizedName })

    // Read text records — prioritize unlink.address for privacy
    const textRecords: Record<string, string> = {}
    const recordKeys = [
      'unlink.address',     // Priority: ZK-shielded Unlink address
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

// Auto-load on import (fire-and-forget — sync fallback above handles the race)
loadAddressBook().catch(() => {})
