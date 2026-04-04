'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface DashboardContextType {
  chatOpen: boolean
  chatPrompt: string
  chatWidth: number
  openChat: (prompt?: string) => void
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

  const openChat = useCallback((prompt?: string) => {
    if (prompt) setChatPrompt(prompt)
    setChatOpen(true)
  }, [])

  const closeChat = useCallback(() => {
    setChatOpen(false)
    setChatPrompt('')
  }, [])

  return (
    <DashboardContext.Provider
      value={{ chatOpen, chatPrompt, chatWidth, openChat, closeChat, setChatWidth }}
    >
      {children}
    </DashboardContext.Provider>
  )
}
