'use client'

import { usePathname } from 'next/navigation'
import IconRail from '@/components/IconRail'
import { DashboardProvider, useDashboard } from '@/components/DashboardContext'

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { chatOpen, openChat, closeChat } = useDashboard()

  return (
    <div className="flex h-screen bg-black overflow-hidden">
      <IconRail
        activePath={pathname}
        onChatToggle={() => (chatOpen ? closeChat() : openChat())}
        onOpenChatWithPrompt={(prompt) => openChat(prompt)}
        isChatOpen={chatOpen}
      />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <DashboardProvider>
      <DashboardShell>{children}</DashboardShell>
    </DashboardProvider>
  )
}
