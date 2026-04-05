'use client'

import { useState, useRef, useEffect, useCallback, FormEvent } from 'react'
import ChatMessage, { type ChatMessageData } from '@/components/ChatMessage'
import { type ToolCallInfo } from '@/components/ToolCallCard'
import ToolProgressCard from '@/components/ToolProgressCard'
import {
  AGENT_ENDPOINT,
  CONVERSATIONS_ENDPOINT,
} from '@/lib/config'

interface ChatSidecarProps {
  isOpen: boolean
  onClose: () => void
  initialPrompt?: string
  autoSend?: boolean
  width?: number
  onWidthChange?: (w: number) => void
  onToolComplete?: (toolName: string) => void
}

interface AgentHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 animate-fade-in">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold text-[#c8d8ff]"
        style={{ background: 'rgba(200,216,255,0.12)' }}>
        W
      </div>
      <div className="flex items-center gap-1.5 rounded-lg px-3 py-2" style={{ background: 'rgba(200,216,255,0.06)', border: '1px solid rgba(200,216,255,0.1)' }}>
        <span className="text-[11px] text-zinc-500 mr-1">Thinking</span>
        <span className="thinking-dot h-1 w-1 rounded-full bg-[#c8d8ff]" />
        <span className="thinking-dot h-1 w-1 rounded-full bg-[#c8d8ff]" />
        <span className="thinking-dot h-1 w-1 rounded-full bg-[#c8d8ff]" />
      </div>
    </div>
  )
}

