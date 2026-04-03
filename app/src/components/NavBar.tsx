'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_LINKS = [
  { label: 'Chat', href: '/chat' },
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Escrow', href: '/escrow' },
]

export default function NavBar() {
  const pathname = usePathname()

  return (
    <header className="flex items-center gap-6 border-b border-[#111] bg-black px-6 py-4 shrink-0">
      {/* Logo */}
      <Link href="/chat" className="flex items-center gap-2.5 shrink-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[#333] bg-[#0a0a0a] text-[10px] font-bold tracking-widest text-[#c8d8ff]">
          W
        </div>
        <span className="text-sm font-semibold tracking-wide text-white">Whisper</span>
        <span className="rounded bg-[#0a0a0a] border border-[#222] px-1.5 py-0.5 text-[9px] font-mono text-zinc-600 tracking-widest uppercase">
          testnet
        </span>
      </Link>

      {/* Nav links */}
      <nav className="flex items-center gap-1">
        {NAV_LINKS.map((link) => {
          const isActive = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-[#0d1526] text-[#c8d8ff] border border-[#c8d8ff]/20'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#0a0a0a]'
              }`}
            >
              {link.label}
            </Link>
          )
        })}
      </nav>

      {/* Status */}
      <div className="ml-auto flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-[10px] text-zinc-600">Base Sepolia</span>
      </div>
    </header>
  )
}
