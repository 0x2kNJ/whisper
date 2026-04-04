/**
 * Uniswap Trading API wrapper for Whisper treasury agent.
 * Base URL: https://trade-api.gateway.uniswap.org/v1
 * Docs: https://docs.uniswap.org/contracts/v4/concepts/trading-api
 */

import { UNISWAP_API_BASE, getEnvOrThrow } from './config.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TradeType = 'EXACT_INPUT' | 'EXACT_OUTPUT'

/** Routing strategies returned by the quote endpoint. */
export type RoutingType =
  | 'CLASSIC'
  | 'DUTCH_V2'
  | 'DUTCH_V3'
  | 'PRIORITY'
  | 'UNISWAPX_V2'
  | 'UNISWAPX_V3'

/** UniswapX order types that require POST /v1/order instead of POST /v1/swap. */
const UNISWAPX_ROUTING_TYPES: RoutingType[] = ['DUTCH_V2', 'DUTCH_V3', 'PRIORITY']

// -- Quote ------------------------------------------------------------------

export interface QuoteParams {
  /** Input token contract address. */
  tokenIn: string
  /** Output token contract address. */
  tokenOut: string
  /** Raw token amount in base units (wei / atomic units). */
  amount: string
  /** Chain ID — 84532 for Base Sepolia. */
  chainId: number
  /** Wallet address that will execute the swap. */
  swapper: string
  /** Whether `amount` refers to the input or output token. */
  type: TradeType
  /**
   * Allowed slippage expressed as a percentage, e.g. 0.5 means 0.5%.
   * Defaults to 0.5 when omitted.
   */
  slippageTolerance?: number
  /**
   * Routing protocols to consider.
   * Defaults to all protocols when omitted.
   */
  protocols?: string[]
}

export interface QuoteResponse {
  /** Routing strategy selected by the API. */
  routing: RoutingType
  /** Core quote data returned by the API. */
  quote: {
    amountIn: string
    amountOut: string
    priceImpact?: string
    route?: unknown
    [key: string]: unknown
  }
  /** EIP-2612 permit data required for gasless approvals (may be absent). */
  permitData?: unknown
  /** Estimated gas fee for the swap. */
  gasFee?: string
  /** Raw API response fields, kept for pass-through to swap/order endpoints. */
  [key: string]: unknown
}

// -- Swap -------------------------------------------------------------------

export interface SwapParams {
  /** Full quote object returned by `getQuote`. */
  quote: QuoteResponse
  /** EIP-712 signature over `permitData` (required for permit-based approvals). */
  signature?: string
  /** Permit data from the quote (forwarded verbatim). */
  permitData?: unknown
}

export interface SwapResponse {
  /** Submitted transaction hash. */
  txHash?: string
  /** Transaction calldata (returned when broadcast is deferred to the client). */
  data?: string
  /** Target contract address for the transaction. */
  to?: string
  /** ETH value to attach. */
  value?: string
  /** Raw API response fields. */
  [key: string]: unknown
}

// -- Order (UniswapX) -------------------------------------------------------

export interface OrderParams {
  /** Full quote object returned by `getQuote`. */
  quote: QuoteResponse
  /** EIP-712 signature over the UniswapX order. Required. */
  signature: string
  /** Permit data from the quote (forwarded verbatim). Required. */
  permitData: unknown
}

export interface OrderResponse {
  /** UniswapX order hash. */
  hash?: string
  /** Order status immediately after submission. */
  orderStatus?: string
  /** Raw API response fields. */
  [key: string]: unknown
}

// -- Approval ---------------------------------------------------------------

export interface ApprovalParams {
  /** Token contract address to check. */
  token: string
  /** Required spend amount in base units. */
  amount: string
  /** Chain ID for the check. */
  chainId: number
  /** Wallet address that needs the allowance. */
  walletAddress: string
}

export interface ApprovalResponse {
  /** Whether approval is needed before the swap can proceed. */
  approvalNeeded: boolean
  /** Spender contract address that should be approved. */
  spender?: string
  /** Calldata for submitting the approval transaction, if needed. */
  approvalTx?: {
    to: string
    data: string
    value?: string
  }
  /** Raw API response fields. */
  [key: string]: unknown
}

