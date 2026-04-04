'use client'

import { useEffect, useRef, useState } from 'react'

interface AnimatedBalanceProps {
  value: string
  className?: string
}

export default function AnimatedBalance({
  value,
  className = '',
}: AnimatedBalanceProps) {
  const [display, setDisplay] = useState(value)
  const prevValue = useRef(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const from = parseFloat(prevValue.current) || 0
    const to = parseFloat(value) || 0
    prevValue.current = value

    if (from === to || isNaN(from) || isNaN(to)) {
      setDisplay(value)
      return
    }

    const decimals = value.includes('.')
      ? value.split('.')[1].length
      : 0

    const duration = 400
    const startTime = performance.now()

    function animate(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)

      const current = from + (to - from) * eased
      setDisplay(current.toFixed(decimals))

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        setDisplay(value)
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value])

  return <span className={className}>{display}</span>
}
