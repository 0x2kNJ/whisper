'use client'

import { useState } from 'react'
import Link from 'next/link'

interface IconRailProps {
  activePath: string
  onChatToggle: () => void
  onOpenChatWithPrompt?: (prompt: string) => void
  isChatOpen: boolean
}

const CONTACTS = [
  { name: 'Alice', ens: 'alice.whisper.eth' },
  { name: 'Bob', ens: 'bob.whisper.eth' },
  { name: 'Charlie', ens: 'charlie.whisper.eth' },
]

const navItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
]

export default function IconRail({ activePath, onChatToggle, onOpenChatWithPrompt, isChatOpen }: IconRailProps) {
  const [showContacts, setShowContacts] = useState(false)

  return (
    <nav className="w-16 shrink-0 bg-[rgba(5,5,10,0.8)] backdrop-blur-xl border-r border-[rgba(255,255,255,0.04)] hidden sm:flex flex-col items-center py-4 gap-1 z-10">
      {/* Logo */}
      <div
        className="w-9 h-9 rounded-[10px] flex items-center justify-center font-bold text-base mb-4"
        style={{
          background: 'linear-gradient(135deg, rgba(200,216,255,0.15), rgba(200,216,255,0.05))',
          border: '1px solid rgba(200,216,255,0.2)',
          color: '#c8d8ff',
        }}
      >
        W
      </div>

      <div className="w-6 h-px bg-[#222] my-2" />

      {/* Nav items */}
      {navItems.map((item) => {
        const isActive = activePath === item.href && item.label === 'Dashboard'
        return (
          <Link
            key={item.label}
            href={item.href}
            title={item.label}
            className={`relative w-10 h-10 rounded-[10px] flex items-center justify-center transition-all duration-150 ${
              isActive
                ? 'bg-[rgba(200,216,255,0.12)] text-[#c8d8ff]'
                : 'text-zinc-500 hover:bg-[rgba(200,216,255,0.08)] hover:text-zinc-400'
            }`}
          >
            {isActive && (
              <div className="absolute left-[-2px] top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-sm bg-[rgba(200,216,255,0.8)]" />
            )}
            {item.icon}
          </Link>
        )
      })}

      {/* Address Book */}
      <div className="relative">
        <button
          onClick={() => setShowContacts(v => !v)}
          title="Address Book"
          className={`w-10 h-10 rounded-[10px] flex items-center justify-center transition-all duration-150 ${
            showContacts
              ? 'bg-[rgba(200,216,255,0.12)] text-[#c8d8ff]'
              : 'text-zinc-500 hover:bg-[rgba(200,216,255,0.08)] hover:text-zinc-400'
          }`}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
          </svg>
        </button>

        {showContacts && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowContacts(false)} />
            <div
              className="absolute left-14 top-0 z-50 w-64 rounded-xl overflow-hidden shadow-2xl animate-fade-in"
              style={{
                background: 'rgba(10,10,15,0.95)',
                border: '1px solid rgba(200,216,255,0.12)',
                backdropFilter: 'blur(20px)',
              }}
            >
              <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">Address Book</div>
              </div>
              <div className="py-1">
                {CONTACTS.map((c) => (
                  <button
                    key={c.ens}
                    onClick={() => {
                      setShowContacts(false)
                      onOpenChatWithPrompt?.(`Pay ${c.ens} 0.001 USDC privately`)
                    }}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[rgba(200,216,255,0.06)] transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold"
                        style={{ background: 'rgba(200,216,255,0.1)', color: '#c8d8ff' }}
                      >
                        {c.name[0]}
                      </div>
                      <span className="text-xs text-zinc-300">{c.name}</span>
                    </div>
                    <span className="text-[10px] text-zinc-600 font-mono">{c.ens}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Chat toggle */}
      <button
        onClick={onChatToggle}
        title="Chat"
        className={`relative w-10 h-10 rounded-[10px] flex items-center justify-center transition-all duration-150 ${
          isChatOpen
            ? 'bg-[rgba(200,216,255,0.12)] text-[#c8d8ff]'
            : 'text-zinc-500 hover:bg-[rgba(200,216,255,0.08)] hover:text-zinc-400'
        }`}
      >
        {isChatOpen && (
          <div className="absolute left-[-2px] top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-sm bg-[rgba(200,216,255,0.8)]" />
        )}
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        {!isChatOpen && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400 border-2 border-[#0a0a0f]" />
        )}
      </button>

      <div className="flex-1" />
    </nav>
  )
}
