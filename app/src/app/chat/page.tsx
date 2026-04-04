'use client'

import { useState, useRef, useEffect, useCallback, FormEvent } from 'react'
import ChatMessage, { type ChatMessageData } from '@/components/ChatMessage'
import { type ToolCallInfo } from '@/components/ToolCallCard'
import ChatSidebar, {
  type ConversationSummary,
  type BalanceInfo,
} from '@/components/ChatSidebar'
import {
  AGENT_ENDPOINT,
  BALANCES_ENDPOINT,
  CONVERSATIONS_ENDPOINT,
} from '@/lib/config'

interface AgentHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

function ThinkingIndicator({ visible }: { visible: boolean }) {
  return (
    <div className={`flex items-center gap-3 transition-all duration-200 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'}`}>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#333] bg-[#0a0a0a] text-[10px] font-bold tracking-widest text-[#c8d8ff]">
        W
      </div>
      <div className="flex items-center gap-1.5 rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] px-4 py-2.5">
        <span className="text-xs thinking-shimmer mr-1">Whisper is thinking</span>
        <span className="thinking-dot h-1 w-1 rounded-full bg-[#c8d8ff]" />
        <span className="thinking-dot h-1 w-1 rounded-full bg-[#c8d8ff]" />
        <span className="thinking-dot h-1 w-1 rounded-full bg-[#c8d8ff]" />
      </div>
    </div>
  )
}

