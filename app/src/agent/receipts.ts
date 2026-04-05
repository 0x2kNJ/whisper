/**
 * Payment receipts — generate, sign, save, and verify receipts for private payments.
 * Proves a payment happened without exposing the on-chain sender.
 */

import { privateKeyToAccount } from 'viem/accounts'
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

import type { PaymentReceipt } from './types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RECEIPTS_DIR = join(__dirname, '..', 'data', 'receipts')

function ensureReceiptsDir() {
  if (!existsSync(RECEIPTS_DIR)) {
    mkdirSync(RECEIPTS_DIR, { recursive: true })
  }
}

function getAccount() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`
  if (!privateKey) throw new Error('Missing env var: PRIVATE_KEY')
  return privateKeyToAccount(privateKey)
}

/** Generate a unique payment ID: timestamp + 8 random hex bytes */
function generatePaymentId(): string {
  const ts = Date.now().toString(16)
  const rand = randomBytes(8).toString('hex')
  return `${ts}-${rand}`
}

/** Generate a signed payment receipt */
export async function generateReceipt(params: {
  recipient: string
  amount: string
  token: string
  txHash: string
  chain: string
  isPrivate: boolean
}): Promise<PaymentReceipt> {
  const paymentId = generatePaymentId()
  const timestamp = Date.now()

  const receipt: PaymentReceipt = {
    paymentId,
    recipient: params.recipient,
    amount: params.amount,
    token: params.token,
    timestamp,
    txHash: params.txHash,
    chain: params.chain,
    private: params.isPrivate,
  }

  // Sign the canonical JSON (sorted keys, no signature field)
  const payload = JSON.stringify({
    paymentId: receipt.paymentId,
    recipient: receipt.recipient,
    amount: receipt.amount,
    token: receipt.token,
    timestamp: receipt.timestamp,
    txHash: receipt.txHash,
    chain: receipt.chain,
    private: receipt.private,
  })

  const account = getAccount()
  const signature = await account.signMessage({ message: payload })

  receipt.signature = signature
  return receipt
}

/** Verify a receipt signature (checks that a signature is present and well-formed).
 *  Full cryptographic verification requires the signer's public address — call
 *  verifyMessage from viem with `account.address` for a complete on-chain check. */
export function verifyReceipt(receipt: PaymentReceipt): boolean {
  if (!receipt.signature || receipt.signature.length === 0) return false
  // A valid secp256k1 EIP-191 signature is 132 hex chars (0x + 65 bytes)
  return /^0x[0-9a-fA-F]{130}$/.test(receipt.signature)
}

/** Save receipt to disk at agent/data/receipts/{paymentId}.json */
export async function saveReceipt(receipt: PaymentReceipt): Promise<void> {
  ensureReceiptsDir()
  const filePath = join(RECEIPTS_DIR, `${receipt.paymentId}.json`)
  writeFileSync(filePath, JSON.stringify(receipt, null, 2))
}

/** Load all saved receipts from disk */
export async function loadReceipts(): Promise<PaymentReceipt[]> {
  if (!existsSync(RECEIPTS_DIR)) return []

  const files = readdirSync(RECEIPTS_DIR).filter((f) => f.endsWith('.json'))
  const receipts: PaymentReceipt[] = []

  for (const file of files) {
    try {
      const raw = readFileSync(join(RECEIPTS_DIR, file), 'utf-8')
      receipts.push(JSON.parse(raw) as PaymentReceipt)
    } catch {
      // Skip malformed files
    }
  }

  return receipts.sort((a, b) => b.timestamp - a.timestamp)
}
