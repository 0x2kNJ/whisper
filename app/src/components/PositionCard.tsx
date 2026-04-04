'use client'

interface PositionCardProps {
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
}: PositionCardProps) {
  const c = colors[type]
  const isCompleted = type === 'completed'

  return (
    <div
      onClick={onClick}
      className="position-card"
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
      {/* Header */}
      <div className="flex justify-between items-center mb-2.5">
        <span
          className="text-[10px] uppercase tracking-wide font-medium"
          style={{ color: c.text }}
        >
          {type === 'payroll' ? 'Payroll' : type === 'escrow' ? 'Escrow' : type === 'verification' ? 'Verification' : 'Completed'}
        </span>
        <span
          className="text-[10px] flex items-center gap-1"
          style={{ color: c.text }}
        >
          {status}
        </span>
      </div>

      {/* Title */}
      <div className={`text-[15px] font-medium mb-1 ${isCompleted ? 'text-zinc-500' : 'text-white'}`}>
        {title}
      </div>

      {/* Subtitle */}
      <div className={`text-xs mb-3.5 ${isCompleted ? 'text-zinc-600' : 'text-zinc-500'}`}>
        {subtitle}
      </div>

      {/* Progress bar */}
      {progress !== undefined && (
        <div
          className="h-1 rounded overflow-hidden mb-1.5"
          style={{ background: c.progressBg }}
        >
          <div
            className="h-full rounded"
            style={{
              background: c.progressFill,
              width: `${Math.min(100, Math.max(0, progress))}%`,
              transition: 'width 0.6s ease',
            }}
          />
        </div>
      )}

      {/* Progress label */}
      {progressLabel && (
        <div className={`text-[10px] mt-1.5 ${isCompleted ? 'text-zinc-600' : 'text-zinc-500'}`}>
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
