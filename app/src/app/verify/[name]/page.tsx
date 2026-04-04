'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface VerificationResult {
  name: string
  address: string | null
  unlinkAddress: string | null
  proofHash: string | null
  proofTimestamp: string | null
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
        const res = await fetch(`/api/verify/${encodeURIComponent(ensName)}`)
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

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/chat" className="inline-flex items-center gap-2 mb-6 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(200,216,255,0.15)] bg-[rgba(10,10,15,0.6)] text-[10px] font-bold tracking-widest text-[#c8d8ff]" style={{boxShadow: '0 0 15px rgba(200,216,255,0.08)'}}>
              W
            </div>
            <span className="text-sm font-semibold tracking-wide text-zinc-400 group-hover:text-white transition-colors">Whisper</span>
          </Link>
          <h1 className="text-2xl font-semibold mb-1">Income Verification</h1>
          <p className="text-sm text-zinc-500">ZK-verified payment proof via ENS</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(10,10,15,0.4)] backdrop-blur-xl p-6" style={{boxShadow: 'inset 0 0 60px rgba(200,216,255,0.02)'}}>
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-[#c8d8ff]" />
              <p className="text-sm text-zinc-500">Resolving {ensName}...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <div className="text-red-400 text-3xl mb-3">!</div>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          ) : result ? (
            <div className="space-y-5">
              {/* Identity */}
              <div className="flex items-center gap-3 pb-4 border-b border-white/[0.06]">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(200,216,255,0.08)] border border-[rgba(200,216,255,0.12)] text-sm font-bold text-[#c8d8ff]">
                  {ensName.split('.')[0].charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-base font-medium">{ensName}</div>
                  <div className="text-[11px] text-zinc-500 font-mono">
                    {result.unlinkAddress
                      ? `${result.unlinkAddress.slice(0, 12)}...${result.unlinkAddress.slice(-8)}`
                      : result.address
                      ? `${result.address.slice(0, 6)}...${result.address.slice(-4)}`
                      : 'No address'}
                  </div>
                </div>
              </div>

              {/* Verification Status */}
              <div className="rounded-xl p-4" style={{
                background: result.isVerified
                  ? 'rgba(74, 222, 128, 0.06)'
                  : 'rgba(200, 216, 255, 0.04)',
                border: result.isVerified
                  ? '1px solid rgba(74, 222, 128, 0.15)'
                  : '1px solid rgba(255, 255, 255, 0.06)',
              }}>
                <div className="flex items-center gap-2 mb-2">
                  {result.isVerified ? (
                    <>
                      <svg className="h-5 w-5 text-green-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                      </svg>
                      <span className="text-sm font-semibold text-green-400">Income Verified</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5 text-[#c8d8ff]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                      </svg>
                      <span className="text-sm font-semibold text-[#c8d8ff]">Privacy-Enabled</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {result.isVerified
                    ? 'This person has a cryptographically verified payment proof on-chain. The proof confirms they received payment — without revealing the amount, sender, or other recipients.'
                    : 'This address is privacy-enabled via Unlink ZK proofs. No payment proof has been published yet.'}
                </p>
              </div>

              {/* Proof Details */}
              {result.isVerified && result.proofHash && (
                <div className="space-y-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">ZK Proof Hash</div>
                    <div className="font-mono text-xs text-zinc-300 bg-white/[0.03] rounded-lg px-3 py-2 border border-white/[0.06] break-all">
                      {result.proofHash}
                    </div>
                  </div>
                  {result.proofTimestamp && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">Verified At</div>
                      <div className="text-xs text-zinc-400">{new Date(result.proofTimestamp).toLocaleString()}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Privacy Notice */}
              <div className="flex items-start gap-2 pt-3 border-t border-white/[0.06]">
                <svg className="h-3.5 w-3.5 text-[#c8d8ff] mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
                <div>
                  <div className="text-[11px] font-medium text-[#c8d8ff] mb-0.5">What this proves</div>
                  <ul className="text-[10px] text-zinc-500 space-y-0.5">
                    <li>This person received a ZK-shielded payment</li>
                    <li>The payment was verified on Base Sepolia</li>
                    <li>Amount, sender, and other recipients are NOT revealed</li>
                    <li>Proof is stored on Ethereum via ENS text records</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-[10px] text-zinc-700 flex items-center justify-center gap-1">
            <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
            Powered by Whisper — ENS + Unlink ZK Proofs
          </p>
        </div>
      </div>
    </div>
  )
}
