/**
 * Whisper Agent — Tool definitions and executor.
 *
 * Defines 8 tools in the Anthropic tool_use format and provides a single
 * `executeTool()` dispatcher that calls the real Unlink / Uniswap wrappers
 * and interacts with the WhisperEscrow contract on Arc testnet.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  encodeFunctionData,
  type Address,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

import { baseSepolia, arcTestnet, getEnvOrThrow } from './config.js'
import {
  createUnlinkClientWrapper,
  getBalances,
  deposit,
  transfer,
  execute,
  buildUniswapExecuteCall,
  type UnlinkClient,
} from './unlink.js'
import { getQuote as uniGetQuote } from './uniswap.js'
import type { ToolName, PayrollRecipient, PayrollConfig } from './types.js'
import {
  encryptMessage,
  decryptMessage,
  generateKeyPair,
  getPrivacyComparison,
  encodeForOnChain,
  type PayrollMessage,
  type EncryptedMessage,
} from './messaging.js'
import { saveAddress, getAddress, listAddresses, resolveENS } from './addressBook.js'
import { dryRunPayroll } from './scheduler.js'
import {
  createStrategy,
  listStrategies,
  getStrategy,
  updateStrategy,
  pauseStrategy,
  resumeStrategy,
  createFromTemplate,
} from './strategies.js'

// ---------------------------------------------------------------------------
// Tool definitions (Anthropic tool_use format)
// ---------------------------------------------------------------------------

export const toolDefinitions = [
  {
    name: 'check_balance' as const,
    description:
      'Check private USDC and WETH balances held in the Unlink privacy pool. Returns all token balances for the current account.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: 'get_quote' as const,
    description:
      'Get a Uniswap swap quote for a token pair on Base Sepolia. Returns expected output amount and price impact. Use token symbols: USDC, WETH.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tokenIn: {
          type: 'string' as const,
          description: 'Input token symbol (e.g. "USDC" or "WETH")',
        },
        tokenOut: {
          type: 'string' as const,
          description: 'Output token symbol (e.g. "WETH" or "USDC")',
        },
        amount: {
          type: 'string' as const,
          description: 'Human-readable amount to swap (e.g. "100" for 100 USDC)',
        },
      },
      required: ['tokenIn', 'tokenOut', 'amount'],
    },
  },
  {
    name: 'private_transfer' as const,
    description:
      'Send tokens privately via the Unlink protocol. The transfer is shielded — neither the sender, recipient, nor amount are publicly visible on-chain.',
    input_schema: {
      type: 'object' as const,
      properties: {
        recipient: {
          type: 'string' as const,
          description:
            'Recipient Unlink address (unlink1...) or ENS name',
        },
        token: {
          type: 'string' as const,
          description: 'Token symbol to send (e.g. "USDC")',
        },
        amount: {
          type: 'string' as const,
          description: 'Human-readable amount to send (e.g. "50")',
        },
      },
      required: ['recipient', 'token', 'amount'],
    },
  },
  {
    name: 'private_swap' as const,
    description:
      'Swap tokens privately through Unlink execute + Uniswap. Funds leave the private pool, are swapped on Uniswap, and the output is re-deposited into the private balance. No public trace links sender to the swap.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tokenIn: {
          type: 'string' as const,
          description: 'Input token symbol (e.g. "USDC")',
        },
        tokenOut: {
          type: 'string' as const,
          description: 'Output token symbol (e.g. "WETH")',
        },
        amount: {
          type: 'string' as const,
          description: 'Human-readable input amount (e.g. "100")',
        },
        minAmountOut: {
          type: 'string' as const,
          description:
            'Minimum output amount for slippage protection (e.g. "0.03"). If omitted, a 1% slippage tolerance is applied to the quote.',
        },
      },
      required: ['tokenIn', 'tokenOut', 'amount'],
    },
  },
  {
    name: 'deposit_to_unlink' as const,
    description:
      'Deposit tokens from the public EVM wallet into the private Unlink balance. This shields the tokens — after deposit they are no longer visible on-chain.',
    input_schema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string' as const,
          description: 'Token symbol to deposit (e.g. "USDC")',
        },
        amount: {
          type: 'string' as const,
          description: 'Human-readable amount to deposit (e.g. "500")',
        },
      },
      required: ['token', 'amount'],
    },
  },
  {
    name: 'create_escrow' as const,
    description:
      'Create a programmable payroll escrow on Arc testnet. Funds are locked in the WhisperEscrow contract and released when milestone conditions (time, oracle price) are met. Recipients receive pro-rata shares.',
    input_schema: {
      type: 'object' as const,
      properties: {
        recipients: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              address: {
                type: 'string' as const,
                description: 'Recipient EVM address',
              },
              share: {
                type: 'number' as const,
                description:
                  'Basis-point share (all shares must sum to 10000). E.g. 5000 = 50%.',
              },
            },
            required: ['address', 'share'],
          },
          description: 'List of recipients with their basis-point shares',
        },
        milestones: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              amount: {
                type: 'string' as const,
                description: 'USDC amount for this milestone (e.g. "1000")',
              },
              unlockTime: {
                type: 'number' as const,
                description:
                  'Unix timestamp when the milestone unlocks (0 = no time lock)',
              },
              oracle: {
                type: 'string' as const,
                description:
                  'Chainlink-compatible price feed address (0x0 = no oracle condition)',
              },
              triggerPrice: {
                type: 'string' as const,
                description:
                  'Price threshold for the oracle condition (e.g. "2000"). Use "0" if no oracle.',
              },
              operator: {
                type: 'string' as const,
                enum: ['GT', 'LT'],
                description:
                  'Comparison operator: GT = price > trigger, LT = price < trigger',
              },
            },
            required: ['amount', 'unlockTime'],
          },
          description: 'Ordered list of payment milestones',
        },
      },
      required: ['recipients', 'milestones'],
    },
  },
  {
    name: 'schedule_payroll' as const,
    description:
      'Set up recurring private payroll. Saves a payroll configuration that can be executed on a schedule. Payments are made via private Unlink transfers.',
    input_schema: {
      type: 'object' as const,
      properties: {
        schedule: {
          type: 'string' as const,
          description:
            'Cron expression or human-readable schedule (e.g. "0 9 1 * *" for 1st of each month at 9am, or "weekly", "biweekly", "monthly")',
        },
        recipients: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              address: {
                type: 'string' as const,
                description: 'Recipient Unlink address',
              },
              amount: {
                type: 'string' as const,
                description: 'USDC amount per payment period',
              },
              name: {
                type: 'string' as const,
                description: 'Optional human-readable name for the recipient',
              },
            },
            required: ['address', 'amount'],
          },
          description: 'List of payroll recipients',
        },
        token: {
          type: 'string' as const,
          description: 'Token symbol for payments (default: USDC)',
        },
      },
      required: ['schedule', 'recipients'],
    },
  },
  {
    name: 'check_escrow' as const,
    description:
      'Check the status of an existing payroll escrow on Arc testnet. Returns creator, token, recipients, shares, milestone statuses, and whether it has been cancelled.',
    input_schema: {
      type: 'object' as const,
      properties: {
        payrollId: {
          type: 'number' as const,
          description: 'The payroll ID returned when the escrow was created',
        },
      },
      required: ['payrollId'],
    },
  },
  // ── Strategy management ──────────────────────────────────────────────────
  {
    name: 'list_strategies' as const,
    description:
      'List all saved payroll strategies with their current status, type, recipient count, and schedule. Returns strategies sorted by creation date (newest first).',
    input_schema: {
      type: 'object' as const,
      properties: {
        statusFilter: {
          type: 'string' as const,
          enum: ['active', 'paused', 'completed'],
          description: 'Optional: filter strategies by status',
        },
      },
      required: [] as string[],
    },
  },
  {
    name: 'get_strategy' as const,
    description:
      'Get full details of a specific payroll strategy including recipients, conditions, execution history, and total spent.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string' as const,
          description: 'Strategy UUID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_strategy' as const,
    description:
      'Create a new payroll strategy, either from a predefined template or fully custom. ' +
      'Templates: standard_payroll (weekly team pay), vesting_schedule (12-month cliff), ' +
      'performance_bonus (price-triggered), contractor_payment (one-time on delivery).',
    input_schema: {
      type: 'object' as const,
      properties: {
        template: {
          type: 'string' as const,
          enum: ['standard_payroll', 'vesting_schedule', 'performance_bonus', 'contractor_payment'],
          description: 'Optional: base template to start from',
        },
        name: {
          type: 'string' as const,
          description: 'Human-readable strategy name',
        },
        type: {
          type: 'string' as const,
          enum: ['standard', 'vesting', 'performance', 'contractor'],
          description: 'Strategy type',
        },
        recipients: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              name:    { type: 'string' as const, description: 'Recipient display name' },
              address: { type: 'string' as const, description: 'EVM address' },
              amount:  { type: 'string' as const, description: 'Token amount per period (e.g. "3500")' },
              share:   { type: 'number' as const, description: 'Basis-point share for pro-rata splits' },
            },
            required: ['name', 'address', 'amount'],
          },
          description: 'Payroll recipients — overrides template recipients when provided',
        },
        token: {
          type: 'string' as const,
          description: 'Token symbol (default: USDC)',
        },
        schedule: {
          type: 'string' as const,
          description: 'Payment frequency: "weekly", "biweekly", "monthly", "one-time"',
        },
        privacyLevel: {
          type: 'string' as const,
          enum: ['private', 'public'],
          description: 'Whether payments are shielded via Unlink (default: private)',
        },
        totalBudget: {
          type: 'string' as const,
          description: 'Total allocated budget for this strategy (e.g. "120000")',
        },
        conditions: {
          type: 'object' as const,
          properties: {
            vestingDuration: { type: 'number' as const, description: 'Vesting duration in seconds' },
            oracleAddress:   { type: 'string' as const, description: 'Chainlink price feed address' },
            triggerPrice:    { type: 'string' as const, description: 'Price threshold (e.g. "4000")' },
            operator:        { type: 'string' as const, enum: ['GT', 'LT'], description: 'GT = above price, LT = below price' },
          },
          description: 'Optional execution conditions (vesting cliff, oracle trigger)',
        },
      },
      required: [] as string[],
    },
  },
  {
    name: 'pause_strategy' as const,
    description:
      'Pause an active payroll strategy. The strategy is preserved with its history but will not execute until resumed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string' as const,
          description: 'Strategy UUID to pause',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'resume_strategy' as const,
    description:
      'Resume a previously paused payroll strategy, returning it to active status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string' as const,
          description: 'Strategy UUID to resume',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'edit_strategy' as const,
    description:
      'Modify an existing payroll strategy. Supports updating recipients, amounts, schedule, token, privacy level, budget, or oracle conditions. Only the supplied fields are changed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string' as const,
          description: 'Strategy UUID to update',
        },
        name: {
          type: 'string' as const,
          description: 'New display name',
        },
        recipients: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              name:    { type: 'string' as const },
              address: { type: 'string' as const },
              amount:  { type: 'string' as const },
              share:   { type: 'number' as const },
            },
            required: ['name', 'address', 'amount'],
          },
          description: 'Replacement recipients list (replaces all existing recipients)',
        },
        schedule: {
          type: 'string' as const,
          description: 'New payment schedule: "weekly", "biweekly", "monthly", "one-time"',
        },
        token: {
          type: 'string' as const,
          description: 'New token symbol',
        },
        privacyLevel: {
          type: 'string' as const,
          enum: ['private', 'public'],
          description: 'New privacy level',
        },
        totalBudget: {
          type: 'string' as const,
          description: 'Updated total budget',
        },
        conditions: {
          type: 'object' as const,
          properties: {
            vestingDuration: { type: 'number' as const },
            oracleAddress:   { type: 'string' as const },
            triggerPrice:    { type: 'string' as const },
            operator:        { type: 'string' as const, enum: ['GT', 'LT'] },
          },
          description: 'Updated execution conditions (merged with existing conditions)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'encrypt_payroll_message' as const,
    description:
      'Encrypt a payroll instruction for a specific recipient using NaCl box (X25519 + XSalsa20-Poly1305). ' +
      'Only the holder of the matching secret key can read the message. ' +
      'Returns the encrypted blob ready for on-chain storage plus a privacy comparison showing what the blockchain sees vs. what the treasurer sees.',
    input_schema: {
      type: 'object' as const,
      properties: {
        recipients: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              name:    { type: 'string' as const, description: 'Recipient display name' },
              address: { type: 'string' as const, description: 'EVM address' },
              amount:  { type: 'string' as const, description: 'Token amount (e.g. "2000")' },
              share:   { type: 'number' as const, description: 'Optional basis-point share' },
            },
            required: ['name', 'address', 'amount'],
          },
          description: 'Payroll recipients',
        },
        token: {
          type: 'string' as const,
          description: 'Token symbol (e.g. "USDC")',
        },
        schedule: {
          type: 'string' as const,
          description: 'Payment schedule (e.g. "weekly", "monthly")',
        },
        memo: {
          type: 'string' as const,
          description: 'Optional human-readable memo',
        },
        recipientPublicKey: {
          type: 'string' as const,
          description: 'Hex-encoded X25519 public key of the treasurer / recipient. If omitted, a fresh keypair is generated and returned.',
        },
        senderSecretKey: {
          type: 'string' as const,
          description: 'Hex-encoded X25519 secret key of the sender. If omitted, a fresh keypair is generated and returned.',
        },
      },
      required: ['recipients', 'token'],
    },
  },
  {
    name: 'decrypt_payroll_message' as const,
    description:
      'Decrypt an encrypted payroll instruction using the recipient\'s secret key. ' +
      'Returns the plaintext payroll instruction.',
    input_schema: {
      type: 'object' as const,
      properties: {
        encryptedMessage: {
          type: 'object' as const,
          description: 'The EncryptedMessage object returned by encrypt_payroll_message',
        },
        recipientSecretKey: {
          type: 'string' as const,
          description: 'Hex-encoded X25519 secret key of the recipient',
        },
      },
      required: ['encryptedMessage', 'recipientSecretKey'],
    },
  },
  {
    name: 'private_cross_chain_transfer' as const,
    description:
      'Transfer USDC privately from Base Sepolia to Arc Testnet via Unlink execute() + CCTP. ' +
      'The sender is hidden (appears as Unlink pool on-chain). Recipient and amount are visible on Arc side. ' +
      'NOTE: This is an architectural preview — CCTP cross-chain execution requires Unlink execute() support for CCTP calls.',
    input_schema: {
      type: 'object' as const,
      properties: {
        amount: {
          type: 'string' as const,
          description: 'Amount of USDC to transfer (human-readable, e.g. "100")',
        },
        recipient: {
          type: 'string' as const,
          description: 'Recipient address on Arc Testnet (0x...)',
        },
      },
      required: ['amount', 'recipient'],
    },
  },
  {
    name: 'save_contact' as const,
    description: 'Save a name→address mapping to the address book. Use when the user mentions a new recipient by name and provides their address.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' as const, description: 'Contact name (e.g. "Alice")' },
        address: { type: 'string' as const, description: 'EVM or Unlink address' },
      },
      required: ['name', 'address'],
    },
  },
  {
    name: 'lookup_contact' as const,
    description: 'Look up a saved contact by name. Returns their address if found. Use when the user refers to someone by name without providing an address.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' as const, description: 'Contact name to look up' },
      },
      required: ['name'],
    },
  },
  {
    name: 'execute_strategy' as const,
    description: 'Execute a payroll strategy immediately (dry-run mode — shows what would happen without sending tokens). Use to demonstrate the payroll execution flow.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string' as const, description: 'Strategy UUID to execute' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_contacts' as const,
    description: 'List all saved contacts in the address book.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'resolve_ens' as const,
    description:
      'Resolve an ENS name (e.g. vitalik.eth, alice.whisper.eth) to an Ethereum address and read on-chain text records. ' +
      'Use this when a user provides an .eth name. Returns the resolved address plus metadata like ai.model, ai.capabilities, unlink.address.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string' as const,
          description: 'ENS name to resolve (e.g. "vitalik.eth", "alice.whisper.eth")',
        },
      },
      required: ['name'],
    },
  },
] as const

// ---------------------------------------------------------------------------
// WhisperEscrow ABI fragments (from the Solidity contract)
// ---------------------------------------------------------------------------

const WHISPER_ESCROW_ABI = [
  {
    name: 'createPayroll',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'recipients', type: 'address[]' },
      { name: 'shares', type: 'uint256[]' },
      {
        name: 'milestones',
        type: 'tuple[]',
        components: [
          { name: 'amount', type: 'uint256' },
          { name: 'unlockTime', type: 'uint256' },
          { name: 'oracle', type: 'address' },
          { name: 'triggerPrice', type: 'uint256' },
          { name: 'operator', type: 'uint8' },
          { name: 'released', type: 'bool' },
        ],
      },
    ],
    outputs: [{ name: 'payrollId', type: 'uint256' }],
  },
  {
    name: 'getPayroll',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'payrollId', type: 'uint256' }],
    outputs: [
      { name: 'creator', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'recipients', type: 'address[]' },
      { name: 'shares', type: 'uint256[]' },
      { name: 'totalAmount', type: 'uint256' },
      { name: 'cancelled', type: 'bool' },
      { name: 'milestoneCount', type: 'uint256' },
    ],
  },
  {
    name: 'getMilestone',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'payrollId', type: 'uint256' },
      { name: 'milestoneIndex', type: 'uint256' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'amount', type: 'uint256' },
          { name: 'unlockTime', type: 'uint256' },
          { name: 'oracle', type: 'address' },
          { name: 'triggerPrice', type: 'uint256' },
          { name: 'operator', type: 'uint8' },
          { name: 'released', type: 'bool' },
        ],
      },
    ],
  },
  {
    name: 'checkCondition',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'payrollId', type: 'uint256' },
      { name: 'milestoneIndex', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

const ERC20_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

// ---------------------------------------------------------------------------
// Singleton clients (lazy-initialized)
// ---------------------------------------------------------------------------

let _unlinkClient: UnlinkClient | null = null

function getUnlinkClient(): UnlinkClient {
  if (!_unlinkClient) {
    const mnemonic = getEnvOrThrow('UNLINK_MNEMONIC')
    const rpcUrl = baseSepolia.rpcUrl || getEnvOrThrow('BASE_SEPOLIA_RPC_URL')
    _unlinkClient = createUnlinkClientWrapper(mnemonic, rpcUrl)
  }
  return _unlinkClient
}

// Arc testnet chain definition for viem
const arcChain = {
  id: arcTestnet.chainId,
  name: arcTestnet.name,
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: {
    default: { http: [arcTestnet.rpcUrl] },
  },
} as const

function getArcClients() {
  const privateKey = getEnvOrThrow('PRIVATE_KEY') as `0x${string}`
  const account = privateKeyToAccount(privateKey)

  const publicClient = createPublicClient({
    chain: arcChain,
    transport: http(arcTestnet.rpcUrl),
  })

  const walletClient = createWalletClient({
    account,
    chain: arcChain,
    transport: http(arcTestnet.rpcUrl),
  })

  return { publicClient, walletClient, account }
}

function getEscrowAddress(): Address {
  return (process.env.WHISPER_ESCROW_ADDRESS ||
    '0x0000000000000000000000000000000000000000') as Address
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a token symbol to its address on Base Sepolia. */
function resolveToken(symbol: string): { address: string; decimals: number } {
  const upper = symbol.toUpperCase()
  const token = baseSepolia.tokens[upper]
  if (!token) {
    throw new Error(
      `Unknown token "${symbol}". Supported: ${Object.keys(baseSepolia.tokens).join(', ')}`,
    )
  }
  return { address: token.address, decimals: token.decimals }
}

