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

        const result = await transfer(client, {
          token: tokenInfo.address,
          recipientAddress: input.recipient as string,
          amount: input.amount as string,
        })

        return JSON.stringify({
          success: true,
          txHash: result.txHash,
          recipient: input.recipient,
          amount: input.amount,
          token: input.token,
          message: `Privately transferred ${input.amount} ${input.token} to ${input.recipient}`,
        })
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
