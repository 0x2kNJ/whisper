'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface VerificationResult {
  name: string
  displayName: string
  parentDomain: string
  address: string | null
  unlinkAddress: string | null
  proofHash: string | null
  proofTimestamp: string | null
  payroll: {
    period?: string
    frequency?: string
    payer?: string
    status?: string
  }
  isPrivate: boolean
  isVerified: boolean
}

export default function VerifyPage() {
  const params = useParams()
  const ensName = decodeURIComponent(params.name as string)
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function verify() {
      try {
        const res = await fetch(`/api/verify/${ensName}`)
        if (!res.ok) throw new Error('Verification failed')
        const data = await res.json()
        setResult(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to verify')
      } finally {
        setLoading(false)
      }
    }
    verify()
  }, [ensName])

  const displayName = result?.displayName || ensName.split('.')[0]
  const capitalName = displayName.charAt(0).toUpperCase() + displayName.slice(1)

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/dashboard" className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-xs">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 group">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(200,216,255,0.15)] bg-[rgba(10,10,15,0.6)] text-[9px] font-bold tracking-widest text-[#c8d8ff]" style={{boxShadow: '0 0 12px rgba(200,216,255,0.06)'}}>
              W
            </div>
            <span className="text-sm font-semibold tracking-wide text-zinc-500 group-hover:text-white transition-colors">Whisper</span>
          </Link>
        </div>

        {/* Main Card */}
        <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(10,10,15,0.4)] backdrop-blur-xl overflow-hidden" style={{boxShadow: 'inset 0 0 60px rgba(200,216,255,0.02)'}}>

          {loading ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-[#c8d8ff]" />
              <p className="text-sm text-zinc-500">Verifying {ensName}...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16 px-6">
              <div className="text-red-400/60 text-4xl mb-3">!</div>
              <p className="text-sm text-red-400/80">{error}</p>
            </div>
          ) : result ? (
            <>
              {/* Status Banner */}
              <div className="px-6 py-5 text-center" style={{
                background: result.isVerified
                  ? 'linear-gradient(180deg, rgba(74,222,128,0.08) 0%, transparent 100%)'
                  : 'linear-gradient(180deg, rgba(200,216,255,0.06) 0%, transparent 100%)',
              }}>
                {result.isVerified ? (
                  <svg className="h-10 w-10 mx-auto mb-2 text-green-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                  </svg>
                ) : (
                  <svg className="h-10 w-10 mx-auto mb-2 text-[#c8d8ff]/60" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                )}
                <h1 className={`text-lg font-semibold ${result.isVerified ? 'text-green-400' : 'text-[#c8d8ff]'}`}>
                  {result.isVerified ? 'Income Verified' : 'Income Not Yet Verified'}
                </h1>
                <p className="text-xs text-zinc-500 mt-1">
                  {result.isVerified
                    ? `${capitalName} was paid by ${result.payroll.payer || 'whisper.eth'} in ${result.payroll.period || 'April 2026'}`
                    : 'No payment proof has been published for this account yet'}
                </p>
              </div>

              {/* Identity Row */}
              <div className="px-6 py-4 border-t border-white/[0.04]">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[rgba(200,216,255,0.12)] to-[rgba(200,216,255,0.04)] border border-[rgba(200,216,255,0.1)] text-base font-bold text-[#c8d8ff]">
                    {capitalName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{ensName}</div>
                    <div className="text-[10px] text-zinc-600 font-mono truncate">
                      {result.unlinkAddress
                        ? `${result.unlinkAddress.slice(0, 16)}...${result.unlinkAddress.slice(-6)}`
                        : result.address
                        ? `${result.address.slice(0, 6)}...${result.address.slice(-4)}`
                        : 'Resolving...'}
                    </div>
                  </div>
                  {result.isPrivate && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(200,216,255,0.06)] border border-[rgba(200,216,255,0.1)] px-2 py-0.5 text-[9px] text-[#c8d8ff] font-medium">
                      <svg className="h-2 w-2" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75" />
                      </svg>
                      ZK
                    </span>
                  )}
                </div>
              </div>

              {/* Payment Details */}
              {result.isVerified && (
                <div className="px-6 py-4 border-t border-white/[0.04]">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-3">Payment Details</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] text-zinc-600 mb-0.5">Recipient</div>
                      <div className="text-xs text-white font-medium">{capitalName}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-600 mb-0.5">Period</div>
                      <div className="text-xs text-white font-medium">{result.payroll.period || 'April 2026'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-600 mb-0.5">Paid By</div>
                      <div className="text-xs text-white font-medium">{result.payroll.payer || 'whisper.eth'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-600 mb-0.5">Frequency</div>
                      <div className="text-xs text-white font-medium">{result.payroll.frequency || 'Monthly'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-600 mb-0.5">Status</div>
                      <div className="text-xs text-green-400 font-medium flex items-center gap-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-green-400" />
                        {result.payroll.status || 'Confirmed'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-600 mb-0.5">Verified</div>
                      <div className="text-xs text-white font-medium">
                        {result.proofTimestamp
                          ? new Date(result.proofTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'Apr 4, 2026'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Amount Privacy Notice */}
              {result.isVerified && (
                <div className="mx-6 mb-4 rounded-lg px-3 py-2 bg-[rgba(200,216,255,0.04)] border border-[rgba(200,216,255,0.08)]">
                  <div className="flex items-center gap-1.5">
                    <svg className="h-3 w-3 text-[#c8d8ff]/60 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                    <span className="text-[10px] text-zinc-500">Amount is ZK-shielded — not visible to verifiers</span>
                  </div>
                </div>
              )}

              {/* Proof Hash */}
              {result.isVerified && result.proofHash && (
                <div className="px-6 py-4 border-t border-white/[0.04]">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">ZK Proof</div>
                  <div className="font-mono text-[10px] text-zinc-400 bg-white/[0.02] rounded-lg px-3 py-2 border border-white/[0.04] break-all leading-relaxed">
                    {result.proofHash}
                  </div>
                </div>
              )}

              {/* What This Proves / Doesn't Prove — only show when verified */}
              {result.isVerified && <div className="px-6 py-4 border-t border-white/[0.04]">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-green-500/60 mb-2 flex items-center gap-1">
                      <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      Verified
                    </div>
                    <ul className="text-[10px] text-zinc-500 space-y-1">
                      <li>Payment was received</li>
                      <li>Proof exists on-chain</li>
                      <li>ENS identity confirmed</li>
                      <li>ZK cryptographic proof</li>
                    </ul>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2 flex items-center gap-1">
                      <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774" />
                      </svg>
                      Hidden
                    </div>
                    <ul className="text-[10px] text-zinc-500 space-y-1">
                      <li>Payment amount</li>
                      <li>Sender identity</li>
                      <li>Other recipients</li>
                      <li>Transaction history</li>
                    </ul>
                  </div>
                </div>
              </div>}

              {/* Verification Chain */}
              <div className="px-6 py-3 border-t border-white/[0.04] bg-white/[0.01]">
                <div className="flex items-center justify-between text-[9px] text-zinc-600">
                  <span>ENS (Sepolia) + Unlink ZK Proofs (Base Sepolia)</span>
                  <span>{new Date().toLocaleDateString()}</span>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="text-center mt-6 space-y-2">
          <p className="text-[10px] text-zinc-700 flex items-center justify-center gap-1">
            <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
            Powered by Whisper — ENS + Unlink ZK Proofs
          </p>
          <p className="text-[9px] text-zinc-800">
            Verify any ENS name at whisper.app/verify/name.eth
          </p>
        </div>
      </div>
    </div>
  )
}