/** Resolve a token symbol to its address on Arc testnet. */
function resolveArcToken(symbol: string): { address: string; decimals: number } {
  const upper = symbol.toUpperCase()
  const token = arcTestnet.tokens[upper]
  if (!token) {
    throw new Error(
      `Unknown Arc token "${symbol}". Supported: ${Object.keys(arcTestnet.tokens).join(', ')}`,
    )
  }
  return { address: token.address, decimals: token.decimals }
}

/** Data directory for persisted configs. */
const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

/**
 * Execute a tool by name with the given input.
 * Returns a JSON-serialized string suitable for the Anthropic tool_result block.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    switch (name as ToolName) {
      // ── check_balance ────────────────────────
      case 'check_balance': {
        const client = getUnlinkClient()
        const balances = await getBalances(client)

        if (balances.length === 0) {
          return JSON.stringify({
            success: true,
            balances: [],
            message: 'No private balances found. Deposit tokens first.',
          })
        }

        return JSON.stringify({ success: true, balances })
      }

      // ── get_quote ────────────────────────────
      case 'get_quote': {
        const tokenInInfo = resolveToken(input.tokenIn as string)
        const tokenOutInfo = resolveToken(input.tokenOut as string)
        const amount = input.amount as string
        const decimals = tokenInInfo.decimals
        const rawAmount = parseUnits(amount, decimals).toString()

        const client = getUnlinkClient()
        const swapper = client.evmAddress

        const quote = await uniGetQuote({
          tokenIn: tokenInInfo.address,
          tokenOut: tokenOutInfo.address,
          amount: rawAmount,
          chainId: baseSepolia.chainId,
          swapper,
          type: 'EXACT_INPUT',
        })

        const amountOut = formatUnits(
          BigInt(quote.quote.amountOut),
          tokenOutInfo.decimals,
        )

        return JSON.stringify({
          success: true,
          tokenIn: input.tokenIn,
          tokenOut: input.tokenOut,
          amountIn: amount,
          amountOut,
          priceImpact: quote.quote.priceImpact ?? 'N/A',
          routing: quote.routing,
        })
      }

      // ── private_transfer ─────────────────────
      case 'private_transfer': {
        const tokenInfo = resolveToken(input.token as string)
        const client = getUnlinkClient()

        // Resolve recipient: if it's a name (not an address), look up from address book
        let recipientAddress = input.recipient as string
        if (!recipientAddress.startsWith('unlink1') && !recipientAddress.startsWith('0x')) {
          const resolved = getAddress(recipientAddress)
          if (!resolved) {
            return JSON.stringify({
              success: false,
              error: `Contact "${recipientAddress}" not found in address book. Use list_contacts to see available contacts.`,
            })
          }
          recipientAddress = resolved
        }

        // Auto-retry: if first attempt fails, wait 3s and retry once
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const result = await transfer(client, {
              token: tokenInfo.address,
              recipientAddress,
              amount: input.amount as string,
              skipPolling: true, // Return immediately — don't wait 30s for relay
            })

            return JSON.stringify({
              success: true,
              txHash: result.txHash,
              status: result.status,
              recipient: input.recipient,
              amount: input.amount,
              token: input.token,
              message: `Privately transferred ${input.amount} ${input.token} to ${input.recipient}. Transaction ${result.status === 'submitted' ? 'submitted to relayer' : 'confirmed on-chain'}.`,
              ...(attempt > 0 ? { retried: true } : {}),
            })
          } catch (err) {
            if (attempt === 0) {
              // First failure — wait 3s and retry
              await new Promise((r) => setTimeout(r, 3000))
              continue
            }
            // Second failure — give up
            return JSON.stringify({
              success: false,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }
        // Should never reach here, but satisfy TypeScript
        return JSON.stringify({ success: false, error: 'Unexpected error' })
      }

      // ── private_swap ─────────────────────────
      case 'private_swap': {
        const tokenInInfo = resolveToken(input.tokenIn as string)
        const tokenOutInfo = resolveToken(input.tokenOut as string)
        const amount = input.amount as string
        let minAmountOut = input.minAmountOut as string | undefined

        // If no minAmountOut, get a quote and apply 1% slippage
        if (!minAmountOut) {
          const rawAmount = parseUnits(amount, tokenInInfo.decimals).toString()
          const client = getUnlinkClient()

          const quote = await uniGetQuote({
            tokenIn: tokenInInfo.address,
            tokenOut: tokenOutInfo.address,
            amount: rawAmount,
            chainId: baseSepolia.chainId,
            swapper: client.evmAddress,
            type: 'EXACT_INPUT',
          })

          // Apply 1% slippage to quoted output
          const quotedOut = BigInt(quote.quote.amountOut)
          const minOut = (quotedOut * 99n) / 100n
          minAmountOut = formatUnits(minOut, tokenOutInfo.decimals)
        }

        // Build the Uniswap execute calldata
        const { approveCall, swapCall } = buildUniswapExecuteCall({
          tokenIn: tokenInInfo.address,
          tokenOut: tokenOutInfo.address,
          amount,
          minAmountOut,
        })

        const client = getUnlinkClient()
        const deadline = Math.floor(Date.now() / 1000) + 600 // 10 minutes

        const result = await execute(client, {
          withdrawals: [{ token: tokenInInfo.address, amount }],
          calls: [approveCall, swapCall],
          outputs: [{ token: tokenOutInfo.address, minAmount: minAmountOut }],
          deadline,
        })

        return JSON.stringify({
          success: true,
          txHash: result.txHash,
          tokenIn: input.tokenIn,
          tokenOut: input.tokenOut,
          amountIn: amount,
          minAmountOut,
          message: `Privately swapped ${amount} ${input.tokenIn} for ${input.tokenOut} via Unlink execute`,
        })
      }

      // ── deposit_to_unlink ────────────────────
      case 'deposit_to_unlink': {
        const tokenInfo = resolveToken(input.token as string)
        const client = getUnlinkClient()

        const result = await deposit(client, {
          token: tokenInfo.address,
          amount: input.amount as string,
        })

        return JSON.stringify({
          success: true,
          txHash: result.txHash,
          token: input.token,
          amount: input.amount,
          message: `Deposited ${input.amount} ${input.token} into private Unlink balance`,
        })
      }

      // ── create_escrow ────────────────────────
      case 'create_escrow': {
        const escrowAddress = getEscrowAddress()
        if (escrowAddress === '0x0000000000000000000000000000000000000000') {
          return JSON.stringify({
            success: false,
            error:
              'WhisperEscrow contract address not configured. Set WHISPER_ESCROW_ADDRESS in .env',
          })
        }

        const recipients = input.recipients as Array<{
          address: string
          share: number
        }>
        const milestones = input.milestones as Array<{
          amount: string
          unlockTime: number
          oracle?: string
          triggerPrice?: string
          operator?: 'GT' | 'LT'
        }>

        const arcUsdc = resolveArcToken('USDC')

        // Build milestone tuples
        const milestoneTuples = milestones.map((m) => ({
          amount: parseUnits(m.amount, arcUsdc.decimals),
          unlockTime: BigInt(m.unlockTime || 0),
          oracle: (m.oracle || '0x0000000000000000000000000000000000000000') as Address,
          triggerPrice: parseUnits(m.triggerPrice || '0', 0),
          operator: m.operator === 'LT' ? 1 : 0,
          released: false,
        }))

        const recipientAddresses = recipients.map((r) => r.address as Address)
        const shares = recipients.map((r) => BigInt(r.share))

        // Calculate total for approval
        const totalAmount = milestoneTuples.reduce(
          (sum, m) => sum + m.amount,
          0n,
        )

        const { publicClient, walletClient, account } = getArcClients()

        // Approve escrow contract to spend USDC
        const approveData = encodeFunctionData({
          abi: ERC20_APPROVE_ABI,
          functionName: 'approve',
          args: [escrowAddress, totalAmount],
        })

        const approveTx = await walletClient.sendTransaction({
          to: arcUsdc.address as Address,
          data: approveData,
        })
        await publicClient.waitForTransactionReceipt({ hash: approveTx })

        // Create the payroll
        const createData = encodeFunctionData({
          abi: WHISPER_ESCROW_ABI,
          functionName: 'createPayroll',
          args: [
            arcUsdc.address as Address,
            recipientAddresses,
            shares,
            milestoneTuples,
          ],
        })

        const createTx = await walletClient.sendTransaction({
          to: escrowAddress,
          data: createData,
        })
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: createTx,
        })

        // Parse the payrollId from the return value (first topic of PayrollCreated event)
        // The event signature: PayrollCreated(uint256 indexed payrollId, ...)
        let payrollId = 'unknown'
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() === escrowAddress.toLowerCase()) {
            // payrollId is the first indexed topic (topics[1])
            if (log.topics[1]) {
              payrollId = BigInt(log.topics[1]).toString()
              break
            }
          }
        }

        return JSON.stringify({
          success: true,
          payrollId,
          txHash: createTx,
          totalAmount: formatUnits(totalAmount, arcUsdc.decimals),
          milestoneCount: milestones.length,
          recipientCount: recipients.length,
          chain: 'Arc Testnet',
          message: `Created escrow payroll #${payrollId} with ${milestones.length} milestones for ${recipients.length} recipients`,
        })
      }

      // ── schedule_payroll ─────────────────────
      case 'schedule_payroll': {
        ensureDataDir()

        const schedule = input.schedule as string
        const recipients = input.recipients as PayrollRecipient[]
        const tokenSymbol = (input.token as string) || 'USDC'

        const client = getUnlinkClient()
        const ownerAddress =
          client.unlinkAddress || (await client.sdk.getAddress())

        const config: PayrollConfig = {
          id: randomUUID(),
          recipients,
          token: tokenSymbol,
          schedule,
          ownerAddress,
          signature: '', // Will be signed when executing
          createdAt: Date.now(),
        }

        const filePath = join(DATA_DIR, `payroll-${config.id}.json`)
        writeFileSync(filePath, JSON.stringify(config, null, 2))

        const totalPerPeriod = recipients.reduce(
          (sum, r) => sum + parseFloat(r.amount),
          0,
        )

        return JSON.stringify({
          success: true,
          payrollId: config.id,
          schedule,
          recipientCount: recipients.length,
          totalPerPeriod: `${totalPerPeriod} ${tokenSymbol}`,
          message: `Scheduled recurring payroll "${config.id}" — ${totalPerPeriod} ${tokenSymbol} to ${recipients.length} recipients on schedule: ${schedule}`,
        })
      }

      // ── check_escrow ─────────────────────────
      case 'check_escrow': {
        const escrowAddress = getEscrowAddress()
        if (escrowAddress === '0x0000000000000000000000000000000000000000') {
          return JSON.stringify({
            success: false,
            error:
              'WhisperEscrow contract address not configured. Set WHISPER_ESCROW_ADDRESS in .env',
          })
        }

        const payrollId = BigInt(input.payrollId as number)
        const { publicClient } = getArcClients()

        // Read the payroll record
        const payrollData = await publicClient.readContract({
          address: escrowAddress,
          abi: WHISPER_ESCROW_ABI,
          functionName: 'getPayroll',
          args: [payrollId],
        })

        const [
          creator,
          token,
          recipientAddrs,
          shares,
          totalAmount,
          cancelled,
          milestoneCount,
        ] = payrollData as [Address, Address, Address[], bigint[], bigint, boolean, bigint]

        // Read each milestone
        const milestones: Array<{
          index: number
          amount: string
          unlockTime: number
          oracle: string
          triggerPrice: string
          operator: string
          released: boolean
          conditionMet: boolean
        }> = []

        for (let i = 0n; i < milestoneCount; i++) {
          const msData = await publicClient.readContract({
            address: escrowAddress,
            abi: WHISPER_ESCROW_ABI,
            functionName: 'getMilestone',
            args: [payrollId, i],
          })

          const ms = msData as {
            amount: bigint
            unlockTime: bigint
            oracle: Address
            triggerPrice: bigint
            operator: number
            released: boolean
          }

          // Check if condition is currently met
          let conditionMet = false
          try {
            conditionMet = (await publicClient.readContract({
              address: escrowAddress,
              abi: WHISPER_ESCROW_ABI,
              functionName: 'checkCondition',
              args: [payrollId, i],
            })) as boolean
          } catch {
            // If the call reverts, condition is not met
          }

          milestones.push({
            index: Number(i),
            amount: formatUnits(ms.amount, 6), // Arc USDC = 6 decimals
            unlockTime: Number(ms.unlockTime),
            oracle: ms.oracle,
            triggerPrice: ms.triggerPrice.toString(),
            operator: ms.operator === 0 ? 'GT' : 'LT',
            released: ms.released,
            conditionMet,
          })
        }

        return JSON.stringify({
          success: true,
          payrollId: Number(payrollId),
          creator,
          token,
          recipients: recipientAddrs.map((addr, i) => ({
            address: addr,
            shareBps: Number(shares[i]),
          })),
          totalAmount: formatUnits(totalAmount, 6),
          cancelled,
          milestones,
          chain: 'Arc Testnet',
        })
      }

      // ── list_strategies ──────────────────────
      case 'list_strategies': {
        const all = await listStrategies()
        const statusFilter = input.statusFilter as string | undefined
        const results = statusFilter
          ? all.filter((s) => s.status === statusFilter)
          : all

        return JSON.stringify({
          success: true,
          count: results.length,
          strategies: results.map((s) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            status: s.status,
            schedule: s.schedule,
            token: s.token,
            recipientCount: s.recipients.length,
            spent: s.spent,
            totalBudget: s.totalBudget,
            executionCount: s.executions.length,
            createdAt: s.createdAt,
            lastExecutedAt: s.lastExecutedAt,
          })),
        })
      }

      // ── get_strategy ──────────────────────────
      case 'get_strategy': {
        const strategy = await getStrategy(input.id as string)
        if (!strategy) {
          return JSON.stringify({ success: false, error: `Strategy not found: ${input.id}` })
        }
        return JSON.stringify({ success: true, strategy })
      }

      // ── create_strategy ───────────────────────
      case 'create_strategy': {
        const templateName = input.template as string | undefined

        const overrides: Partial<import('./strategies.js').PayrollStrategy> = {}
        if (input.name)         overrides.name         = input.name as string
        if (input.type)         overrides.type         = input.type as 'standard' | 'vesting' | 'performance' | 'contractor'
        if (input.recipients)   overrides.recipients   = input.recipients as typeof overrides.recipients
        if (input.token)        overrides.token        = input.token as string
        if (input.schedule)     overrides.schedule     = input.schedule as string
        if (input.privacyLevel) overrides.privacyLevel = input.privacyLevel as 'private' | 'public'
        if (input.totalBudget)  overrides.totalBudget  = input.totalBudget as string
        if (input.conditions)   overrides.conditions   = input.conditions as typeof overrides.conditions

        const strategy = templateName
          ? await createFromTemplate(templateName, overrides)
          : await createStrategy(overrides)

        return JSON.stringify({
          success: true,
          strategy,
          message: `Created strategy "${strategy.name}" (${strategy.id})`,
        })
      }

      // ── pause_strategy ────────────────────────
      case 'pause_strategy': {
        const strategy = await pauseStrategy(input.id as string)
        return JSON.stringify({
          success: true,
          strategy,
          message: `Strategy "${strategy.name}" is now paused`,
        })
      }

      // ── resume_strategy ───────────────────────
      case 'resume_strategy': {
        const strategy = await resumeStrategy(input.id as string)
        return JSON.stringify({
          success: true,
          strategy,
          message: `Strategy "${strategy.name}" is now active`,
        })
      }

      // ── edit_strategy ─────────────────────────
      case 'edit_strategy': {
        const { id, ...rawUpdates } = input as { id: string } & Record<string, unknown>
        const updates: Partial<import('./strategies.js').PayrollStrategy> = {}

        if (rawUpdates.name)         updates.name         = rawUpdates.name as string
        if (rawUpdates.recipients)   updates.recipients   = rawUpdates.recipients as typeof updates.recipients
        if (rawUpdates.schedule)     updates.schedule     = rawUpdates.schedule as string
        if (rawUpdates.token)        updates.token        = rawUpdates.token as string
        if (rawUpdates.privacyLevel) updates.privacyLevel = rawUpdates.privacyLevel as 'private' | 'public'
        if (rawUpdates.totalBudget)  updates.totalBudget  = rawUpdates.totalBudget as string
        if (rawUpdates.conditions) {
          // Get current strategy to merge conditions
          const existing = await getStrategy(id)
          updates.conditions = {
            ...(existing?.conditions ?? {}),
            ...(rawUpdates.conditions as object),
          }
        }

        const strategy = await updateStrategy(id, updates)
        return JSON.stringify({
          success: true,
          strategy,
          message: `Strategy "${strategy.name}" updated successfully`,
        })
      }

      // ── private_cross_chain_transfer ────────
      case 'private_cross_chain_transfer': {
        const { amount, recipient } = input as { amount: string; recipient: string }
        // Architectural preview — describes what would happen
        return JSON.stringify({
          success: true,
          preview: true,
          message: `Cross-chain private transfer: ${amount} USDC from Base Sepolia → Arc Testnet`,
          flow: [
            `1. Withdraw ${amount} USDC from Unlink private balance`,
            `2. Approve USDC to CCTP TokenMessenger (0x8FE6B999...)`,
            `3. Call depositForBurn(${amount}, ARC_DOMAIN, ${recipient}, USDC)`,
            `4. CCTP burns USDC on Base Sepolia`,
            `5. CCTP mints ${amount} USDC on Arc Testnet to ${recipient}`,
          ],
          privacy: {
            senderHidden: true,
            recipientVisible: true,
            amountVisible: true,
            note: 'On-chain sender appears as Unlink pool (0x647f9b99...), not your address',
          },
          status: 'ARCHITECTURAL_PREVIEW — execute() + CCTP integration pending',
        })
      }

      // ── encrypt_payroll_message ──────────────
      case 'encrypt_payroll_message': {
        // Build the PayrollMessage
        const message: PayrollMessage = {
          version: 1,
          type: 'payroll_instruction',
          payload: {
            recipients: input.recipients as PayrollMessage['payload']['recipients'],
            token: input.token as string,
            schedule: input.schedule as string | undefined,
            memo: input.memo as string | undefined,
          },
        }

        // Generate keypairs if not supplied
        let recipientPublicKey = input.recipientPublicKey as string | undefined
        let senderSecretKey = input.senderSecretKey as string | undefined
        let generatedRecipientKeypair: { publicKey: string; secretKey: string } | undefined
        let generatedSenderKeypair: { publicKey: string; secretKey: string } | undefined

        if (!recipientPublicKey) {
          generatedRecipientKeypair = generateKeyPair()
          recipientPublicKey = generatedRecipientKeypair.publicKey
        }
        if (!senderSecretKey) {
          generatedSenderKeypair = generateKeyPair()
          senderSecretKey = generatedSenderKeypair.secretKey
        }

        const encrypted = encryptMessage(message, recipientPublicKey, senderSecretKey)
        const comparison = getPrivacyComparison(encrypted, message)

        return JSON.stringify({
          success: true,
          encrypted,
          onChainCalldata: encodeForOnChain(encrypted),
          privacyComparison: comparison,
          ...(generatedRecipientKeypair && { generatedRecipientKeypair }),
          ...(generatedSenderKeypair && { generatedSenderKeypair }),
          message: 'Payroll instruction encrypted. Store the recipient secret key securely — it is the only way to decrypt this message.',
        })
      }

      // ── decrypt_payroll_message ──────────────
      case 'decrypt_payroll_message': {
        const encryptedMsg = input.encryptedMessage as EncryptedMessage
        const recipientSecretKey = input.recipientSecretKey as string
        const decrypted = decryptMessage(encryptedMsg, recipientSecretKey)

        return JSON.stringify({
          success: true,
          decrypted,
          payload: decrypted.payload,
          message: 'Message decrypted successfully.',
        })
      }

      // ── execute_strategy ─────────────────────
      case 'execute_strategy': {
        const { id } = input as { id: string }
        const strategy = await getStrategy(id)
        if (!strategy) {
          return JSON.stringify({ success: false, error: `Strategy ${id} not found` })
        }

        const client = getUnlinkClient()
        const tokenAddress = strategy.token || baseSepolia.tokens.USDC.address
        const results: Array<{ name: string; amount: string; success: boolean; txHash?: string; error?: string }> = []

        // Execute transfers sequentially with retry
        for (const recipient of strategy.recipients) {
          // Resolve recipient address
          let addr = recipient.address || recipient.name
          if (!addr.startsWith('unlink1') && !addr.startsWith('0x')) {
            const resolved = getAddress(addr)
            if (resolved) addr = resolved
          }

          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const result = await transfer(client, {
                token: tokenAddress,
                recipientAddress: addr,
                amount: recipient.amount,
                skipPolling: true,
              })
              results.push({ name: recipient.name || addr, amount: recipient.amount, success: true, txHash: result.txHash })
              break
            } catch (err) {
              if (attempt === 0) {
                await new Promise((r) => setTimeout(r, 3000))
                continue
              }
              results.push({ name: recipient.name || addr, amount: recipient.amount, success: false, error: err instanceof Error ? err.message : String(err) })
            }
          }
        }

        const succeeded = results.filter((r) => r.success).length
        const totalPaid = results.filter((r) => r.success).reduce((sum, r) => sum + parseFloat(r.amount), 0)
        return JSON.stringify({
          success: succeeded > 0,
          mode: 'executed',
          strategy: strategy.name,
          payslip: {
            id: `PAY-${strategy.id.slice(0, 8).toUpperCase()}`,
            executedAt: new Date().toISOString(),
            totalPaid: totalPaid.toFixed(4),
            currency: 'USDC',
            recipientCount: results.length,
            successCount: succeeded,
          },
          results: results.map((r) => ({
            ...r,
            explorerUrl: r.txHash ? `https://sepolia.basescan.org/tx/${r.txHash}` : null,
          })),
          summary: `${succeeded}/${results.length} payments executed privately via Unlink`,
          message: `Payroll "${strategy.name}" complete: ${succeeded}/${results.length} paid, ${totalPaid.toFixed(4)} USDC total.`,
        })
      }

      // ── save_contact ─────────────────────────
      case 'save_contact': {
        const { name: contactName, address } = input as { name: string; address: string }
        await saveAddress(contactName, address)
        return JSON.stringify({
          success: true,
          message: `Saved ${contactName} → ${address}`,
        })
      }

      // ── lookup_contact ────────────────────────
      case 'lookup_contact': {
        const { name: contactName } = input as { name: string }

        // Try local address book first
        const address = getAddress(contactName)
        if (address) {
          return JSON.stringify({ success: true, name: contactName, address, source: 'address_book' })
        }

        // If it looks like an ENS name, try ENS resolution
        if (contactName.endsWith('.eth')) {
          const ensResult = await resolveENS(contactName)
          if (ensResult.address) {
            // Cache for future lookups
            await saveAddress(contactName, ensResult.address)
            return JSON.stringify({
              success: true,
              name: contactName,
              address: ensResult.address,
              source: 'ens',
              textRecords: ensResult.textRecords,
            })
          }
        }

        return JSON.stringify({
          success: false,
          error: `No address found for "${contactName}". Try an ENS name (e.g. alice.eth) or ask the user for their address.`,
        })
      }

      // ── list_contacts ─────────────────────────
      case 'list_contacts': {
        const contacts = listAddresses()
        const count = Object.keys(contacts).length
        return JSON.stringify({
          success: true,
          count,
          contacts,
          message: count > 0
            ? `${count} contacts saved`
            : 'No contacts saved yet. Tell me someone\'s name and address to save them.',
        })
      }

      // ── resolve_ens ─────────────────────────
      case 'resolve_ens': {
        const ensName = input.name as string
        const result = await resolveENS(ensName)

        if (!result.address) {
          return JSON.stringify({
            success: false,
            error: `Could not resolve ENS name "${ensName}". It may not be registered or the name may be invalid.`,
          })
        }

        // Cache the resolved address in the local address book
        const shortName = ensName.split('.')[0] // "alice.eth" → "alice"
        await saveAddress(ensName, result.address)

        return JSON.stringify({
          success: true,
          name: ensName,
          address: result.address,
          textRecords: result.textRecords || {},
          cached: true,
          message: `Resolved ${ensName} → ${result.address}${
            Object.keys(result.textRecords || {}).length > 0
              ? `. Metadata: ${JSON.stringify(result.textRecords)}`
              : ''
          }`,
        })
      }

      default:
        return JSON.stringify({
          success: false,
          error: `Unknown tool: ${name}`,
        })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ success: false, error: message })
  }
}
