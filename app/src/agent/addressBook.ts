/**
 * Address book — persist name->address mappings in Turso.
 */

import { createPublicClient, http } from 'viem'
import { normalize } from 'viem/ens'
import { sepolia } from 'viem/chains'
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

loadAddressBook().catch(() => {})
