'use client'

import { useState } from 'react'

interface PositionCardProps {
  id: string
  type: 'payroll' | 'escrow' | 'verification' | 'completed'
  title: string
  subtitle: string
  status: string
  progress?: number
  progressLabel?: string
  recipients?: { name: string }[]
  badge?: string
  footer: string
  onClick?: () => void
  onClose?: (id: string) => void
}

const colors = {
  payroll: {
    bg: 'linear-gradient(135deg, rgba(74,222,128,0.06) 0%, rgba(74,222,128,0.02) 100%)',
    border: 'rgba(74,222,128,0.15)',
    borderHover: 'rgba(74,222,128,0.3)',
    text: '#4ade80',
    progressBg: 'rgba(74,222,128,0.12)',
    progressFill: '#4ade80',
  },
  escrow: {
    bg: 'linear-gradient(135deg, rgba(251,191,36,0.06) 0%, rgba(251,191,36,0.02) 100%)',
    border: 'rgba(251,191,36,0.15)',
    borderHover: 'rgba(251,191,36,0.3)',
    text: '#fbbf24',
    progressBg: 'rgba(251,191,36,0.12)',
    progressFill: '#fbbf24',
  },
  verification: {
    bg: 'linear-gradient(135deg, rgba(200,216,255,0.06) 0%, rgba(200,216,255,0.02) 100%)',
    border: 'rgba(200,216,255,0.15)',
    borderHover: 'rgba(200,216,255,0.3)',
    text: '#c8d8ff',
    progressBg: 'rgba(200,216,255,0.12)',
    progressFill: '#c8d8ff',
  },
  completed: {
    bg: '#111111',
    border: '#222222',
    borderHover: 'rgba(200,216,255,0.2)',
    text: '#71717a',
    progressBg: 'rgba(113,113,122,0.12)',
    progressFill: '#71717a',
  },
}

const recipientColors = ['#2d4a3d', '#3d3a2d', '#2d3a4a', '#3d2d4a', '#4a3d2d']

export default function PositionCard({
  id,
  type,
  title,
  subtitle,
  status,
  progress,
  progressLabel,
  recipients,
  badge,
  footer,
  onClick,
  onClose,
}: PositionCardProps) {
  const c = colors[type]
  const isCompleted = type === 'completed'
  const [confirming, setConfirming] = useState(false)
  const [closing, setClosing] = useState(false)

  // Generate deterministic sparkline — newer positions show less history
  const createdDate = footer.match(/\d+\/\d+\/\d+/)
  const isNew = createdDate && new Date(createdDate[0]).toDateString() === new Date().toDateString()

  const sparklineData = isNew
    ? Array.from({ length: 14 }, (_, i) => i === 13 ? 25 : 0) // just created — single bar
    : Array.from({ length: 14 }, (_, i) => {
        const seed = title.charCodeAt(i % title.length) + i * 7
        const active = seed % 3 !== 0
        if (!active) return 0
        return 20 + (seed * 13) % 80
      })

  return (
    <div
      onClick={onClick}
      className="position-card group relative"
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLElement).style.borderColor = c.borderHover
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.borderColor = c.border
      }}
    >
      {/* Confirm close overlay */}
      {confirming && (
        <div
          className="absolute inset-0 z-10 rounded-[14px] flex flex-col items-center justify-center gap-3 backdrop-blur-sm"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs text-zinc-300">Close this position?</p>
          <div className="flex gap-2">
            <button
              onClick={async (e) => {
                e.stopPropagation()
                setClosing(true)
                onClose?.(id)
              }}
              disabled={closing}
              className="text-[11px] px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
            >
              {closing ? 'Closing...' : 'Close'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirming(false) }}
              className="text-[11px] px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-2.5">
        <span
          className="text-[10px] uppercase tracking-wide font-medium flex items-center gap-1.5"
          style={{ color: c.text }}
        >
          {type === 'payroll' ? 'Payroll' : type === 'escrow' ? 'Escrow' : type === 'verification' ? 'Verification' : 'Completed'}
          {!isCompleted && <span className="text-[9px] opacity-70">🔒</span>}
        </span>
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] flex items-center gap-1"
            style={{ color: c.text }}
          >
            {status}
          </span>
          {onClose && !isCompleted && (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirming(true) }}
              className="w-5 h-5 rounded-md flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
              title="Close position"
            >
              <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <div className={`text-[15px] font-medium mb-1 ${isCompleted ? 'text-zinc-500' : 'text-white'}`}>
        {title}
      </div>

      {/* Subtitle */}
      <div className={`text-xs mb-3.5 ${isCompleted ? 'text-zinc-600' : 'text-zinc-500'}`}>
        {subtitle}
      </div>

      {/* Sparkline — 14-day activity */}
      <div className="flex items-end gap-[3px] h-[32px] mt-1 mb-1.5">
        {sparklineData.map((val, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm transition-all duration-300"
            style={{
              height: `${Math.max(8, val)}%`,
              background: val > 0 ? c.progressFill : c.progressBg,
              opacity: val > 0 ? 0.7 + (val / 300) : 0.3,
            }}
          />
        ))}
      </div>

      {/* Progress label */}
      {progressLabel && (
        <div className={`text-[10px] mt-1 ${isCompleted ? 'text-zinc-600' : 'text-zinc-500'}`}>
          {progressLabel}
        </div>
      )}

      {/* Badge (for verification) */}
      {badge && (
        <div className="flex gap-2 mt-2.5">
          <span
            className="text-[10px] rounded-md px-2.5 py-1"
            style={{
              background: 'rgba(200,216,255,0.08)',
              color: 'rgba(200,216,255,0.8)',
            }}
          >
            {badge}
          </span>
        </div>
      )}

      {/* Recipients */}
      {recipients && recipients.length > 0 && (
        <div className="flex mt-2.5">
          {recipients.slice(0, 5).map((r, i) => (
            <div
              key={i}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white"
              style={{
                background: recipientColors[i % recipientColors.length],
                border: '2px solid #000',
                marginLeft: i > 0 ? '-6px' : '0',
              }}
            >
              {r.name.charAt(0).toUpperCase()}
            </div>
          ))}
          {recipients.length > 5 && (
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-medium text-zinc-400 bg-surface-3"
              style={{ border: '2px solid #000', marginLeft: '-6px' }}
            >
              +{recipients.length - 5}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className={`text-[10px] mt-2 ${isCompleted ? 'text-zinc-600' : 'text-zinc-500'}`}>
        {footer}
      </div>
    </div>
  )
}
