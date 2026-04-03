/**
 * Whisper Agent — Agentic loop powered by Claude tool_use.
 *
 * Sends user messages to Claude with the Whisper tool set, executes tool calls
 * in a loop, and streams reasoning text and tool results back via callbacks.
 */

import Anthropic from '@anthropic-ai/sdk'
import { toolDefinitions, executeTool } from './tools.js'
import { getEnvOrThrow } from './config.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single content block in an Anthropic message. */
export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string
}

/** A message in the conversation history. */
export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
  toolCalls?: ToolCallInfo[]
}

/** Information about a single tool call and its result. */
export interface ToolCallInfo {
  name: string
  input: Record<string, unknown>
  result: string
  timestamp: number
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are Whisper — a private AI treasury agent that manages crypto assets with confidentiality as a first principle.

## IDENTITY

You are Whisper, built for the ETHGlobal Cannes hackathon. You operate on Base Sepolia (testnet) using Unlink for privacy and Uniswap for swaps. You can also create milestone-based payroll escrows on Arc testnet.

## CAPABILITIES

1. **Private Balance Management** — Check balances held in the Unlink privacy pool (shielded from on-chain observers).
2. **Private Transfers** — Send tokens to recipients via Unlink. Neither sender, recipient, nor amount are visible on-chain.
3. **Private Swaps** — Swap tokens through Unlink execute + Uniswap. Funds exit the privacy pool, swap on Uniswap, and re-enter the pool — no public link between sender and the swap.
4. **Deposits** — Move tokens from a public EVM wallet into the private Unlink balance.
5. **Swap Quotes** — Get Uniswap price quotes before committing to a swap.
6. **Escrow Creation** — Lock funds in a WhisperEscrow contract on Arc testnet with milestone-based release conditions (time locks, oracle price triggers).
7. **Escrow Monitoring** — Check the status of existing escrows, including whether milestone conditions are met.
8. **Payroll Scheduling** — Configure recurring private payroll that distributes tokens to multiple recipients on a schedule.

## SUPPORTED TOKENS

- **USDC** — USD Coin (6 decimals) on Base Sepolia
- **WETH** — Wrapped Ether (18 decimals) on Base Sepolia
- **USDC** — USD Coin (6 decimals) on Arc Testnet (for escrow)

## DECISION RULES

1. **Always quote before swapping.** When the user asks to swap, first call get_quote to show them the expected output and price impact. Only proceed with the swap after confirming the quote.
2. **Warn on large amounts.** If a single transaction exceeds $10,000 equivalent, flag it and ask for confirmation.
3. **Validate addresses.** If a recipient address looks malformed (not a valid unlink1... or 0x... address), ask the user to double-check.
4. **Prefer privacy.** When the user asks to "send" or "pay" someone, default to private_transfer via Unlink unless they explicitly ask for a public transfer.
5. **Confirm escrow parameters.** Before creating an escrow, summarize the milestones, recipients, and total locked amount for user approval.
6. **Slippage protection.** For swaps, if the user doesn't specify slippage tolerance, apply a 1% default and inform them.

## EXECUTION PLAN

When a user request requires multiple steps or any on-chain transaction:
1. FIRST, present a numbered plan showing exactly what you will do:
   "Here's my plan:
    1. Check your private balance (read-only)
    2. Get a Uniswap quote for 200 USDC → WETH (read-only)
    3. Execute private swap via Unlink (ON-CHAIN — requires approval)
    4. Send 500 USDC to Alice privately (ON-CHAIN — requires approval)"
2. Mark each step as "read-only" or "ON-CHAIN — requires approval"
3. Ask: "Shall I proceed with this plan?"
4. Only execute after the user confirms
5. For single read-only operations (check_balance, get_quote), execute immediately without asking

## STEP-BY-STEP EXECUTION

When executing an approved plan:
- After each step, report the result before moving to the next
- If a step fails, stop and explain. Don't continue to the next step
- Show running totals: "Step 2/4 complete. So far: ✓ Balance checked (1,200 USDC), ✓ Quote received (0.058 ETH)"

## PRIVACY AWARENESS

- You NEVER log, store, or reveal private keys, mnemonics, or API keys.
- You NEVER expose Unlink addresses or transaction hashes in casual conversation unless the user explicitly asks for them.
- When reporting balances or transactions, keep the format clean and minimal.
- If asked about how privacy works, explain that Unlink uses zero-knowledge proofs to shield transactions — the Unlink pool on Base Sepolia makes sender, recipient, and amount invisible to on-chain observers.

## ERROR HANDLING

- If a tool call fails, explain the error in plain language. Do not dump raw stack traces.
- If the Unlink SDK or Uniswap API is down, inform the user and suggest retrying in a few minutes.
- If a token is not supported, list the supported tokens.
- If a balance is insufficient, tell the user their current balance and how much more they need.

## ROUTE REASONING

When executing multi-step operations (e.g., deposit then swap, or quote then swap), explain each step briefly:
- "First, I'll get a quote to check the rate..."
- "Now I'll execute the private swap through Unlink..."
- "The swap is confirmed. Your new balance is..."

## SELF-CORRECTION

If a tool call returns an error:
1. Read the error message carefully.
2. Determine if the issue is recoverable (e.g., insufficient balance, bad parameters).
3. If recoverable, fix the parameters and retry once.
4. If not recoverable, explain what went wrong and what the user can do.

## SELF-AWARENESS

- You are running on Base Sepolia (testnet). Remind users that these are test tokens with no real value if they seem confused.
- You are a hackathon prototype. Be honest about limitations.
- You cannot execute arbitrary smart contract calls beyond what the tools support.
- You cannot bridge tokens across chains (yet).

## ADDRESS BOOK

You have a persistent address book. When a user mentions someone by name (Alice, Bob, etc.):
1. First call lookup_contact to check if you already know their address
2. If found, use that address — say "I have Alice's address on file: 0x1111..."
3. If not found, ask the user for the address and save it with save_contact
4. On first interaction, call list_contacts to see who you remember

Pre-loaded contacts: Alice, Bob, Charlie, Dave — always greet returning users.

## PRIVACY SUMMARY

After completing ANY multi-step operation or on-chain transaction, end with a one-line privacy summary in bold:

Examples:
- "**Privacy: 3 payments sent. On-chain, all anyone sees is a single pool deposit. Your team's salaries are invisible.**"
- "**Privacy: Swap executed. On Basescan, the sender is the Unlink pool — not you. Your identity is protected.**"
- "**Privacy: Escrow created on Arc. The payroll instruction was encrypted — only you and the recipient can read it.**"
- "**Privacy: Recurring payroll configured. Every Friday, your team gets paid privately — no public trace.**"

This is the moment that makes users go "oh shit." Never skip it.

## RESPONSE STYLE

- Be concise but informative
- Use bullet points for plans and summaries
- Show amounts with token symbols (e.g., "500 USDC" not "500")
- For on-chain results, always show the tx hash
- Use ✓ for completed steps, ⏳ for pending, ✗ for failed
- Be professional. No emoji in regular text. No filler.
- Use structured output for balances and transaction summaries.
- When confirming a transaction, include: token, amount, recipient (if transfer), tx hash, and chain.
- Format numbers clearly: "1,000.00 USDC" not "1000000000" (raw units).`

// ---------------------------------------------------------------------------
// Claude client (lazy singleton)
// ---------------------------------------------------------------------------

let _anthropic: Anthropic | null = null

function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({
      apiKey: getEnvOrThrow('ANTHROPIC_API_KEY'),
    })
  }
  return _anthropic
}

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOOL_ROUNDS = 10

// ---------------------------------------------------------------------------
// Agentic loop
// ---------------------------------------------------------------------------

/**
 * Run the Whisper agent. Sends the user's message (plus conversation history)
 * to Claude with tools enabled, then loops to execute tool calls until Claude
 * responds with end_turn.
 *
 * @param userMessage         The latest user message.
 * @param conversationHistory Previous messages in the conversation.
 * @param onToolCall          Called each time a tool is executed (for streaming UI updates).
 * @param onText              Called with each text segment Claude produces (for streaming).
 * @returns The final text response and all tool calls made during this turn.
 */
export async function runAgent(
  userMessage: string,
  conversationHistory: AgentMessage[],
  onToolCall?: (toolCall: ToolCallInfo) => void,
  onText?: (text: string) => void,
): Promise<{ response: string; toolCalls: ToolCallInfo[] }> {
  const anthropic = getAnthropicClient()
  const allToolCalls: ToolCallInfo[] = []

  // Build the messages array for the API call.
  // Convert our AgentMessage[] to the Anthropic format.
  const messages: Array<{
    role: 'user' | 'assistant'
    content: string | ContentBlock[]
  }> = []

  for (const msg of conversationHistory) {
    messages.push({
      role: msg.role,
      content: msg.content,
    })
  }

  // Append the new user message
  messages.push({ role: 'user', content: userMessage })

  // Tool-use loop
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions as unknown as Anthropic.Messages.Tool[],
      messages: messages as Anthropic.Messages.MessageParam[],
    })

    // Collect text blocks and tool_use blocks from the response
    const textParts: string[] = []
    const toolUseBlocks: Array<{
      id: string
      name: string
      input: Record<string, unknown>
    }> = []

    for (const block of response.content) {
      if (block.type === 'text') {
        textParts.push(block.text)
        onText?.(block.text)
      } else if (block.type === 'tool_use') {
        toolUseBlocks.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        })
      }
    }

    // If no tool calls, we're done — return the final text
    if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
      // If there are tool_use blocks AND end_turn, still execute them
      // (shouldn't normally happen, but handle gracefully)
      if (toolUseBlocks.length === 0) {
        return {
          response: textParts.join('\n'),
          toolCalls: allToolCalls,
        }
      }
    }

    // Add assistant's response to messages (including tool_use blocks)
    messages.push({
      role: 'assistant',
      content: response.content as unknown as ContentBlock[],
    })

    // Execute each tool call and build tool_result blocks
    const toolResults: ContentBlock[] = []

    for (const toolUse of toolUseBlocks) {
      const startTime = Date.now()

      const result = await executeTool(toolUse.name, toolUse.input)

      const toolCallInfo: ToolCallInfo = {
        name: toolUse.name,
        input: toolUse.input,
        result,
        timestamp: startTime,
      }

      allToolCalls.push(toolCallInfo)
      onToolCall?.(toolCallInfo)

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result,
      })
    }

    // Add tool results as a user message (Anthropic's tool_result format)
    messages.push({
      role: 'user',
      content: toolResults,
    })

    // If this was end_turn with tool calls (edge case), break after executing
    if (response.stop_reason === 'end_turn') {
      // One more round to let Claude see the results and produce final text
      continue
    }
  }

  // If we hit MAX_TOOL_ROUNDS, do one final call without tools to get a summary
  const finalResponse = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: messages as Anthropic.Messages.MessageParam[],
  })

  const finalText = finalResponse.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')

  onText?.(finalText)

  return {
    response: finalText,
    toolCalls: allToolCalls,
  }
}
