/**
 * Unlink SDK wrapper for Whisper — private AI treasury agent.
 *
 * Wraps @unlink-xyz/sdk to provide high-level helpers for:
 *   deposit, transfer, batchTransfer, execute, withdraw, getBalances, getTransactions
 *
 * The SDK uses a two-tier design:
 *   - createUnlink()       → high-level UnlinkClient (deposit/transfer/withdraw/balances)
 *   - createUnlinkClient() → low-level openapi-fetch client (needed for execute)
 */

import {
  createUnlink,
  createUnlinkClient,
  unlinkAccount,
  unlinkEvm,
  eddsaSign,
  fromDecimal,
  type UnlinkClient as SDKUnlinkClient,
} from '@unlink-xyz/sdk'
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  encodeFunctionData,
  type Address,
} from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import { baseSepolia as viemBaseSepolia } from 'viem/chains'
import {
  UNLINK_API_BASE,
  UNLINK_POOL,
  UNLINK_ADAPTER,
  baseSepolia,
  getEnvOrThrow,
} from './config.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENVIRONMENT = 'base-sepolia'

// Uniswap V3 SwapRouter02 on Base Sepolia
const UNISWAP_V3_ROUTER = '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4'

// Standard ERC-20 ABI fragments we need
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

// Uniswap V3 exactInputSingle ABI
const UNISWAP_EXACT_INPUT_SINGLE_ABI = [
  {
    name: 'exactInputSingle',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
] as const

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface UnlinkClient {
  /** High-level SDK client */
  sdk: SDKUnlinkClient
  /** Low-level openapi-fetch client (needed for execute) */
  api: ReturnType<typeof createUnlinkClient>
  /** Derived unlink1… address for this mnemonic */
  unlinkAddress: string
  /** EVM address derived from mnemonic */
  evmAddress: string
  /** Account keys for EdDSA signing (lazy-resolved on first use) */
  _keysPromise: Promise<{ spendingPrivateKey: bigint; address: string }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve token decimals from config or fall back to 18. */
function getDecimals(tokenAddress: string): number {
  const lc = tokenAddress.toLowerCase()
  for (const token of Object.values(baseSepolia.tokens)) {
    if (token.address.toLowerCase() === lc) return token.decimals
  }
  return 18
}

/** Convert human-readable amount ("100") to raw uint256 string. */
function toRawAmount(amount: string, tokenAddress: string): string {
  const decimals = getDecimals(tokenAddress)
  return parseUnits(amount, decimals).toString()
}

/** Poll until the transaction reaches a terminal status or timeout. */
async function pollUntilRelayed(
  sdk: SDKUnlinkClient,
  txId: string,
  timeoutMs = 180_000,
): Promise<string> {
  const TERMINAL = new Set(['relayed', 'processed', 'failed'])
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const result = await sdk.pollTransactionStatus(txId, {
      intervalMs: 3_000,
      timeoutMs: timeoutMs - (Date.now() - start),
    })
    if (TERMINAL.has(result.status)) {
      if (result.status === 'failed') {
        const err = new Error(`Unlink transaction ${txId} failed on-chain`)
        ;(err as any).txResult = result
        throw err
      }
      return txId
    }
    // pollTransactionStatus itself polls internally; if we're here the
    // timeout was hit from its side — break out
    break
  }
  throw new Error(`Unlink transaction ${txId} timed out waiting for relay`)
}

// ---------------------------------------------------------------------------
// createUnlinkClient (our wrapper factory — NOT the SDK's raw one)
// ---------------------------------------------------------------------------

/**
 * Create a fully configured Unlink client.
 *
 * @param mnemonic  BIP-39 mnemonic for both the EVM signer and the Unlink account
 * @param rpcUrl    RPC URL for Base Sepolia
 */
export function createUnlinkClientWrapper(
  mnemonic: string,
  rpcUrl: string,
): UnlinkClient {
  const apiKey = (() => {
    try {
      return getEnvOrThrow('UNLINK_API_KEY')
    } catch {
      // During development without a key, return empty — SDK will 401
      return ''
    }
  })()

  // --- viem clients ---
  const evmAccount = mnemonicToAccount(mnemonic)
  const evmAddress = evmAccount.address

  const walletClient = createWalletClient({
    account: evmAccount,
    chain: viemBaseSepolia,
    transport: http(rpcUrl),
  })

  const publicClient = createPublicClient({
    chain: viemBaseSepolia,
    transport: http(rpcUrl),
  })

  // --- Unlink account from same mnemonic ---
  const unlinkAccountProvider = unlinkAccount.fromMnemonic({ mnemonic })

  // --- Low-level API client (openapi-fetch) ---
  const api = createUnlinkClient(UNLINK_API_BASE, apiKey)

  // --- High-level SDK client ---
  const sdk = createUnlink({
    engineUrl: UNLINK_API_BASE,
    apiKey,
    account: unlinkAccountProvider,
    evm: unlinkEvm.fromViem({ walletClient, publicClient }),
  })

  // Resolve the unlink address once (async, cached)
  const unlinkAddressPromise = sdk.getAddress()

  // Resolve account keys for manual EdDSA signing (used in execute)
  const _keysPromise = unlinkAccountProvider.getAccountKeys().then((keys) => ({
    spendingPrivateKey: keys.spendingPrivateKey,
    address: keys.address,
  }))

  // We can't make createUnlinkClientWrapper async so we store a promise and
  // set unlinkAddress lazily. For callers that need the address synchronously
  // (very rare), they should await client.sdk.getAddress() themselves.
  const client: UnlinkClient = {
    sdk,
    api,
    unlinkAddress: '', // populated below via then()
    evmAddress,
    _keysPromise,
  }

  unlinkAddressPromise.then((addr) => {
    client.unlinkAddress = addr
  })

  return client
}

// ---------------------------------------------------------------------------
// deposit
// ---------------------------------------------------------------------------

/**
 * Deposit ERC-20 tokens from the EVM wallet into the private Unlink balance.
 *
 * Before depositing, this ensures the Permit2 contract has sufficient allowance.
 *
 * @param client  Unlink client from createUnlinkClientWrapper
 * @param params.token   ERC-20 token address
 * @param params.amount  Human-readable amount, e.g. "100" for 100 USDC
 */
export async function deposit(
  client: UnlinkClient,
  params: { token: string; amount: string },
): Promise<{ txHash: string }> {
  try {
    const rawAmount = toRawAmount(params.amount, params.token)

    // Ensure ERC-20 → Permit2 approval is in place
    try {
      const approval = await client.sdk.ensureErc20Approval({
        token: params.token,
        amount: rawAmount,
      })
      // If a new approval tx was submitted, it will be confirmed by the wallet
      // client automatically (viem sends and waits). We just log it.
      if (approval.status === 'submitted') {
        console.log(`[unlink] ERC-20 approval submitted: ${approval.txHash}`)
      }
    } catch (approvalErr) {
      console.warn('[unlink] Could not check ERC-20 approval:', approvalErr)
    }

    const result = await client.sdk.deposit({
      token: params.token,
      amount: rawAmount,
    })

    // Poll until the deposit is relayed/processed
    await pollUntilRelayed(client.sdk, result.txId)

    return { txHash: result.txId }
  } catch (err) {
    throw new Error(
      `[unlink] deposit failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

// ---------------------------------------------------------------------------
// transfer
// ---------------------------------------------------------------------------

/**
 * Private transfer to a single recipient.
 *
 * @param client  Unlink client
 * @param params.token            ERC-20 token address
 * @param params.recipientAddress Recipient's unlink1… address
 * @param params.amount           Human-readable amount
 */
export async function transfer(
  client: UnlinkClient,
  params: { token: string; recipientAddress: string; amount: string; skipPolling?: boolean },
): Promise<{ txHash: string; status: 'relayed' | 'submitted' }> {
  try {
    const rawAmount = toRawAmount(params.amount, params.token)

    const result = await client.sdk.transfer({
      token: params.token,
      amount: rawAmount,
      recipientAddress: params.recipientAddress,
    })

    if (params.skipPolling) {
      // Return immediately after submission — caller handles confirmation
      return { txHash: result.txId, status: 'submitted' }
    }

    await pollUntilRelayed(client.sdk, result.txId)
    return { txHash: result.txId, status: 'relayed' }
  } catch (err) {
    throw new Error(
      `[unlink] transfer failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

// ---------------------------------------------------------------------------
// batchTransfer
// ---------------------------------------------------------------------------

/**
 * Batch private transfer — multiple recipients in a single ZK proof.
 *
 * @param client  Unlink client
 * @param params.token     ERC-20 token address (same for all recipients)
 * @param params.transfers Array of { recipientAddress, amount }
 */
export async function batchTransfer(
  client: UnlinkClient,
  params: {
    token: string
    transfers: Array<{ recipientAddress: string; amount: string }>
  },
): Promise<{ txHash: string }> {
  try {
    // Build the multi-transfer param format the SDK expects
    const transfers = params.transfers.map((t) => ({
      recipientAddress: t.recipientAddress,
      amount: toRawAmount(t.amount, params.token),
    }))

    const result = await client.sdk.transfer({
      token: params.token,
      transfers,
    })

    await pollUntilRelayed(client.sdk, result.txId)
    return { txHash: result.txId }
  } catch (err) {
    throw new Error(
      `[unlink] batchTransfer failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

// ---------------------------------------------------------------------------
// execute (THE KEY INTEGRATION — calls external contracts from private balance)
// ---------------------------------------------------------------------------

/**
 * Execute arbitrary external calls (e.g. Uniswap swaps) funded from the
 * private Unlink balance.  This is how we call DeFi protocols privately.
 *
 * Flow:
 *   1. POST /transactions/prepare/execute → {tx_id, signing_request}
 *   2. EdDSA-sign the message_hash with the spending key
 *   3. POST /transactions/{tx_id}/submit → accepted
 *   4. Poll until relayed
 *
 * @param client  Unlink client
 * @param params.withdrawals  Tokens to pull from private balance
 * @param params.calls        Calldata to execute on-chain (e.g. Uniswap router)
 * @param params.outputs      Expected output tokens re-deposited to private balance
 * @param params.deadline     Unix timestamp after which the tx reverts
 */
export async function execute(
  client: UnlinkClient,
  params: {
    withdrawals: Array<{ token: string; amount: string }>
    calls: Array<{ to: string; data: string; value?: string }>
    outputs: Array<{ token: string; minAmount: string }>
    deadline: number
  },
): Promise<{ txHash: string }> {
  try {
    // Resolve the unlink address if not yet populated
    const unlinkAddress =
      client.unlinkAddress || (await client.sdk.getAddress())

    // Resolve account keys for signing
    const keys = await client._keysPromise

    // Build raw-amount withdrawals
    const withdrawals = params.withdrawals.map((w) => ({
      token: w.token as Address,
      amount: toRawAmount(w.amount, w.token),
    }))

    // Build calls — value defaults to "0"
    const calls = params.calls.map((c) => ({
      to: c.to as Address,
      data: c.data,
      value: c.value ?? '0',
    }))

    // Build outputs. The API requires npk and recipient_address.
    // The backend resolves the actual npk from the unlinkAddress provided above,
    // so we pass "0" as a placeholder — it is overridden server-side.
    const outputs = params.outputs.map((o) => ({
      npk: '0', // backend resolves from unlinkAddress
      token: o.token as Address,
      min_amount: toRawAmount(o.minAmount, o.token),
      recipient_address: (o as { recipientAddress?: string }).recipientAddress || unlinkAddress,
    }))

    // Step 1: Prepare execute via low-level API client
    const prepareResp = await client.api.POST('/transactions/prepare/execute', {
      body: {
        unlink_address: unlinkAddress,
        environment: ENVIRONMENT,
        withdrawals,
        calls,
        outputs,
        deadline: params.deadline,
      },
    })

    if (!prepareResp.data) {
      const errMsg =
        prepareResp.error &&
        typeof prepareResp.error === 'object' &&
        'error' in prepareResp.error
          ? (prepareResp.error as { error: { message: string } }).error.message
          : JSON.stringify(prepareResp.error)
      throw new Error(`prepare execute failed: ${errMsg}`)
    }

    const { tx_id, signing_request } = prepareResp.data.data
    const messageHash = fromDecimal(signing_request.message_hash)

    // Step 2: EdDSA-sign the message hash with spending key
    const signature = await eddsaSign(keys.spendingPrivateKey, messageHash)

    // Step 3: Submit signature
    const submitResp = await client.api.POST('/transactions/{tx_id}/submit', {
      params: { path: { tx_id } },
      body: {
        signature: [
          signature.R8[0].toString(),
          signature.R8[1].toString(),
          signature.S.toString(),
        ],
      },
    })

    if (!submitResp.data) {
      const errMsg =
        submitResp.error &&
        typeof submitResp.error === 'object' &&
        'error' in submitResp.error
          ? (submitResp.error as { error: { message: string } }).error.message
          : JSON.stringify(submitResp.error)
      throw new Error(`submit execute failed: ${errMsg}`)
    }

    // Step 4: Poll until relayed
    await pollUntilRelayed(client.sdk, tx_id)
    return { txHash: tx_id }
  } catch (err) {
    throw new Error(
      `[unlink] execute failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

// ---------------------------------------------------------------------------
// withdraw
// ---------------------------------------------------------------------------

/**
 * Withdraw tokens from private balance to a public EVM address.
 *
 * @param client  Unlink client
 * @param params.token            ERC-20 token address
 * @param params.amount           Human-readable amount
 * @param params.recipientAddress Destination 0x… EVM address
 */
export async function withdraw(
  client: UnlinkClient,
  params: { token: string; amount: string; recipientAddress: string },
): Promise<{ txHash: string }> {
  try {
    const rawAmount = toRawAmount(params.amount, params.token)

    const result = await client.sdk.withdraw({
      token: params.token,
      amount: rawAmount,
      recipientEvmAddress: params.recipientAddress,
    })

    await pollUntilRelayed(client.sdk, result.txId)
    return { txHash: result.txId }
  } catch (err) {
    throw new Error(
      `[unlink] withdraw failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

// ---------------------------------------------------------------------------
// getBalances
// ---------------------------------------------------------------------------

/**
 * Get private token balances for the current Unlink account.
 *
 * Returns human-readable balance strings alongside token address and symbol.
 */
export async function getBalances(
  client: UnlinkClient,
): Promise<Array<{ token: string; symbol: string; balance: string }>> {
  try {
    const data = await client.sdk.getBalances()

    return data.balances.map((b) => {
      const tokenAddress = b.token.toLowerCase()
      // Find symbol from config
      const configEntry = Object.values(baseSepolia.tokens).find(
        (t) => t.address.toLowerCase() === tokenAddress,
      )
      const symbol = configEntry?.symbol ?? 'UNKNOWN'
      const decimals = configEntry?.decimals ?? 18

      // Convert raw amount to human-readable
      const raw = BigInt(b.amount)
      const divisor = BigInt(10 ** decimals)
      const whole = raw / divisor
      const frac = raw % divisor
      const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
      const balance = fracStr ? `${whole}.${fracStr}` : whole.toString()

      return { token: b.token, symbol, balance }
    })
  } catch (err) {
    throw new Error(
      `[unlink] getBalances failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

// ---------------------------------------------------------------------------
// getTransactions
// ---------------------------------------------------------------------------

/**
 * Get transaction history for the current Unlink account.
 */
export async function getTransactions(
  client: UnlinkClient,
): Promise<
  Array<{
    type: string
    amount: string
    token: string
    txHash: string
    timestamp: number
  }>
> {
  try {
    const data = await client.sdk.getTransactions({ environment: ENVIRONMENT })

    return data.transactions.map((tx) => ({
      type: tx.type,
      amount: '', // raw transaction records don't include amount at this level
      token: '',
      txHash: tx.tx_hash ?? tx.id,
      timestamp: new Date(tx.created_at).getTime(),
    }))
  } catch (err) {
    throw new Error(
      `[unlink] getTransactions failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

// ---------------------------------------------------------------------------
// buildUniswapExecuteCall — helper to build execute() calldata for Uniswap
// ---------------------------------------------------------------------------

/**
 * Build approve + exactInputSingle calldata for use in execute().
 *
 * The two calls should be passed to execute() in order:
 *   1. approveCall — approve the Uniswap router to spend tokenIn
 *   2. swapCall    — call exactInputSingle on the router
 *
 * @param params.tokenIn      Input token address
 * @param params.tokenOut     Output token address
 * @param params.amount       Human-readable input amount (e.g. "100")
 * @param params.minAmountOut Human-readable minimum output amount (slippage)
 * @param params.router       Uniswap V3 router address (defaults to Base Sepolia router)
 * @returns { approveCall, swapCall } — pass both to execute().calls in order
 */
export function buildUniswapExecuteCall(params: {
  tokenIn: string
  tokenOut: string
  amount: string
  minAmountOut: string
  router?: string
}): {
  approveCall: { to: string; data: string }
  swapCall: { to: string; data: string }
} {
  const router = params.router ?? UNISWAP_V3_ROUTER
  const decimalsIn = getDecimals(params.tokenIn)
  const decimalsOut = getDecimals(params.tokenOut)

  const amountIn = parseUnits(params.amount, decimalsIn)
  const amountOutMinimum = parseUnits(params.minAmountOut, decimalsOut)

  // approve(router, amountIn)
  const approveData = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [router as Address, amountIn],
  })

  // exactInputSingle — pool fee tier 3000 (0.3%), no price limit
  const swapData = encodeFunctionData({
    abi: UNISWAP_EXACT_INPUT_SINGLE_ABI,
    functionName: 'exactInputSingle',
    args: [
      {
        tokenIn: params.tokenIn as Address,
        tokenOut: params.tokenOut as Address,
        fee: 3000,
        recipient: UNLINK_ADAPTER as Address, // outputs go to the adapter for re-deposit
        amountIn,
        amountOutMinimum,
        sqrtPriceLimitX96: BigInt(0),
      },
    ],
  })

  return {
    approveCall: { to: params.tokenIn, data: approveData },
    swapCall: { to: router, data: swapData },
  }
}

// ---------------------------------------------------------------------------
// Re-export SDK primitives for callers that need them
// ---------------------------------------------------------------------------

export { unlinkAccount, unlinkEvm, ENVIRONMENT, UNLINK_POOL }