const SUGGESTED_PROMPTS = [
  'Pay my team privately \u{1F512}: Alice 0.2 USDC, Bob 0.15 USDC, Charlie 0.1 USDC',
  'Set up a private weekly payroll strategy \u{1F512} for the engineering team',
  'Create a private escrow \u{1F512} for Dave: 0.5 USDC, release when ETH > $4k',
  'Private swap \u{1F512} 0.1 USDC \u2192 ETH for Bob + send Alice 0.05 USDC privately',
]

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [agentHistory, setAgentHistory] = useState<AgentHistoryMessage[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)

  const [balances, setBalances] = useState<BalanceInfo[]>([])
  const [wallet, setWallet] = useState<string | null>(null)
  const [balancesLoading, setBalancesLoading] = useState(true)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [thinkingVisible, setThinkingVisible] = useState(false)
  const [sendPulse, setSendPulse] = useState(false)

  const fetchBalances = useCallback(async () => {
    try {
      setBalancesLoading(true)
      const res = await fetch(BALANCES_ENDPOINT)
      if (res.ok) {
        const data = await res.json()
        setBalances(data.balances ?? [])
        setWallet(data.wallet ?? null)
      }
    } catch {
    } finally {
      setBalancesLoading(false)
    }
  }, [])

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(CONVERSATIONS_ENDPOINT)
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations ?? [])
      }
    } catch {
    }
  }, [])

  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${CONVERSATIONS_ENDPOINT}/${id}`)
      if (!res.ok) return

      const data = await res.json()
      const loadedMessages: ChatMessageData[] = data.messages.map(
        (m: { id: string; role: string; text: string; tool_calls: unknown[] }) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          text: m.text,
          toolCalls: m.tool_calls as ToolCallInfo[],
          streaming: false,
        }),
      )

      const history: AgentHistoryMessage[] = data.messages
        .filter((m: { role: string; text: string }) => m.text)
        .map((m: { role: string; text: string }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.text,
        }))

      setMessages(loadedMessages)
      setAgentHistory(history)
      setActiveConversationId(id)
    } catch {
    }
  }, [])

  useEffect(() => {
    fetchBalances()
    fetchConversations()
  }, [fetchBalances, fetchConversations])

  useEffect(() => {
    if (isThinking) {
      setThinkingVisible(true)
    } else {
      const t = setTimeout(() => setThinkingVisible(false), 200)
      return () => clearTimeout(t)
    }
  }, [isThinking])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
  }

  function handleNewChat() {
    setMessages([])
    setAgentHistory([])
    setActiveConversationId(null)
    inputRef.current?.focus()
  }

  async function handleDeleteConversation(id: string) {
    try {
      await fetch(`${CONVERSATIONS_ENDPOINT}/${id}`, { method: 'DELETE' })
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeConversationId === id) {
        handleNewChat()
      }
    } catch {
    }
  }

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isThinking) return

      const userText = text.trim()
      setInput('')
      if (inputRef.current) {
        inputRef.current.style.height = 'auto'
      }

      let convId = activeConversationId
      if (!convId) {
        try {
          const res = await fetch(CONVERSATIONS_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: userText.slice(0, 50) }),
          })
          if (res.ok) {
            const data = await res.json()
            convId = data.id
            setActiveConversationId(convId)
            setConversations((prev) => [
              { id: data.id, title: data.title, created_at: Date.now(), updated_at: Date.now() },
              ...prev,
            ])
          }
        } catch {
        }
      }

      const userMsgId = `user-${Date.now()}`
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: 'user', text: userText },
      ])

      const assistantMsgId = `assistant-${Date.now()}`
      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: 'assistant', text: '', toolCalls: [], streaming: true },
      ])

      setIsThinking(true)

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
              const { text: t } = parsed as { text: string }
              finalResponse += t
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
              // Show running state first, then transition to completed
              const runningTc = { ...tc, result: '', duration: undefined, status: 'running' as const }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, toolCalls: [...(m.toolCalls ?? []), runningTc] }
                    : m,
                ),
              )
              // After brief delay, show completed state
              setTimeout(() => {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          toolCalls: (m.toolCalls ?? []).map((t) =>
                            t.name === tc.name && t.timestamp === tc.timestamp
                              ? { ...tc, status: 'done' as const }
                              : t,
                          ),
                        }
                      : m,
                  ),
                )
              }, 400)
            } else if (eventType === 'done') {
              const { response, toolCalls } = parsed as {
                response: string
                toolCalls: ToolCallInfo[]
              }

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

              setAgentHistory((prev) => [
                ...prev,
                { role: 'user', content: userText },
                { role: 'assistant', content: finalResponse },
              ])

              if (convId) {
                try {
                  await fetch(`${CONVERSATIONS_ENDPOINT}/${convId}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      messages: [
                        { role: 'user', text: userText, toolCalls: [] },
                        {
                          role: 'assistant',
                          text: finalResponse,
                          toolCalls: toolCalls ?? finalToolCalls,
                        },
                      ],
                    }),
                  })
                  fetchConversations()
                } catch {
                }
              }

              fetchBalances()
            } else if (eventType === 'error') {
              const { error } = parsed as { error: string }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, text: `Error: ${error}`, streaming: false }
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
    [agentHistory, isThinking, activeConversationId, fetchBalances, fetchConversations],
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    setSendPulse(true)
    setTimeout(() => setSendPulse(false), 150)
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
    <div className="flex h-screen bg-black overflow-hidden">
      <ChatSidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onNewChat={handleNewChat}
        onSelectConversation={loadConversation}
        onDeleteConversation={handleDeleteConversation}
        balances={balances}
        wallet={wallet}
        balancesLoading={balancesLoading}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex items-center justify-between border-b border-[#111] px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex md:hidden h-8 w-8 items-center justify-center rounded-lg border border-[#222] bg-[#0a0a0a] text-zinc-400 hover:text-white transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">Treasury Agent</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(200,216,255,0.08)] border border-[rgba(200,216,255,0.15)] px-2 py-0.5 text-[9px] font-medium text-[#c8d8ff] tracking-wide">
                <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
                ZK Shielded
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-zinc-600">Online</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full gap-8 max-w-lg mx-auto text-center animate-fade-in">
              <div>
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[#333] bg-[#0a0a0a] text-lg font-bold tracking-widest text-[#c8d8ff]">
                  W
                </div>
                <h1 className="text-xl font-semibold text-white mb-2">
                  {wallet
                    ? conversations.length > 0
                      ? `Welcome back, ${wallet.slice(0, 6)}`
                      : `Ready to move funds, ${wallet.slice(0, 6)}`
                    : 'Whisper'}
                </h1>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  {wallet
                    ? 'Everything here is private. Nothing on-chain until you confirm.'
                    : 'Your private AI treasury agent. All transactions are shielded with zero-knowledge proofs.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                {(() => {
                  const totalUsdc = balances.reduce((sum, b) => b.symbol === 'USDC' ? sum + parseFloat(b.balance) : sum, 0)
                  const dynamicPrompts = [
                    totalUsdc > 0
                      ? `Run payroll from your ${totalUsdc.toFixed(1)} USDC — pay Alice, Bob, Charlie privately`
                      : SUGGESTED_PROMPTS[0],
                    ...SUGGESTED_PROMPTS.slice(1),
                  ]
                  return dynamicPrompts
                })().map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(prompt); inputRef.current?.focus() }}
                    disabled={isThinking}
                    className="rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] px-4 py-3 text-left text-xs text-zinc-400 hover:border-[#333] hover:text-zinc-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <div className="flex flex-col items-center gap-2 mt-4">
                <p className="text-[11px] text-zinc-600 max-w-sm">
                  Natural language treasury. Every transfer is shielded with a ZK proof only you can verify.
                </p>
                <div className="flex gap-4 mt-1">
                  <a href="/privacy" className="text-[10px] text-[#c8d8ff]/50 hover:text-[#c8d8ff] transition-colors">
                    See how privacy works →
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5 max-w-3xl mx-auto">
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}

              {(isThinking || thinkingVisible) &&
                !messages.find(
                  (m) =>
                    m.role === 'assistant' &&
                    m.streaming &&
                    (m.text || (m.toolCalls && m.toolCalls.length > 0)),
                ) && <ThinkingIndicator visible={isThinking} />}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

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
                className={`w-full resize-none overflow-hidden rounded-xl border border-[#222] bg-[#0a0a0a] px-4 py-3 pr-4 text-sm text-white placeholder-zinc-600 outline-none transition-colors focus:border-[#333] disabled:cursor-not-allowed leading-relaxed ${isThinking ? 'input-breathing disabled:opacity-80' : ''}`}
                style={{ minHeight: '44px', maxHeight: '160px' }}
              />
            </div>

            <button
              type="submit"
              disabled={!input.trim() || isThinking}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#222] bg-[#0a0a0a] text-[#c8d8ff] transition-all hover:border-[#333] hover:bg-[#111] disabled:opacity-40 disabled:cursor-not-allowed ${sendPulse ? 'scale-95 opacity-60' : ''}`}
              aria-label="Send message"
            >
              {isThinking ? (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              ) : (
                <svg className="h-4 w-4 translate-x-px" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
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
