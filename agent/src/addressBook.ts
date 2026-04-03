/**
 * Address book — persist name→address mappings across sessions.
 * Stored as a flat JSON object at agent/data/address-book.json.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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

/** Get address by name (case-insensitive). Returns undefined if not found. */
export function getAddress(name: string): string | undefined {
  // Exact match first
  if (_book[name] !== undefined) return _book[name]
  // Case-insensitive fallback
  const lower = name.toLowerCase()
  for (const [key, val] of Object.entries(_book)) {
    if (key.toLowerCase() === lower) return val
  }
  return undefined
}

/** Return a copy of all saved addresses */
export function listAddresses(): Record<string, string> {
  return { ..._book }
}

// Auto-load on import (fire-and-forget — sync fallback above handles the race)
loadAddressBook().catch(() => {})