// -- Status -----------------------------------------------------------------

export interface SwapStatus {
  /** One of: PENDING, CONFIRMED, FAILED, NOT_FOUND */
  status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'NOT_FOUND' | string
  /** Block number the transaction was included in (if confirmed). */
  blockNumber?: number
  /** Unix timestamp of confirmation (if confirmed). */
  timestamp?: number
  /** Raw API response fields. */
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Sends an authenticated request to the Uniswap Trading API.
 * Throws a descriptive error on non-2xx responses.
 */
async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const apiKey = getEnvOrThrow('UNISWAP_API_KEY')
  const url = `${UNISWAP_API_BASE}${path}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      ...(options.headers ?? {}),
    },
  })

  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      detail = JSON.stringify(body)
    } catch {
      detail = await response.text().catch(() => '')
    }
    throw new Error(
      `Uniswap API error ${response.status} ${response.statusText} at ${path}: ${detail}`,
    )
  }

  return response.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Request a swap quote from the Uniswap Trading API.
 *
 * @example
 * const q = await getQuote({
 *   tokenIn: '0x4200...0006',   // WETH on Base Sepolia
 *   tokenOut: '0x036C...dCF7e', // USDC on Base Sepolia
 *   amount: '1000000000000000', // 0.001 ETH
 *   chainId: 84532,
 *   swapper: '0xYourWallet',
 *   type: 'EXACT_INPUT',
 * })
 */
export async function getQuote(params: QuoteParams): Promise<QuoteResponse> {
  // Try the Trading API first
  try {
    const body: Record<string, unknown> = {
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amount: params.amount,
      tokenInChainId: params.chainId,
      tokenOutChainId: params.chainId,
      swapper: params.swapper,
      type: params.type,
      slippageTolerance: params.slippageTolerance ?? 0.5,
    }

    if (params.protocols && params.protocols.length > 0) {
      body.protocols = params.protocols
    }

    return await apiRequest<QuoteResponse>('/quote', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  } catch {
    // Trading API doesn't support testnets — fall back to on-chain pool quote
    return getOnChainQuote(params)
  }
}

/**
 * On-chain quote fallback for testnets where the Trading API is unavailable.
 * Reads Uniswap V3 pool's slot0 for sqrtPriceX96 and computes output amount.
 */
async function getOnChainQuote(params: QuoteParams): Promise<QuoteResponse> {
  const { createPublicClient, http } = await import('viem')
  const { baseSepolia: viemBaseSepolia } = await import('viem/chains')

  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || ''
  const client = createPublicClient({ chain: viemBaseSepolia, transport: http(rpcUrl) })

  // Known USDC/WETH pool on Base Sepolia (0.3% fee tier)
  const POOL = '0x46880b404CD35c165EDdefF7421019F8dD25F4Ad' as `0x${string}`

  try {
    const slot0 = await client.readContract({
      address: POOL,
      abi: [{ name: 'slot0', type: 'function', stateMutability: 'view', inputs: [], outputs: [
        {name:'sqrtPriceX96',type:'uint160'},{name:'tick',type:'int24'},{name:'observationIndex',type:'uint16'},
        {name:'observationCardinality',type:'uint16'},{name:'observationCardinalityNext',type:'uint16'},
        {name:'feeProtocol',type:'uint8'},{name:'unlocked',type:'bool'}
      ]}],
      functionName: 'slot0',
    })

    const sqrtPriceX96 = (slot0 as unknown as [bigint])[0]
    const amountIn = BigInt(params.amount)

    // Determine token order — pool's token0 is the lower address
    const tokenInLower = params.tokenIn.toLowerCase()
    const tokenOutLower = params.tokenOut.toLowerCase()
    const token0 = tokenInLower < tokenOutLower ? tokenInLower : tokenOutLower
    const isToken0In = tokenInLower === token0

    // Compute output from sqrtPriceX96
    // price = (sqrtPriceX96 / 2^96)^2 = token1/token0
    // If selling token0: amountOut = amountIn * price (adjusted for decimals)
    // If selling token1: amountOut = amountIn / price (adjusted for decimals)
    let amountOut: bigint
    if (isToken0In) {
      // Selling token0 (USDC), getting token1 (WETH)
      // amountOut = amountIn * sqrtPriceX96^2 / 2^192
      amountOut = (amountIn * sqrtPriceX96 * sqrtPriceX96) / (1n << 192n)
    } else {
      // Selling token1 (WETH), getting token0 (USDC)
      // amountOut = amountIn * 2^192 / sqrtPriceX96^2
      amountOut = (amountIn * (1n << 192n)) / (sqrtPriceX96 * sqrtPriceX96)
    }

    // Apply 0.3% fee
    amountOut = (amountOut * 997n) / 1000n

    return {
      routing: 'CLASSIC' as const,
      quote: {
        amountIn: params.amount,
        amountOut: amountOut.toString(),
      },
    }
  } catch (err) {
    throw new Error(
      `On-chain quote failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/**
 * Submit a swap transaction for a CLASSIC-routed quote.
 * For UniswapX quotes (DUTCH_V2 / DUTCH_V3 / PRIORITY) use `submitOrder` instead,
 * or call `executeSwapOrOrder` which picks the correct path automatically.
 */
export async function executeSwap(params: SwapParams): Promise<SwapResponse> {
  const body: Record<string, unknown> = {
    quote: params.quote,
  }

  if (params.signature !== undefined) body.signature = params.signature
  if (params.permitData !== undefined) body.permitData = params.permitData

  return apiRequest<SwapResponse>('/swap', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Submit a UniswapX order for a DUTCH_V2, DUTCH_V3, or PRIORITY-routed quote.
 * Both `signature` and `permitData` are required for UniswapX orders.
 */
export async function submitOrder(params: OrderParams): Promise<OrderResponse> {
  const body: Record<string, unknown> = {
    quote: params.quote,
    signature: params.signature,
    permitData: params.permitData,
  }

  return apiRequest<OrderResponse>('/order', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Convenience function that routes a completed quote to either `executeSwap`
 * or `submitOrder` based on the quote's routing type.
 *
 * - CLASSIC routing → POST /v1/swap
 * - DUTCH_V2 / DUTCH_V3 / PRIORITY routing → POST /v1/order
 *
 * @param quote      Quote returned by `getQuote`.
 * @param signature  EIP-712 signature (required for UniswapX; optional for classic).
 * @param permitData Permit data from the quote (required for UniswapX).
 */
export async function executeSwapOrOrder(
  quote: QuoteResponse,
  signature?: string,
  permitData?: unknown,
): Promise<SwapResponse | OrderResponse> {
  if (UNISWAPX_ROUTING_TYPES.includes(quote.routing)) {
    if (!signature) {
      throw new Error(
        `UniswapX order (routing=${quote.routing}) requires a signature.`,
      )
    }
    if (permitData === undefined) {
      throw new Error(
        `UniswapX order (routing=${quote.routing}) requires permitData.`,
      )
    }
    return submitOrder({ quote, signature, permitData })
  }

  return executeSwap({ quote, signature, permitData })
}

/**
 * Check whether a token approval is required before executing a swap.
 *
 * @example
 * const approval = await checkApproval({
 *   token: '0x4200...0006',
 *   amount: '1000000000000000',
 *   chainId: 84532,
 *   walletAddress: '0xYourWallet',
 * })
 * if (approval.approvalNeeded) {
 *   // submit approval.approvalTx before swapping
 * }
 */
export async function checkApproval(
  params: ApprovalParams,
): Promise<ApprovalResponse> {
  const body: Record<string, unknown> = {
    token: params.token,
    amount: params.amount,
    chainId: params.chainId,
    walletAddress: params.walletAddress,
  }

  return apiRequest<ApprovalResponse>('/check_approval', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Poll the status of a submitted swap transaction or UniswapX order.
 *
 * @param txHash Transaction hash (classic swap) or order hash (UniswapX).
 *
 * @example
 * const status = await getSwapStatus('0xabc...')
 * // { status: 'CONFIRMED', blockNumber: 12345678 }
 */
export async function getSwapStatus(txHash: string): Promise<SwapStatus> {
  return apiRequest<SwapStatus>(`/swap/status/${encodeURIComponent(txHash)}`)
}
