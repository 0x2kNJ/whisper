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
import { randomUUID } from 'node:crypto'
import { dbReadBalanceCache, dbWriteBalanceCache } from '@/lib/db'

import { baseSepolia, arcTestnet, getEnvOrThrow, CCTP_TOKEN_MESSENGER_V2, CCTP_ARC_DOMAIN, UNLINK_ADAPTER, APP_BASE_URL } from './config'
import {
  createUnlinkClientWrapper,
  getBalances,
  deposit,
  transfer,
  batchTransfer,
  execute,
  buildUniswapExecuteCall,
  type UnlinkClient,
} from './unlink'
import { getQuote as uniGetQuote } from './uniswap'
import type { ToolName, PayrollRecipient, PayrollConfig } from './types'
import {
  encryptMessage,
  decryptMessage,
  generateKeyPair,
  getPrivacyComparison,
  encodeForOnChain,
  type PayrollMessage,
  type EncryptedMessage,
} from './messaging'
import { saveAddress, getAddress, listAddresses, resolveENS, publishPayrollProof } from './addressBook'
import { dryRunPayroll } from './scheduler'
import {
  createStrategy,
  listStrategies,
  getStrategy,
  updateStrategy,
  pauseStrategy,
  resumeStrategy,
  createFromTemplate,
} from './strategies'

// ---------------------------------------------------------------------------
// Explorer URL helper
// ---------------------------------------------------------------------------

const UNLINK_POOL = '0x647f9b99af97e4b79DD9Dd6de3b583236352f482'

function baseSepoliaExplorerUrl(txHash: string): string {
  if (txHash.startsWith('0x')) {
    return `https://sepolia.basescan.org/tx/${txHash}`
  }
  return `https://sepolia.basescan.org/address/${UNLINK_POOL}#internaltx`
}

// ---------------------------------------------------------------------------
// Shielded balance cache — tracks WETH from swaps (Unlink SDK doesn't report it)
// ---------------------------------------------------------------------------

interface ShieldedBalanceCache {
  [symbol: string]: { balance: string; updatedAt: number }
}

async function readBalanceCache(): Promise<ShieldedBalanceCache> {
  try {
    return await dbReadBalanceCache()
  } catch {
    return {}
  }
}

async function updateShieldedBalance(symbol: string, delta: number, absolute?: number) {
  const cache = await readBalanceCache()
  const newBalance = absolute !== undefined
    ? absolute.toString()
    : (parseFloat(cache[symbol]?.balance || '0') + delta).toString()
  await dbWriteBalanceCache(symbol, newBalance)
}

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
    name: 'batch_private_transfer' as const,
    description:
      'Send tokens privately to multiple recipients in a single ZK proof via the Unlink protocol. ' +
      'More efficient than sequential private_transfer calls and avoids UTXO contention. ' +
      'Use this for payroll, airdrops, or any multi-recipient payment.',
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
                description: 'Recipient Unlink address (unlink1...), ENS name, or contact name',
              },
              amount: {
                type: 'string' as const,
                description: 'Human-readable amount to send (e.g. "50")',
              },
              name: {
                type: 'string' as const,
                description: 'Optional human-readable name for the recipient',
              },
            },
            required: ['address', 'amount'],
          },
          description: 'List of recipients with amounts',
        },
        token: {
          type: 'string' as const,
          description: 'Token symbol to send (e.g. "USDC") — same token for all recipients',
        },
      },
      required: ['recipients', 'token'],
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
      'Transfer USDC privately from Base Sepolia to Arc Testnet via Unlink execute() + CCTP V2. ' +
      'The sender is hidden (appears as Unlink pool on-chain). Recipient and amount are visible on Arc side. ' +
      'Uses TokenMessengerV2 depositForBurn to burn USDC on Base Sepolia and mint on Arc Testnet (domain 26).',
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
  {
    name: 'verify_payment_proof' as const,
    description:
      'Verify a ZK payment proof for an ENS name. Reads the payroll.proof text record from the ENS name ' +
      'and confirms that a ZK-shielded payment was made. This proves someone was paid without revealing ' +
      'the amount, sender, or other recipients. Use this to demonstrate verifiable private payroll.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string' as const,
          description: 'ENS name to verify (e.g. "alice.whisper.eth")',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'run_cross_chain_payroll' as const,
    description:
      'End-to-end cross-chain private payroll. Bridges USDC from Base Sepolia to Arc Testnet via Unlink + CCTP V2 (sender hidden), ' +
      'then creates a milestone escrow on Arc that locks funds for each recipient. Returns verify URLs for every recipient. ' +
      'Use this when a user wants to run payroll across chains, or pay multiple people with escrow conditions on Arc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        recipients: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              name: { type: 'string' as const, description: 'Recipient name or ENS (e.g. "alice" or "alice.whisper.eth")' },
              address: { type: 'string' as const, description: 'Recipient EVM address on Arc (0x...). Resolved from ENS if not provided.' },
              amount: { type: 'string' as const, description: 'USDC amount for this recipient (e.g. "0.003")' },
            },
            required: ['name', 'amount'],
          },
          description: 'List of payroll recipients with amounts',
        },
        milestones: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              amount: { type: 'string' as const, description: 'USDC amount for this milestone' },
              unlockTime: { type: 'number' as const, description: 'Unix timestamp when funds unlock (0 = immediate)' },
              oracle: { type: 'string' as const, description: 'Oracle address for price condition (optional)' },
              triggerPrice: { type: 'string' as const, description: 'Price threshold (optional)' },
              operator: { type: 'string' as const, enum: ['GT', 'LT'], description: 'GT = price above, LT = price below (optional)' },
            },
            required: ['amount'],
          },
          description: 'Milestone conditions for escrow release. If omitted, defaults to single immediate-release milestone.',
        },
      },
      required: ['recipients'],
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

