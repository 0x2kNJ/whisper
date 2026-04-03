/**
 * Unit tests for Whisper agent — messaging, strategy CRUD, and token resolution.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

import {
  generateKeyPair,
  encryptMessage,
  decryptMessage,
  PayrollMessage,
} from './messaging.js'

import {
  createFromTemplate,
  pauseStrategy,
  resumeStrategy,
  deleteStrategy,
  listStrategies,
  getStrategy,
} from './strategies.js'

import { baseSepolia } from './config.js'

// ---------------------------------------------------------------------------
// Test 1: Encrypt → Decrypt roundtrip
// ---------------------------------------------------------------------------

describe('Messaging — Encrypt/Decrypt roundtrip', () => {
  it('should encrypt and decrypt a PayrollMessage with matching payload', async () => {
    // Generate keypair for sender and recipient
    const senderKp = generateKeyPair()
    const recipientKp = generateKeyPair()

    // Create a PayrollMessage
    const original: PayrollMessage = {
      version: 1,
      type: 'payroll_instruction',
      payload: {
        recipients: [
          {
            name: 'Alice',
            address: '0x0000000000000000000000000000000000000001',
            amount: '5000',
            share: 3000,
          },
          {
            name: 'Bob',
            address: '0x0000000000000000000000000000000000000002',
            amount: '3000',
            share: 2000,
          },
        ],
        token: 'USDC',
        schedule: 'weekly',
        conditions: {
          vestingDuration: 31536000,
          triggerPrice: '45000',
          operator: 'GT',
        },
        memo: 'Q1 2026 payroll',
      },
    }

    // Encrypt using recipient's public key and sender's secret key
    const encrypted = encryptMessage(
      original,
      recipientKp.publicKey,
      senderKp.secretKey,
    )

    // Verify encrypted message structure
    expect(encrypted.version).toBe(1)
    expect(encrypted.type).toBe('encrypted_payroll')
    expect(encrypted.encrypted).toBeTruthy()
    expect(encrypted.nonce).toBeTruthy()
    expect(encrypted.senderPublicKey).toBeTruthy()
    expect(encrypted.timestamp).toBeGreaterThan(0)

    // Decrypt using recipient's secret key
    const decrypted = decryptMessage(encrypted, recipientKp.secretKey)

    // Assert decrypted payload matches original
    expect(decrypted.version).toBe(original.version)
    expect(decrypted.type).toBe(original.type)
    expect(decrypted.payload).toEqual(original.payload)
  })
})

// ---------------------------------------------------------------------------
// Test 2: Strategy CRUD lifecycle
// ---------------------------------------------------------------------------

describe('Strategy CRUD lifecycle', () => {
  let tempDir: string

  beforeEach(() => {
    // Create a temporary directory for strategy storage during tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-test-'))
    process.env.STRATEGIES_DIR = tempDir
  })

  afterEach(() => {
    // Clean up temporary directory and files
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('should create, pause, resume, and delete a strategy', async () => {
    // Create a strategy from template
    const strategy = await createFromTemplate('standard_payroll', {
      name: 'Test Payroll Strategy',
    })

    expect(strategy.id).toBeTruthy()
    expect(strategy.name).toBe('Test Payroll Strategy')
    expect(strategy.status).toBe('active')
    expect(strategy.type).toBe('standard')

    // Verify it appears in the list
    let strategies = await listStrategies()
    expect(strategies.length).toBeGreaterThan(0)
    const created = strategies.find((s) => s.id === strategy.id)
    expect(created).toBeDefined()
    expect(created?.status).toBe('active')

    // Pause the strategy
    const paused = await pauseStrategy(strategy.id)
    expect(paused.status).toBe('paused')

    // Verify pause persisted
    let retrieved = await getStrategy(strategy.id)
    expect(retrieved?.status).toBe('paused')

    // Resume the strategy
    const resumed = await resumeStrategy(strategy.id)
    expect(resumed.status).toBe('active')

    // Verify resume persisted
    retrieved = await getStrategy(strategy.id)
    expect(retrieved?.status).toBe('active')

    // Delete the strategy
    const deleted = await deleteStrategy(strategy.id)
    expect(deleted).toBe(true)

    // Verify it's gone
    retrieved = await getStrategy(strategy.id)
    expect(retrieved).toBeNull()

    strategies = await listStrategies()
    const found = strategies.find((s) => s.id === strategy.id)
    expect(found).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Test 3: Token resolution
// ---------------------------------------------------------------------------

describe('Token resolution — Base Sepolia', () => {
  it('should resolve USDC and WETH token addresses on Base Sepolia', () => {
    // Verify USDC configuration
    const usdc = baseSepolia.tokens.USDC
    expect(usdc).toBeDefined()
    expect(usdc.address).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e')
    expect(usdc.symbol).toBe('USDC')
    expect(usdc.decimals).toBe(6)

    // Verify WETH configuration
    const weth = baseSepolia.tokens.WETH
    expect(weth).toBeDefined()
    expect(weth.address).toBe('0x4200000000000000000000000000000000000006')
    expect(weth.symbol).toBe('WETH')
    expect(weth.decimals).toBe(18)

    // Verify chain metadata
    expect(baseSepolia.chainId).toBe(84532)
    expect(baseSepolia.name).toBe('Base Sepolia')
  })
})
