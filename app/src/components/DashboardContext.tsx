'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface DashboardContextType {
  chatOpen: boolean
  chatPrompt: string
  chatWidth: number
  autoSend: boolean
  openChat: (prompt?: string) => void
  sendChat: (prompt: string) => void
  closeChat: () => void
  setChatWidth: (w: number) => void
}

const DashboardContext = createContext<DashboardContextType | null>(null)

export function useDashboard() {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider')
  return ctx
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false)
  const [chatPrompt, setChatPrompt] = useState('')
  const [chatWidth, setChatWidth] = useState(420)
  const [autoSend, setAutoSend] = useState(false)

  const openChat = useCallback((prompt?: string) => {
    if (prompt) setChatPrompt(prompt)
    setAutoSend(false)
    setChatOpen(true)
  }, [])

  const sendChat = useCallback((prompt: string) => {
    setChatPrompt(prompt)
    setAutoSend(true)
    setChatOpen(true)
  }, [])

  const closeChat = useCallback(() => {
    setChatOpen(false)
    setChatPrompt('')
    setAutoSend(false)
  }, [])

  return (
    <DashboardContext.Provider
      value={{ chatOpen, chatPrompt, chatWidth, autoSend, openChat, sendChat, closeChat, setChatWidth }}
    >
      {children}
    </DashboardContext.Provider>
  )
}
