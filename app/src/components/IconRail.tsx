'use client'

import Link from 'next/link'

interface IconRailProps {
  activePath: string
  onChatToggle: () => void
  isChatOpen: boolean
}

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

export default function IconRail({ activePath, onChatToggle, isChatOpen }: IconRailProps) {
  return (
    <nav className="w-16 shrink-0 bg-[rgba(5,5,10,0.8)] backdrop-blur-xl border-r border-[rgba(255,255,255,0.04)] flex flex-col items-center py-4 gap-1 z-10">
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
