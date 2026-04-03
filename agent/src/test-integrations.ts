import 'dotenv/config'
import { Anthropic } from '@anthropic-ai/sdk'
import { baseSepolia, arcTestnet, getEnvOrThrow } from './config.js'
import { getQuote } from './uniswap.js'
import { createUnlinkClientWrapper, getBalances, buildUniswapExecuteCall } from './unlink.js'

// ═════════════════════════════════════════════════════════════════════════════
// Test Runner
// ═════════════════════════════════════════════════════════════════════════════

interface TestResult {
  name: string
  passed: boolean
  duration: number
  message?: string
  details?: string
}

const results: TestResult[] = []
let startTime = Date.now()

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(msg)
}

function pad(name: string, width: number): string {
  return name.padEnd(width, '.')
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

async function runTest(
  index: number,
  name: string,
  fn: () => Promise<{ message?: string; details?: string }>,
): Promise<void> {
  const testStart = Date.now()
  try {
    const result = await fn()
    const duration = Date.now() - testStart
    results.push({
      name,
      passed: true,
      duration,
      message: result.message,
      details: result.details,
    })
    const msg = result.message ? ` — ${result.message}` : ''
    log(
      `[${index}/6] ${pad(name, 35)} ✅ PASS (${formatDuration(duration)})${msg}`,
    )
  } catch (err) {
    const duration = Date.now() - testStart
    const errorMsg = err instanceof Error ? err.message : String(err)
    results.push({
      name,
      passed: false,
      duration,
      message: errorMsg,
    })
    log(
      `[${index}/6] ${pad(name, 35)} ❌ FAIL (${formatDuration(duration)})`,
    )
    log(`         Error: ${errorMsg}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

async function testAnthropicAPI(): Promise<{ message?: string }> {
  const client = new Anthropic({
    apiKey: getEnvOrThrow('ANTHROPIC_API_KEY'),
  })

  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 50,
    messages: [
      {
        role: 'user',
        content: 'Say "Whisper ready" in one word.',
      },
    ],
  })

  const content = response.content[0]
  if (!content || content.type !== 'text') {
    throw new Error('Unexpected response format from Anthropic API')
  }

  return { message: `Response: "${content.text.trim()}"` }
}

async function testUniswapQuote(): Promise<{ message?: string }> {
  const USDC = baseSepolia.tokens.USDC.address
  const WETH = baseSepolia.tokens.WETH.address

  // 10 USDC = 10 * 10^6 base units
  const amount = (10 * 1_000_000).toString()

  const quote = await getQuote({
    tokenIn: USDC,
    tokenOut: WETH,
    amount,
    chainId: baseSepolia.chainId,
    swapper: '0x0000000000000000000000000000000000000000',
    type: 'EXACT_INPUT',
    slippageTolerance: 0.5,
  })

  // Parse amountOut (in wei for WETH, 18 decimals)
  const amountOutRaw = BigInt(quote.quote.amountOut)
  const amountOutETH = Number(amountOutRaw) / 1e18

  const routeType = quote.routing

  return {
    message: `10 USDC = ${amountOutETH.toFixed(6)} WETH via ${routeType}`,
  }
}

async function testUnlinkClientInit(): Promise<{ message?: string }> {
  const mnemonic = getEnvOrThrow('MNEMONIC')
  const rpcUrl = baseSepolia.rpcUrl

  const client = createUnlinkClientWrapper(mnemonic, rpcUrl)

  if (!client.evmAddress) {
    throw new Error('Failed to derive EVM address from mnemonic')
  }

  // Wait for unlink address to be resolved (lazy async)
  await new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (client.unlinkAddress) {
        clearInterval(checkInterval)
        resolve(null)
      }
    }, 100)
    setTimeout(() => {
      clearInterval(checkInterval)
      resolve(null)
    }, 5000)
  })

  return {
    message: `EVM: ${client.evmAddress.slice(0, 10)}...`,
  }
}

async function testUnlinkBalance(): Promise<{ message?: string }> {
  const mnemonic = getEnvOrThrow('MNEMONIC')
  const rpcUrl = baseSepolia.rpcUrl

  const client = createUnlinkClientWrapper(mnemonic, rpcUrl)

  const balances = await getBalances(client)

  if (!Array.isArray(balances)) {
    throw new Error('getBalances did not return an array')
  }

  const usdcBalance = balances.find((b) => b.symbol === 'USDC')
  const displayBalance = usdcBalance ? `${usdcBalance.balance} USDC` : '0 USDC'

  return { message: displayBalance }
}

async function testArcRPC(): Promise<{ message?: string }> {
  const rpcUrl = arcTestnet.rpcUrl

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_chainId',
      params: [],
      id: 1,
    }),
  })

  if (!response.ok) {
    throw new Error(`Arc RPC returned ${response.status}`)
  }

  const data = (await response.json()) as {
    result?: string
    error?: { message: string }
  }

  if (data.error) {
    throw new Error(`Arc RPC error: ${data.error.message}`)
  }

  if (!data.result) {
    throw new Error('Arc RPC returned no result')
  }

  // Parse hex result to decimal
  const chainId = parseInt(data.result, 16)
  const expectedChainId = arcTestnet.chainId

  if (chainId !== expectedChainId) {
    throw new Error(
      `Chain ID mismatch: got ${chainId}, expected ${expectedChainId}`,
    )
  }

  return { message: `Chain ID: ${chainId}` }
}

async function testExecuteCalldata(): Promise<{ message?: string }> {
  const USDC = baseSepolia.tokens.USDC.address
  const WETH = baseSepolia.tokens.WETH.address

  const calls = buildUniswapExecuteCall({
    tokenIn: USDC,
    tokenOut: WETH,
    amount: '10',
    minAmountOut: '0.001',
  })

  // Validate calldata is valid hex
  if (!calls.approveCall.data.startsWith('0x')) {
    throw new Error('Approve calldata does not start with 0x')
  }

  if (!calls.swapCall.data.startsWith('0x')) {
    throw new Error('Swap calldata does not start with 0x')
  }

  // Ensure calldata is valid hex (only 0-9, a-f, A-F after 0x)
  const hexRegex = /^0x[0-9a-fA-F]*$/
  if (!hexRegex.test(calls.approveCall.data)) {
    throw new Error('Approve calldata is not valid hex')
  }

  if (!hexRegex.test(calls.swapCall.data)) {
    throw new Error('Swap calldata is not valid hex')
  }

  const calldataLen =
    (calls.approveCall.data.length + calls.swapCall.data.length) / 2 - 2

  return {
    message: `Valid hex calldata (${calldataLen} bytes)`,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Main
// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('🧪 Whisper Integration Tests')
  console.log('═══════════════════════════════════\n')

  await runTest(1, 'Anthropic API', testAnthropicAPI)
  await runTest(2, 'Uniswap Quote', testUniswapQuote)
  await runTest(3, 'Unlink Client Init', testUnlinkClientInit)
  await runTest(4, 'Unlink Balance', testUnlinkBalance)
  await runTest(5, 'Arc RPC', testArcRPC)
  await runTest(6, 'Execute Calldata', testExecuteCalldata)

  const totalTime = Date.now() - startTime
  const passed = results.filter((r) => r.passed).length
  const total = results.length

  console.log('\n═══════════════════════════════════')
  console.log(`Results: ${passed}/${total} passed ${passed === total ? '✅' : '❌'}`)
  console.log(`Total time: ${formatDuration(totalTime)}\n`)

  if (passed === total) {
    console.log('Ready to build! 🚀\n')
    process.exit(0)
  } else {
    console.log('Some tests failed. Check errors above.\n')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
