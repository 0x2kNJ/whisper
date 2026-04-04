'use client'

import { useState, useRef, useEffect, useCallback, FormEvent } from 'react'
import ChatMessage, { type ChatMessageData } from '@/components/ChatMessage'
import { type ToolCallInfo } from '@/components/ToolCallCard'
import { AGENT_ENDPOINT, PLACEHOLDER_BALANCES, PLACEHOLDER_WALLET } from '@/lib/config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

// ---------------------------------------------------------------------------
// Sidebar balance card
// ---------------------------------------------------------------------------

function BalanceCard() {
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col gap-0 border-r border-[#111] bg-[#000]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-[#111] px-5 py-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[#333] bg-[#0a0a0a] text-[10px] font-bold tracking-widest text-[#c8d8ff]">
          W
        </div>
        <span className="text-sm font-semibold tracking-wide text-white">Whisper</span>
        <span className="ml-auto rounded bg-[#0a0a0a] border border-[#222] px-1.5 py-0.5 text-[9px] font-mono text-zinc-600 tracking-widest uppercase">
          testnet
        </span>
      </div>

      {/* Wallet address */}
      <div className="border-b border-[#111] px-5 py-4">
        <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1.5">
          Private wallet
        </div>
        <div className="font-mono text-xs text-zinc-400">{PLACEHOLDER_WALLET}</div>
        <div className="mt-1 flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-zinc-600">Connected</span>
        </div>
      </div>

      {/* Private balances */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-3">
          Private balances
        </div>
        <div className="flex flex-col gap-2">
          {PLACEHOLDER_BALANCES.map((b, i) => (
            <div
              key={i}
              className="rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] px-3 py-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">{b.token}</span>
                <span className="text-xs font-mono text-zinc-300">{b.amount}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-zinc-600">{b.chain}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer notice */}
      <div className="border-t border-[#111] px-5 py-3">
        <p className="text-[10px] text-zinc-700 leading-relaxed">
          Balances are shielded via Unlink zero-knowledge proofs. Not visible on-chain.
        </p>
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Thinking indicator
// ---------------------------------------------------------------------------

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-3 animate-fade-in">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#333] bg-[#0a0a0a] text-[10px] font-bold tracking-widest text-[#c8d8ff]">
        W
      </div>
      <div className="flex items-center gap-1.5 rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] px-4 py-2.5">
        <span className="text-xs text-zinc-500 mr-1">Whisper is thinking</span>
        <span className="thinking-dot h-1 w-1 rounded-full bg-[#c8d8ff]" />
        <span className="thinking-dot h-1 w-1 rounded-full bg-[#c8d8ff]" />
        <span className="thinking-dot h-1 w-1 rounded-full bg-[#c8d8ff]" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Suggested prompts
// ---------------------------------------------------------------------------

const SUGGESTED_PROMPTS = [
  'Pay my team privately 🔒: Alice 0.2 USDC, Bob 0.15 USDC, Charlie 0.1 USDC',
  'Set up a private weekly payroll strategy 🔒 for the engineering team',
  'Create a private escrow 🔒 for Dave: 0.5 USDC, release when ETH > $4k',
  'Private swap 🔒 0.1 USDC → ETH for Bob + send Alice 0.05 USDC privately',
]

// ---------------------------------------------------------------------------
// Main chat page
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [agentHistory, setAgentHistory] = useState<AgentHistoryMessage[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  // Auto-resize textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
  }

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isThinking) return

      const userText = text.trim()
      setInput('')
      if (inputRef.current) {
        inputRef.current.style.height = 'auto'
      }

      // Add user message to UI
      const userMsgId = `user-${Date.now()}`
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: 'user', text: userText },
      ])

      // Prepare assistant message placeholder
      const assistantMsgId = `assistant-${Date.now()}`
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: 'assistant',
          text: '',
          toolCalls: [],
          streaming: true,
        },
      ])

      setIsThinking(true)

      // Abort previous request if any
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch(AGENT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userText, history: agentHistory }),
          signal: controller.signal,
        })

        if (!res.ok) {
          throw new Error(`API error: ${res.status} ${res.statusText}`)
        }

        const reader = res.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let buffer = ''
        let finalResponse = ''
        const finalToolCalls: ToolCallInfo[] = []

        // Parse SSE stream
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''

          for (const chunk of events) {
            if (!chunk.trim()) continue

            const lines = chunk.split('\n')
            let eventType = ''
            let dataLine = ''

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7).trim()
              } else if (line.startsWith('data: ')) {
                dataLine = line.slice(6)
              }
            }

            if (!eventType || !dataLine) continue

            let parsed: unknown
            try {
              parsed = JSON.parse(dataLine)
            } catch {
              continue
            }

            if (eventType === 'text') {
              const { text } = parsed as { text: string }
              finalResponse += text
              setIsThinking(false)
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, text: finalResponse, streaming: true }
                    : m,
                ),
              )
            } else if (eventType === 'tool_call') {
              const tc = parsed as ToolCallInfo
              finalToolCalls.push(tc)
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, toolCalls: [...(m.toolCalls ?? []), tc] }
                    : m,
                ),
              )
            } else if (eventType === 'done') {
              const { response, toolCalls } = parsed as {
                response: string
                toolCalls: ToolCallInfo[]
              }

              // Use final response from done event if we haven't streamed text yet
              if (!finalResponse && response) {
                finalResponse = response
              }

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        text: finalResponse,
                        toolCalls: toolCalls ?? finalToolCalls,
                        streaming: false,
                      }
                    : m,
                ),
              )

              // Update conversation history for next turn
              setAgentHistory((prev) => [
                ...prev,
                { role: 'user', content: userText },
                { role: 'assistant', content: finalResponse },
              ])
            } else if (eventType === 'error') {
              const { error } = parsed as { error: string }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        text: `Error: ${error}`,
                        streaming: false,
                      }
                    : m,
                ),
              )
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return

        const errorText =
          err instanceof Error ? err.message : 'Something went wrong'

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, text: `Error: ${errorText}`, streaming: false }
              : m,
          ),
        )
      } finally {
        setIsThinking(false)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, streaming: false } : m,
          ),
        )
        inputRef.current?.focus()
      }
    },
    [agentHistory, isThinking],
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    sendMessage(input)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div className="relative flex h-screen bg-black overflow-hidden">
      {/* Ambient background layers */}
      <div className="chat-ambient">
        <div className="chat-ambient-orb3" />
      </div>
      <div className="chat-noise" />
      <div className="chat-grid" />

      {/* Sidebar */}
      <BalanceCard />

      {/* Main chat area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-[#111] px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile logo */}
            <div className="flex md:hidden h-6 w-6 items-center justify-center rounded-full border border-[#333] bg-[#0a0a0a] text-[9px] font-bold tracking-widest text-[#c8d8ff]">
              W
            </div>
            <div>
              <span className="text-sm font-medium text-white">Treasury Agent</span>
              <span className="ml-2 text-xs text-zinc-600">Base Sepolia</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-zinc-600">Online</span>
          </div>
        </header>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          {isEmpty ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full gap-8 max-w-lg mx-auto text-center animate-fade-in">
              <div>
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[#333] bg-[#0a0a0a] text-lg font-bold tracking-widest text-[#c8d8ff]">
                  W
                </div>
                <h1 className="text-xl font-semibold text-white mb-2">
                  Whisper
                </h1>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  Your private AI treasury agent. All transactions are shielded with zero-knowledge proofs on Base Sepolia.
                </p>
              </div>

              {/* Suggested prompts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(prompt)}
                    disabled={isThinking}
                    className="rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] px-4 py-3 text-left text-xs text-zinc-400 hover:border-[#333] hover:text-zinc-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Messages list */
            <div className="flex flex-col gap-5 max-w-3xl mx-auto">
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}

              {/* Thinking indicator shows only if thinking and assistant hasn't started streaming text */}
              {isThinking &&
                !messages.find(
                  (m) =>
                    m.role === 'assistant' &&
                    m.streaming &&
                    (m.text || (m.toolCalls && m.toolCalls.length > 0)),
                ) && <ThinkingIndicator />}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="shrink-0 border-t border-[#111] bg-black px-4 md:px-8 py-4">
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-3 max-w-3xl mx-auto"
          >
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask Whisper anything..."
                disabled={isThinking}
                rows={1}
                className="w-full resize-none overflow-hidden rounded-xl border border-[#222] bg-[#0a0a0a] px-4 py-3 pr-4 text-sm text-white placeholder-zinc-600 outline-none transition-colors focus:border-[#333] disabled:opacity-60 disabled:cursor-not-allowed leading-relaxed"
                style={{ minHeight: '44px', maxHeight: '160px' }}
              />
            </div>

            <button
              type="submit"
              disabled={!input.trim() || isThinking}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#222] bg-[#0a0a0a] text-[#c8d8ff] transition-all hover:border-[#333] hover:bg-[#111] disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              {isThinking ? (
                <svg
                  className="h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4 translate-x-px"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 12h14M12 5l7 7-7 7"
                  />
                </svg>
              )}
            </button>
          </form>

          <p className="mt-2 text-center text-[10px] text-zinc-700 max-w-3xl mx-auto">
            Whisper operates on testnet. No real funds. Shift+Enter for new line.
          </p>
        </div>
      </div>
    </div>
  )
}
