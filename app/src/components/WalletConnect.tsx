'use client'

import { useState, useEffect, useCallback } from 'react'

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      on: (event: string, handler: (...args: unknown[]) => void) => void
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void
    }
  }
}

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export default function WalletConnect() {
  const [address, setAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  const handleAccountsChanged = useCallback((...args: unknown[]) => {
    const accounts = args[0] as string[]
    setAddress(accounts.length > 0 ? accounts[0] : null)
  }, [])

  useEffect(() => {
    if (!window.ethereum) return

    // Check if already connected
    window.ethereum
      .request({ method: 'eth_accounts' })
      .then((accounts) => {
        const accts = accounts as string[]
        if (accts.length > 0) setAddress(accts[0])
      })
      .catch(() => {})

    window.ethereum.on('accountsChanged', handleAccountsChanged)
    return () => {
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged)
    }
  }, [handleAccountsChanged])

  async function connect() {
    if (!window.ethereum) {
      window.open('https://metamask.io/download/', '_blank')
      return
    }

    setConnecting(true)
    try {
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[]
      if (accounts.length > 0) setAddress(accounts[0])
    } catch {
      // User rejected or error
    } finally {
      setConnecting(false)
    }
  }

  if (address) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[rgba(200,216,255,0.12)] bg-[rgba(200,216,255,0.04)] px-3 py-1.5">
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <span className="text-[11px] font-mono text-[rgba(200,216,255,0.7)]">
          {truncate(address)}
        </span>
      </div>
    )
  }

  return (
    <button
      onClick={connect}
      disabled={connecting}
      className="flex items-center gap-1.5 rounded-lg border border-[rgba(200,216,255,0.15)] bg-[rgba(200,216,255,0.06)] px-3 py-1.5 text-[11px] text-[rgba(200,216,255,0.6)] hover:text-[#c8d8ff] hover:border-[rgba(200,216,255,0.3)] hover:bg-[rgba(200,216,255,0.1)] transition-all disabled:opacity-50"
    >
      {connecting ? (
        <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      ) : (
        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />
        </svg>
      )}
      Connect Wallet
    </button>
  )
}