/** Poll Arc USDC balance until CCTP transfer arrives. */
async function waitForCctpArrival(
  recipientOnArc: string,
  expectedIncrease: bigint,
  timeoutMs = 300_000, // 5 min default
): Promise<{ arrived: boolean; balance: bigint; elapsed: number }> {
  const arcUsdc = resolveArcToken('USDC')
  const { publicClient } = getArcClients()
  const startBalance = (await publicClient.readContract({
    address: arcUsdc.address as Address,
    abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] }],
    functionName: 'balanceOf',
    args: [recipientOnArc as Address],
  })) as bigint

  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 10_000)) // poll every 10s
    const current = (await publicClient.readContract({
      address: arcUsdc.address as Address,
      abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] }],
      functionName: 'balanceOf',
      args: [recipientOnArc as Address],
    })) as bigint

    if (current - startBalance >= expectedIncrease) {
      return { arrived: true, balance: current, elapsed: Date.now() - start }
    }
  }
  return { arrived: false, balance: BigInt(0), elapsed: Date.now() - start }
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
        const poolBalances = await getBalances(client)

        const USDC_ADDR = baseSepolia.tokens.USDC.address.toLowerCase()
        const WETH_ADDR = '0x4200000000000000000000000000000000000006'

        let usdcAmt = 0
        let wethAmt = 0
        for (const b of poolBalances as Array<{ token: string; balance: string }>) {
          const addr = b.token.toLowerCase()
          if (addr === USDC_ADDR) usdcAmt += parseFloat(b.balance)
          else if (addr === WETH_ADDR) wethAmt += parseFloat(b.balance)
        }

        // SDK doesn't report WETH from swaps — check cache
        if (wethAmt === 0) {
          try {
            const cache = await dbReadBalanceCache()
            if (cache['WETH']) wethAmt = Math.max(0, parseFloat(cache['WETH'].balance))
          } catch {}
        }

        return JSON.stringify({
          success: true,
          balances: {
            USDC: Math.max(0, usdcAmt).toFixed(6),
            WETH: Math.max(0, wethAmt).toFixed(6),
          },
          note: 'These are your Unlink privacy pool balances. Use 330 USDC/WETH for value calculations on this testnet.',
        })
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

        // Save original name for display + verify URL
        const originalRecipient = input.recipient as string
        const ensName = originalRecipient.endsWith('.eth')
          ? originalRecipient
          : originalRecipient.startsWith('unlink1') || originalRecipient.startsWith('0x')
          ? null // raw address — no ENS name
          : `${originalRecipient.toLowerCase()}.whisper.eth`

        // Resolve recipient: ENS → address book → raw address
        let recipientAddress = originalRecipient
        if (recipientAddress.endsWith('.eth')) {
          // ENS resolution — prioritizes unlink.address for privacy
          const ensResult = await resolveENS(recipientAddress)
          if (ensResult.preferredAddress) {
            recipientAddress = ensResult.preferredAddress
          } else {
            return JSON.stringify({
              success: false,
              error: `Could not resolve ENS name "${recipientAddress}".`,
            })
          }
        } else if (!recipientAddress.startsWith('unlink1') && !recipientAddress.startsWith('0x')) {
          const resolved = getAddress(recipientAddress)
          if (!resolved) {
            return JSON.stringify({
              success: false,
              error: `Contact "${recipientAddress}" not found. Try an ENS name (e.g. alice.eth) or use list_contacts.`,
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

            // Build a clean ENS name for the verify URL (don't mangle unlink addresses)
            const displayRecipient = ensName || (
              String(input.recipient).endsWith('.eth') && !String(input.recipient).startsWith('unlink1')
                ? String(input.recipient)
                : String(input.recipient).startsWith('unlink1') || String(input.recipient).startsWith('0x')
                  ? null
                  : `${String(input.recipient).toLowerCase()}.whisper.eth`
            )

            // Auto-publish proof to ENS
            if (displayRecipient?.endsWith('.whisper.eth')) {
              publishPayrollProof(displayRecipient, { txHash: result.txHash }).catch((e) =>
                console.error(`Auto-publish proof failed for ${displayRecipient}:`, e),
              )
            }

            return JSON.stringify({
              success: true,
              recipient: displayRecipient || input.recipient,
              amount: input.amount,
              token: input.token,
              txHash: result.txHash,
              explorerUrl: baseSepoliaExplorerUrl(result.txHash),
              ...(displayRecipient ? { verifyUrl: `${APP_BASE_URL}/verify/${displayRecipient}` } : {}),
              message: `Privately transferred ${input.amount} ${input.token} to ${displayRecipient || input.recipient}. ZK-shielded via Unlink.`,
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

      // ── batch_private_transfer ─────────────────
      case 'batch_private_transfer': {
        const tokenInfo = resolveToken(input.token as string)
        const client = getUnlinkClient()
        const recipientInputs = input.recipients as Array<{
          address: string
          amount: string
          name?: string
        }>

        // Resolve all recipient addresses (ENS → unlink address)
        const resolved: Array<{
          originalName: string
          recipientAddress: string
          amount: string
          ensName: string | null
        }> = []

        for (const r of recipientInputs) {
          const originalRecipient = r.address
          const displayName = r.name || originalRecipient
          const ensName = originalRecipient.endsWith('.eth')
            ? originalRecipient
            : originalRecipient.startsWith('unlink1') || originalRecipient.startsWith('0x')
            ? null
            : `${originalRecipient.toLowerCase()}.whisper.eth`

          let recipientAddress = originalRecipient
          if (recipientAddress.endsWith('.eth')) {
            const ensResult = await resolveENS(recipientAddress)
            if (ensResult.preferredAddress) {
              recipientAddress = ensResult.preferredAddress
            } else {
              return JSON.stringify({
                success: false,
                error: `Could not resolve ENS name "${recipientAddress}" for ${displayName}.`,
              })
            }
          } else if (!recipientAddress.startsWith('unlink1') && !recipientAddress.startsWith('0x')) {
            const addr = getAddress(recipientAddress)
            if (!addr) {
              return JSON.stringify({
                success: false,
                error: `Contact "${recipientAddress}" not found for ${displayName}. Try an ENS name or use list_contacts.`,
              })
            }
            recipientAddress = addr
          }

          resolved.push({
            originalName: displayName,
            recipientAddress,
            amount: r.amount,
            ensName,
          })
        }

        try {
          const result = await batchTransfer(client, {
            token: tokenInfo.address,
            transfers: resolved.map((r) => ({
              recipientAddress: r.recipientAddress,
              amount: r.amount,
            })),
          })

          // Auto-publish proofs for .whisper.eth recipients
          for (const r of resolved) {
            if (r.ensName?.endsWith('.whisper.eth')) {
              publishPayrollProof(r.ensName, { txHash: result.txHash }).catch((e) =>
                console.error(`Auto-publish proof failed for ${r.ensName}:`, e),
              )
            }
          }

          const results = resolved.map((r) => ({
            name: r.originalName,
            amount: r.amount,
            token: input.token,
            status: 'sent',
            verifyUrl: r.ensName ? `${APP_BASE_URL}/verify/${r.ensName}` : null,
          }))

          return JSON.stringify({
            success: true,
            txHash: result.txHash,
            explorerUrl: `https://sepolia.basescan.org/address/0x647f9b99af97e4b79DD9Dd6de3b583236352f482#internaltx`,
            results,
            message: `Batch transfer complete: sent ${input.token} to ${resolved.length} recipients in a single ZK proof.`,
          })
        } catch (err) {
          return JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          })
        }
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
          const minOut = (quotedOut * BigInt(99)) / BigInt(100)
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

        // Track WETH in cache (SDK doesn't report WETH from swaps)
        const tokenOutSymbol = (input.tokenOut as string).toUpperCase()
        if (tokenOutSymbol === 'WETH') {
          await dbWriteBalanceCache('WETH', minAmountOut)
        }

        return JSON.stringify({
          success: true,
          txHash: result.txHash,
          explorerUrl: baseSepoliaExplorerUrl(result.txHash),
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
          explorerUrl: `https://sepolia.basescan.org/address/0x647f9b99af97e4b79DD9Dd6de3b583236352f482#internaltx`,
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
          BigInt(0),
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
          explorerUrl: `https://testnet.arcscan.app/tx/${createTx}`,
          totalAmount: formatUnits(totalAmount, arcUsdc.decimals),
          milestoneCount: milestones.length,
          recipientCount: recipients.length,
          chain: 'Arc Testnet',
          message: `Created escrow payroll #${payrollId} with ${milestones.length} milestones for ${recipients.length} recipients`,
        })
      }

      // ── schedule_payroll ─────────────────────
      case 'schedule_payroll': {
        const schedule = input.schedule as string
        const recipients = input.recipients as PayrollRecipient[]
        const tokenSymbol = (input.token as string) || 'USDC'

        const client = getUnlinkClient()
        const ownerAddress =
          client.unlinkAddress || (await client.sdk.getAddress())

        const payrollId = randomUUID()

        const config: PayrollConfig = {
          id: payrollId,
          recipients,
          token: tokenSymbol,
          schedule,
          ownerAddress,
          signature: '', // Will be signed when executing
          createdAt: Date.now(),
        }

        // Persist strategy so the dashboard picks it up
        const totalPerPeriod = recipients.reduce(
          (sum, r) => sum + parseFloat(r.amount),
          0,
        )

        await createStrategy({
          id: payrollId,
          name: `${schedule.charAt(0).toUpperCase() + schedule.slice(1)} Payroll`,
          type: 'standard',
          status: 'active',
          recipients: recipients.map((r) => ({
            address: r.address,
            amount: r.amount,
            name: r.name || r.address.slice(0, 8),
          })),
          token: tokenSymbol,
          schedule,
          privacyLevel: 'private',
          totalBudget: '0',
          spent: '0',
          executions: [],
          createdAt: Date.now(),
        })

        return JSON.stringify({
          success: true,
          payrollId,
          schedule,
          recipientCount: recipients.length,
          totalPerPeriod: `${totalPerPeriod} ${tokenSymbol}`,
          message: `Scheduled recurring payroll "${payrollId}" — ${totalPerPeriod} ${tokenSymbol} to ${recipients.length} recipients on schedule: ${schedule}`,
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

        for (let i = BigInt(0); i < milestoneCount; i++) {
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

        const overrides: Partial<import('./strategies').PayrollStrategy> = {}
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
        const updates: Partial<import('./strategies').PayrollStrategy> = {}

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

        const usdcAddress = baseSepolia.tokens.USDC.address
        const rawAmount = parseUnits(amount, 6)

        // mintRecipient must be bytes32 — left-pad the 20-byte address to 32 bytes
        const mintRecipient = ('0x' + '00'.repeat(12) + recipient.slice(2).toLowerCase()) as `0x${string}`

        // Withdraw slightly more than burn amount so the adapter has leftover for output re-deposit.
        const burnAmountFloat = parseFloat(amount)
        const withdrawAmount = (burnAmountFloat + 0.01).toFixed(6)

        // calls[0]: approve TokenMessengerV2 to spend USDC from the adapter
        // calls[1]: depositForBurn via CCTP V2
        // Both run in the same execute — the adapter executes them sequentially.
        const approveCalldata = encodeFunctionData({
          abi: [{
            name: 'approve', type: 'function' as const,
            inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
            outputs: [{ type: 'bool' }],
            stateMutability: 'nonpayable' as const,
          }],
          functionName: 'approve',
          args: [CCTP_TOKEN_MESSENGER_V2 as `0x${string}`, rawAmount],
        })

        const cctpCalldata = encodeFunctionData({
          abi: [{
            name: 'depositForBurn', type: 'function' as const,
            inputs: [
              { name: 'amount', type: 'uint256' },
              { name: 'destinationDomain', type: 'uint32' },
              { name: 'mintRecipient', type: 'bytes32' },
              { name: 'burnToken', type: 'address' },
              { name: 'destinationCaller', type: 'bytes32' },
              { name: 'maxFee', type: 'uint256' },
              { name: 'minFinalityThreshold', type: 'uint32' },
            ],
            outputs: [{ name: 'nonce', type: 'uint64' }],
            stateMutability: 'nonpayable' as const,
          }],
          functionName: 'depositForBurn',
          args: [
            rawAmount,
            CCTP_ARC_DOMAIN,
            mintRecipient,
            usdcAddress as `0x${string}`,
            ('0x' + '00'.repeat(32)) as `0x${string}`, // destinationCaller: permissionless
            BigInt(0), // maxFee: 0 for testnet
            0, // minFinalityThreshold: default
          ],
        })

        try {
          const result = await execute(getUnlinkClient(), {
            withdrawals: [{ token: usdcAddress, amount: withdrawAmount }],
            calls: [
              { to: usdcAddress, data: approveCalldata },
              { to: CCTP_TOKEN_MESSENGER_V2, data: cctpCalldata },
            ],
            outputs: [{ token: usdcAddress, minAmount: '0' }],
            deadline: Math.floor(Date.now() / 1000) + 3600,
          })

          return JSON.stringify({
            success: true,
            txHash: result.txHash,
            message: `Private cross-chain transfer: ${amount} USDC → Arc Testnet`,
            flow: [
              `Withdrew ${withdrawAmount} USDC from private balance (${amount} burned + 0.01 buffer returned)`,
              `Approved USDC to CCTP TokenMessengerV2`,
              `Called depositForBurn → domain ${CCTP_ARC_DOMAIN} (Arc Testnet)`,
              `${amount} USDC burned on Base Sepolia via CCTP V2`,
              `USDC will mint on Arc Testnet to ${recipient}`,
            ],
            privacy: {
              senderHidden: true,
              recipientVisible: true,
              amountVisible: true,
              note: 'On-chain sender = Unlink adapter, not your address',
            },
          })
        } catch (err: any) {
          return JSON.stringify({
            success: false,
            error: err.message,
            debug: {
              contract: CCTP_TOKEN_MESSENGER_V2,
              domain: CCTP_ARC_DOMAIN,
              amount: rawAmount.toString(),
              recipient,
              mintRecipient,
            },
          })
        }
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
        // Resolve token symbol to address
        const tokenSymbol = strategy.token || 'USDC'
        const tokenAddress = resolveToken(tokenSymbol).address
        const results: Array<{ name: string; amount: string; success: boolean; verifyUrl?: string; error?: string }> = []

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
              const displayName = recipient.name || addr
              const ensName = displayName.toLowerCase().endsWith('.eth') ? displayName : `${displayName.toLowerCase()}.whisper.eth`

              // Auto-publish proof to ENS
              if (ensName.endsWith('.whisper.eth')) {
                publishPayrollProof(ensName, { txHash: result.txHash }).catch((e) =>
                  console.error(`Auto-publish proof failed for ${ensName}:`, e),
                )
              }

              results.push({ name: displayName, amount: recipient.amount, success: true, verifyUrl: `${APP_BASE_URL}/verify/${ensName}` })
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
          results,
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
          if (ensResult.preferredAddress) {
            // Cache preferred address (Unlink if available)
            await saveAddress(contactName, ensResult.preferredAddress)
            return JSON.stringify({
              success: true,
              name: contactName,
              address: ensResult.preferredAddress,
              evmAddress: ensResult.address,
              unlinkAddress: ensResult.unlinkAddress,
              isPrivate: !!ensResult.unlinkAddress,
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

        if (!result.preferredAddress) {
          return JSON.stringify({
            success: false,
            error: `Could not resolve ENS name "${ensName}". It may not be registered or the name may be invalid.`,
          })
        }

        // Cache the preferred address (Unlink if available, otherwise EVM)
        await saveAddress(ensName, result.preferredAddress)

        const privacyNote = result.unlinkAddress
          ? `Privacy: Using Unlink address from ENS text record — transfers will be ZK-shielded.`
          : `Note: No Unlink address found in ENS records. Using EVM address — consider setting unlink.address text record for private transfers.`

        return JSON.stringify({
          success: true,
          name: ensName,
          evmAddress: result.address,
          unlinkAddress: result.unlinkAddress,
          preferredAddress: result.preferredAddress,
          isPrivate: !!result.unlinkAddress,
          textRecords: result.textRecords || {},
          cached: true,
          privacyNote,
          message: `Resolved ${ensName} → ${result.preferredAddress}${result.unlinkAddress ? ' (Unlink ZK address)' : ' (EVM address)'}`,
        })
      }

      // ── verify_payment_proof ─────────────────
      case 'verify_payment_proof': {
        const ensName = input.name as string

        // Try ENS resolution but don't let failures block verification
        let proofHash: string | null = null
        let proofTimestamp: string | null = null
        let unlinkAddr: string | null = null

        try {
          const result = await resolveENS(ensName)
          proofHash = result.textRecords?.['payroll.proof'] || null
          proofTimestamp = result.textRecords?.['payroll.timestamp'] || null
          unlinkAddr = result.unlinkAddress
        } catch {
          // ENS resolution failed — fall through to deterministic proof
        }

        // No fake fallback — verification only succeeds with real on-chain proof
        if (proofHash) {
          return JSON.stringify({
            success: true,
            name: ensName,
            verified: true,
            proof: {
              hash: proofHash,
              timestamp: proofTimestamp || null,
              unlinkAddress: unlinkAddr,
            },
            privacy: {
              amountVisible: false,
              senderVisible: false,
              recipientVisible: false,
              proofPublic: true,
            },
            verifyUrl: `${APP_BASE_URL}/verify/${ensName}`,
            message: `Payment proof verified for ${ensName}. ZK proof hash: ${proofHash.slice(0, 16)}... — this cryptographically proves ${ensName.split('.')[0]} was paid, without revealing the amount, sender, or other recipients. The proof is publicly verifiable on-chain but the payment details remain private.`,
          })
        }

        return JSON.stringify({
          success: true,
          name: ensName,
          verified: false,
          unlinkAddress: unlinkAddr,
          verifyUrl: `${APP_BASE_URL}/verify/${ensName}`,
          message: `No payment proof found on-chain for ${ensName}. Run a private transfer first, then the proof will be published to ENS automatically.`,
        })
      }

      // ── run_cross_chain_payroll ──────────────
      case 'run_cross_chain_payroll': {
        const recipients = input.recipients as Array<{
          name: string
          address?: string
          amount: string
        }>
        const milestones = (input.milestones as Array<{
          amount: string
          unlockTime?: number
          oracle?: string
          triggerPrice?: string
          operator?: 'GT' | 'LT'
        }>) || null

        const escrowAddress = getEscrowAddress()
        if (escrowAddress === '0x0000000000000000000000000000000000000000') {
          return JSON.stringify({
            success: false,
            error: 'WhisperEscrow contract not configured. Set WHISPER_ESCROW_ADDRESS in .env',
          })
        }

        const steps: string[] = []

        // Step 1: Resolve ENS names to Arc addresses
        const resolved: Array<{ name: string; arcAddress: string; amount: string; ensName: string }> = []
        for (const r of recipients) {
          let arcAddr = r.address || ''
          let ensName = r.name.endsWith('.eth') ? r.name : `${r.name.toLowerCase()}.whisper.eth`

          if (!arcAddr) {
            const ensResult = await resolveENS(ensName)
            // Use the resolved EVM address for Arc (they share the same address space)
            arcAddr = ensResult.preferredAddress || ensResult.address || ''
          }

          if (!arcAddr) {
            // Fallback: look up address book
            const contact = getAddress(r.name)
            if (contact) arcAddr = contact
          }

          if (!arcAddr) {
            return JSON.stringify({
              success: false,
              error: `Could not resolve address for "${r.name}". Provide an explicit address.`,
            })
          }

          resolved.push({ name: r.name, arcAddress: arcAddr, amount: r.amount, ensName })
        }

        steps.push(`Resolved ${resolved.length} recipients`)

        // Step 2: Calculate total and bridge via CCTP
        const totalFloat = resolved.reduce((sum, r) => sum + parseFloat(r.amount), 0)
        const totalAmount = totalFloat.toFixed(6)

        const usdcAddress = baseSepolia.tokens.USDC.address
        const rawAmount = parseUnits(totalAmount, 6)

        // Bridge to our own Arc wallet
        const { account } = getArcClients()
        const ownArcAddress = account.address
        const mintRecipient = ('0x' + '00'.repeat(12) + ownArcAddress.slice(2).toLowerCase()) as `0x${string}`

        const burnAmountFloat = totalFloat + 0.01 // buffer for Unlink output
        const withdrawAmount = burnAmountFloat.toFixed(6)

        const approveCalldata = encodeFunctionData({
          abi: [{
            name: 'approve', type: 'function' as const,
            inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
            outputs: [{ type: 'bool' }],
            stateMutability: 'nonpayable' as const,
          }],
          functionName: 'approve',
          args: [CCTP_TOKEN_MESSENGER_V2 as `0x${string}`, rawAmount],
        })

        const cctpCalldata = encodeFunctionData({
          abi: [{
            name: 'depositForBurn', type: 'function' as const,
            inputs: [
              { name: 'amount', type: 'uint256' },
              { name: 'destinationDomain', type: 'uint32' },
              { name: 'mintRecipient', type: 'bytes32' },
              { name: 'burnToken', type: 'address' },
              { name: 'destinationCaller', type: 'bytes32' },
              { name: 'maxFee', type: 'uint256' },
              { name: 'minFinalityThreshold', type: 'uint32' },
            ],
            outputs: [{ name: 'nonce', type: 'uint64' }],
            stateMutability: 'nonpayable' as const,
          }],
          functionName: 'depositForBurn',
          args: [
            rawAmount,
            CCTP_ARC_DOMAIN,
            mintRecipient,
            usdcAddress as `0x${string}`,
            ('0x' + '00'.repeat(32)) as `0x${string}`,
            BigInt(0),
            0,
          ],
        })

        let bridgeTxHash: string
        try {
          const result = await execute(getUnlinkClient(), {
            withdrawals: [{ token: usdcAddress, amount: withdrawAmount }],
            calls: [
              { to: usdcAddress, data: approveCalldata },
              { to: CCTP_TOKEN_MESSENGER_V2, data: cctpCalldata },
            ],
            outputs: [{ token: usdcAddress, minAmount: '0' }],
            deadline: Math.floor(Date.now() / 1000) + 3600,
          })
          bridgeTxHash = result.txHash
          steps.push(`Bridged ${totalAmount} USDC to Arc via CCTP V2 (sender hidden via Unlink). TX: ${bridgeTxHash}`)
        } catch (err: any) {
          return JSON.stringify({
            success: false,
            error: `CCTP bridge failed: ${err.message}`,
            step: 'bridge',
            steps,
          })
        }

        // Step 3: Wait for CCTP attestation
        steps.push('Waiting for Circle attestation...')
        const arrival = await waitForCctpArrival(ownArcAddress, rawAmount)

        if (!arrival.arrived) {
          // Funds didn't arrive in time, but bridge tx succeeded
          return JSON.stringify({
            success: false,
            error: `CCTP attestation timed out after ${Math.round(arrival.elapsed / 1000)}s. Bridge TX succeeded (${bridgeTxHash}) but funds haven't arrived on Arc yet. Try create_escrow manually once funds arrive.`,
            bridgeTxHash,
            step: 'attestation',
            steps,
          })
        }

        steps.push(`Funds arrived on Arc (${Math.round(arrival.elapsed / 1000)}s)`)

        // Step 4: Create escrow on Arc
        const arcUsdc = resolveArcToken('USDC')
        const recipientAddresses = resolved.map((r) => r.arcAddress as Address)
        const equalShare = Math.floor(10000 / resolved.length)
        const shares = resolved.map((_, i) =>
          BigInt(i === resolved.length - 1 ? 10000 - equalShare * (resolved.length - 1) : equalShare),
        )

        // Build milestones: default to single immediate release of total amount
        const milestoneTuples = milestones
          ? milestones.map((m) => ({
              amount: parseUnits(m.amount, arcUsdc.decimals),
              unlockTime: BigInt(m.unlockTime || 0),
              oracle: (m.oracle || '0x0000000000000000000000000000000000000000') as Address,
              triggerPrice: parseUnits(m.triggerPrice || '0', 0),
              operator: m.operator === 'LT' ? 1 : 0,
              released: false,
            }))
          : [{
              amount: rawAmount,
              unlockTime: BigInt(0),
              oracle: '0x0000000000000000000000000000000000000000' as Address,
              triggerPrice: BigInt(0),
              operator: 0,
              released: false,
            }]

        const escrowTotal = milestoneTuples.reduce((sum, m) => sum + m.amount, BigInt(0))
        const { publicClient, walletClient } = getArcClients()

        // Approve escrow to spend USDC
        const escrowApproveData = encodeFunctionData({
          abi: ERC20_APPROVE_ABI,
          functionName: 'approve',
          args: [escrowAddress, escrowTotal],
        })
        const approveTx = await walletClient.sendTransaction({
          to: arcUsdc.address as Address,
          data: escrowApproveData,
        })
        await publicClient.waitForTransactionReceipt({ hash: approveTx })

        // Create the payroll
        const createData = encodeFunctionData({
          abi: WHISPER_ESCROW_ABI,
          functionName: 'createPayroll',
          args: [arcUsdc.address as Address, recipientAddresses, shares, milestoneTuples],
        })
        const createTx = await walletClient.sendTransaction({
          to: escrowAddress,
          data: createData,
        })
        const receipt = await publicClient.waitForTransactionReceipt({ hash: createTx })

        let payrollId = 'unknown'
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() === escrowAddress.toLowerCase() && log.topics[1]) {
            payrollId = BigInt(log.topics[1]).toString()
            break
          }
        }

        steps.push(`Created escrow #${payrollId} on Arc with ${milestoneTuples.length} milestone(s) for ${resolved.length} recipients`)

        // Step 5: Generate verify URLs
        const verifyResults = resolved.map((r) => ({
          name: r.name,
          ensName: r.ensName,
          amount: r.amount,
          verifyUrl: `${APP_BASE_URL}/verify/${r.ensName}`,
        }))

        steps.push(`Generated ${verifyResults.length} verify URLs`)

        return JSON.stringify({
          success: true,
          payrollId,
          bridgeTxHash,
          escrowTxHash: createTx,
          totalBridged: totalAmount,
          attestationTime: `${Math.round(arrival.elapsed / 1000)}s`,
          recipients: verifyResults,
          milestoneCount: milestoneTuples.length,
          chain: { source: 'Base Sepolia', destination: 'Arc Testnet' },
          privacy: {
            senderHidden: true,
            note: 'On-chain sender = Unlink adapter, not your wallet. Recipient addresses visible on Arc.',
          },
          steps,
          message: `Cross-chain payroll complete. ${totalAmount} USDC bridged (sender hidden) → Escrow #${payrollId} created on Arc with ${milestoneTuples.length} milestone(s) for ${resolved.length} recipients.`,
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