export default function ChatSidecar({
  isOpen,
  onClose,
  initialPrompt,
  autoSend,
  width = 420,
  onWidthChange,
  onToolComplete,
}: ChatSidecarProps) {
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [agentHistory, setAgentHistory] = useState<AgentHistoryMessage[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Array<{ id: string; title: string; updated_at: number }>>([])
  const [showHistory, setShowHistory] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isOpen])

  // Set initial prompt (auto-send effect is placed after sendMessage definition)
  const autoSendFired = useRef(false)

  // Fetch conversations when opened
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(CONVERSATIONS_ENDPOINT)
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations ?? [])
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (isOpen) fetchConversations()
  }, [isOpen, fetchConversations])

  // Load a conversation from history
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
      setShowHistory(false)
    } catch {}
  }, [])

  // Resize handling
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      resizeRef.current = { startX: e.clientX, startWidth: width }

      const handleMove = (me: MouseEvent) => {
        if (!resizeRef.current) return
        const delta = resizeRef.current.startX - me.clientX
        const newWidth = Math.max(320, Math.min(700, resizeRef.current.startWidth + delta))
        onWidthChange?.(newWidth)
      }

      const handleUp = () => {
        resizeRef.current = null
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
    },
    [width, onWidthChange],
  )

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isThinking) return

      const userText = text.trim()
      setInput('')
      if (inputRef.current) inputRef.current.style.height = 'auto'

      // Create conversation if needed
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
          }
        } catch {}
      }

      const userMsgId = `user-${Date.now()}`
      setMessages((prev) => [...prev, { id: userMsgId, role: 'user', text: userText }])

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

        if (!res.ok) throw new Error(`API error: ${res.status}`)

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
              if (line.startsWith('event: ')) eventType = line.slice(7).trim()
              else if (line.startsWith('data: ')) dataLine = line.slice(6)
            }

            if (!eventType || !dataLine) continue

            let parsed: unknown
            try { parsed = JSON.parse(dataLine) } catch { continue }

            if (eventType === 'tool_start') {
              const { name } = parsed as { name: string }
              setActiveTool(name)
              setIsThinking(false)
            } else if (eventType === 'text') {
              const { text: t } = parsed as { text: string }
              finalResponse += t
              setIsThinking(false)
              setActiveTool(null)
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, text: finalResponse, streaming: true } : m,
                ),
              )
            } else if (eventType === 'tool_call') {
              const tc = parsed as ToolCallInfo
              finalToolCalls.push(tc)
              setActiveTool(null)
              onToolComplete?.(tc.name)
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, toolCalls: [...(m.toolCalls ?? []), tc] }
                    : m,
                ),
              )
            } else if (eventType === 'done') {
              const { response, toolCalls } = parsed as { response: string; toolCalls: ToolCallInfo[] }
              if (!finalResponse && response) finalResponse = response

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, text: finalResponse, toolCalls: toolCalls ?? finalToolCalls, streaming: false }
                    : m,
                ),
              )

              setAgentHistory((prev) => [
                ...prev,
                { role: 'user', content: userText },
                { role: 'assistant', content: finalResponse },
              ])

              // Final refresh after all tools complete
              if (toolCalls?.length) {
                onToolComplete?.(toolCalls[toolCalls.length - 1].name)
              }

              // Save to conversation
              if (convId) {
                try {
                  await fetch(`${CONVERSATIONS_ENDPOINT}/${convId}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      messages: [
                        { role: 'user', text: userText, toolCalls: [] },
                        { role: 'assistant', text: finalResponse, toolCalls: toolCalls ?? finalToolCalls },
                      ],
                    }),
                  })
                } catch {}
              }
            } else if (eventType === 'error') {
              const { error } = parsed as { error: string }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, text: `Error: ${error}`, streaming: false } : m,
                ),
              )
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, text: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`, streaming: false }
              : m,
          ),
        )
      } finally {
        setIsThinking(false)
        setActiveTool(null)
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, streaming: false } : m)),
        )
        inputRef.current?.focus()
      }
    },
    [agentHistory, isThinking, activeConversationId],
  )

  // Auto-send initial prompt (must be after sendMessage definition)
  useEffect(() => {
    if (initialPrompt && isOpen) {
      if (autoSend && !autoSendFired.current) {
        autoSendFired.current = true
        setTimeout(() => sendMessage(initialPrompt), 400)
      } else {
        setInput(initialPrompt)
        setTimeout(() => inputRef.current?.focus(), 100)
      }
    }
    if (!isOpen) autoSendFired.current = false
  }, [initialPrompt, isOpen, autoSend, sendMessage])

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

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
  }

  function handleNewChat() {
    setMessages([])
    setAgentHistory([])
    setActiveConversationId(null)
    setInput('')
    setShowHistory(false)
    fetchConversations()
    inputRef.current?.focus()
  }

  return (
    <div
      className={`chat-sidecar ${isOpen ? 'open' : 'closed'}`}
      style={{ width: `${width}px` }}
    >
      {/* Resize handle */}
      <div
        className="sidecar-resize-handle"
        onMouseDown={handleResizeStart}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#222] shrink-0">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-[#c8d8ff]"
            style={{ background: 'rgba(200,216,255,0.12)' }}
          >
            W
          </div>
          <div>
            <div className="text-sm font-medium text-white">Whisper Agent</div>
            <div className="flex items-center gap-1 text-[11px] text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" style={{ animation: 'statusPulse 2s ease-in-out infinite' }} />
              Online
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowHistory(h => !h)}
            className={`h-7 px-2.5 rounded-md text-[11px] transition-all ${
              showHistory
                ? 'text-[#c8d8ff] bg-[rgba(200,216,255,0.1)]'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a1a]'
            }`}
          >
            History {showHistory ? '▴' : '▾'}
          </button>
          <button
            onClick={handleNewChat}
            className="h-7 px-2.5 rounded-md text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a1a] transition-all"
          >
            + New
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a1a] transition-all"
          >
            ✕
          </button>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="border-b border-[#222] max-h-[280px] overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <p className="text-xs text-zinc-500">No past conversations</p>
            </div>
          ) : (
            <div className="py-1">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  className={`w-full text-left px-5 py-2.5 text-xs transition-colors hover:bg-[rgba(200,216,255,0.04)] ${
                    activeConversationId === conv.id
                      ? 'text-[#c8d8ff] bg-[rgba(200,216,255,0.06)]'
                      : 'text-zinc-400'
                  }`}
                >
                  <div className="truncate font-medium">{conv.title}</div>
                  <div className="text-[10px] text-zinc-600 mt-0.5">
                    {new Date(conv.updated_at).toLocaleDateString()} · {new Date(conv.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 justify-end">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4">
            <div>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold text-[#c8d8ff] mx-auto mb-3"
                style={{ background: 'rgba(200,216,255,0.08)', border: '1px solid rgba(200,216,255,0.12)' }}
              >
                W
              </div>
              <p className="text-sm text-zinc-400">How can I help?</p>
              <p className="text-[11px] text-zinc-600 mt-1">Try one of these or type your own.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-[320px]">
              {[
                { icon: '→', text: 'Pay alice.whisper.eth 0.001 USDC privately', badge: '🔒' },
                { icon: '⊕', text: 'Setup payroll: alice and bob, 0.01 USDC each, monthly', badge: '🔒' },
                { icon: '◷', text: 'Run payroll: alice and bob — 0.001 USDC each', badge: '🔒' },
                { icon: '⊡', text: 'Create escrow for alice: 0.01 USDC, release when ETH > $4k', badge: '🔒' },
                { icon: '◈', text: 'Verify income for alice.whisper.eth', badge: '🔒' },
              ].map((p, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(p.text)}
                  disabled={isThinking}
                  className="text-left rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] px-3 py-2.5 text-[12px] text-zinc-400 hover:border-[rgba(200,216,255,0.15)] hover:text-zinc-300 hover:bg-[rgba(200,216,255,0.04)] transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  <span className="text-zinc-500 shrink-0">{p.icon}</span>
                  <span className="truncate">{p.text}</span>
                  <span className="ml-auto shrink-0 text-[10px]">{p.badge}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {activeTool && <ToolProgressCard toolName={activeTool} />}
            {isThinking && !activeTool &&
              !messages.find(
                (m) => m.role === 'assistant' && m.streaming && (m.text || (m.toolCalls && m.toolCalls.length > 0)),
              ) && <ThinkingIndicator />}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-[#222] px-4 py-3">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask Whisper anything..."
            disabled={isThinking}
            rows={1}
            className="flex-1 resize-none overflow-hidden rounded-xl border border-[#222] bg-[#0a0a0f] px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition-colors focus:border-[rgba(200,216,255,0.3)] disabled:opacity-60 leading-relaxed"
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isThinking}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#c8d8ff] transition-all disabled:opacity-40"
            style={{ background: 'rgba(200,216,255,0.15)' }}
          >
            {isThinking ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            ) : (
              <span className="text-sm">→</span>
            )}
          </button>
        </form>
        <p className="mt-1.5 text-center text-[9px] text-zinc-700">
          Testnet only. No real funds. Shift+Enter for new line.
        </p>
      </div>
    </div>
  )
}
