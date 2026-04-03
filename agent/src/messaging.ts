/**
 * Whisper — Private messaging module.
 *
 * Encrypts payroll instructions using NaCl box (X25519 + XSalsa20-Poly1305).
 * What lands on-chain is an opaque ciphertext; only the holder of the
 * recipient secret key can read the plaintext instruction.
 */

import nacl from 'tweetnacl'
import naclUtil from 'tweetnacl-util'

// ---------------------------------------------------------------------------
// Message schemas
// ---------------------------------------------------------------------------

export interface PayrollMessage {
  version: 1
  type: 'payroll_instruction'
  payload: {
    recipients: Array<{
      name: string
      address: string
      amount: string
      share?: number
    }>
    token: string
    schedule?: string
    conditions?: {
      vestingDuration?: number
      oracleAddress?: string
      triggerPrice?: string
      operator?: string
    }
    memo?: string
  }
}

export interface EncryptedMessage {
  version: 1
  type: 'encrypted_payroll'
  encrypted: string        // base64 NaCl box ciphertext
  nonce: string            // base64 nonce (24 bytes)
  senderPublicKey: string  // hex-encoded X25519 public key
  timestamp: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToUint8(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  if (clean.length % 2 !== 0) throw new Error('Odd-length hex string')
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function uint8ToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a fresh X25519 keypair for messaging.
 * Returns both keys as hex strings.
 */
export function generateKeyPair(): { publicKey: string; secretKey: string } {
  const kp = nacl.box.keyPair()
  return {
    publicKey: uint8ToHex(kp.publicKey),
    secretKey: uint8ToHex(kp.secretKey),
  }
}

/**
 * Encrypt a PayrollMessage for a specific recipient.
 *
 * @param message           The plaintext payroll instruction.
 * @param recipientPublicKey  Hex-encoded X25519 public key of the recipient.
 * @param senderSecretKey     Hex-encoded X25519 secret key of the sender.
 */
export function encryptMessage(
  message: PayrollMessage,
  recipientPublicKey: string,
  senderSecretKey: string,
): EncryptedMessage {
  const plaintext = naclUtil.decodeUTF8(JSON.stringify(message))
  const nonce = nacl.randomBytes(nacl.box.nonceLength)

  const recipientPk = hexToUint8(recipientPublicKey)
  const senderSk = hexToUint8(senderSecretKey)

  // Derive the sender public key from the secret key so we can include it
  const senderKp = nacl.box.keyPair.fromSecretKey(senderSk)

  const ciphertext = nacl.box(plaintext, nonce, recipientPk, senderSk)
  if (!ciphertext) throw new Error('Encryption failed')

  return {
    version: 1,
    type: 'encrypted_payroll',
    encrypted: naclUtil.encodeBase64(ciphertext),
    nonce: naclUtil.encodeBase64(nonce),
    senderPublicKey: uint8ToHex(senderKp.publicKey),
    timestamp: Date.now(),
  }
}

/**
 * Decrypt an EncryptedMessage using the recipient's secret key.
 *
 * @param encrypted           The EncryptedMessage object.
 * @param recipientSecretKey  Hex-encoded X25519 secret key of the recipient.
 */
export function decryptMessage(
  encrypted: EncryptedMessage,
  recipientSecretKey: string,
): PayrollMessage {
  const ciphertext = naclUtil.decodeBase64(encrypted.encrypted)
  const nonce = naclUtil.decodeBase64(encrypted.nonce)
  const senderPk = hexToUint8(encrypted.senderPublicKey)
  const recipientSk = hexToUint8(recipientSecretKey)

  const plaintext = nacl.box.open(ciphertext, nonce, senderPk, recipientSk)
  if (!plaintext) throw new Error('Decryption failed — wrong key or tampered message')

  return JSON.parse(naclUtil.encodeUTF8(plaintext)) as PayrollMessage
}

/**
 * Encode an EncryptedMessage as a hex string suitable for on-chain calldata.
 * Format: `0x` + hex-encoded UTF-8 JSON.
 */
export function encodeForOnChain(encrypted: EncryptedMessage): string {
  const json = JSON.stringify(encrypted)
  const bytes = naclUtil.decodeUTF8(json)
  return '0x' + uint8ToHex(bytes)
}

/**
 * Decode on-chain calldata (hex) back to an EncryptedMessage.
 */
export function decodeFromOnChain(hexData: string): EncryptedMessage {
  const bytes = hexToUint8(hexData)
  const json = naclUtil.encodeUTF8(bytes)
  return JSON.parse(json) as EncryptedMessage
}

/**
 * Returns the split-screen privacy comparison:
 *   - blockchainView: the opaque hex blob that anyone on-chain can see
 *   - treasurerView:  the readable JSON that only the key-holder can see
 */
export function getPrivacyComparison(
  encrypted: EncryptedMessage,
  decrypted: PayrollMessage,
): { blockchainView: string; treasurerView: string } {
  return {
    blockchainView: encodeForOnChain(encrypted),
    treasurerView: JSON.stringify(decrypted.payload, null, 2),
  }
}
