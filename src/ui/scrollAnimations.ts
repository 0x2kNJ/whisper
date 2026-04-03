/**
 * Initializes scroll-triggered animations using IntersectionObserver.
 * - Sections fade in when they enter the viewport
 * - Terminal demo types out lines when visible
 */
export function initScrollAnimations(): void {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible')
        }
      }
    },
    { threshold: 0.15 }
  )

  document.querySelectorAll('[data-animate]').forEach((el) => {
    observer.observe(el)
  })

  // Terminal typing animation
  const terminalBody = document.getElementById('demo-terminal-body')
  if (terminalBody) {
    const lines: { text: string; color: string }[] = [
      { text: 'User >  "Pay Alice 500 USDC and swap 200 USDC to ETH for Bob, privately"', color: 'rgba(255,255,255,0.9)' },
      { text: '', color: '' },
      { text: 'Agent >  Checking your private balance...', color: '#c8d8ff' },
      { text: '         Balance: 1,200 USDC (shielded)', color: '#27c93f' },
      { text: '         Constructing ZK-proof for Unlink tunnel...', color: '#888' },
      { text: '         Finding best swap route (Uniswap V3 liquidity detected)', color: '#888' },
      { text: '         Broadcasting private intent via Unlink Relay...', color: '#c8d8ff' },
      { text: '', color: '' },
      { text: 'Status >  Done. Both payments complete. Zero public trace.', color: 'rgba(255,255,255,0.9)' },
    ]

    let hasPlayed = false
    const termObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasPlayed) {
          hasPlayed = true
          typeLines(terminalBody, lines)
        }
      },
      { threshold: 0.3 }
    )
    termObserver.observe(terminalBody)
  }
}

function typeLines(
  container: HTMLElement,
  lines: { text: string; color: string }[],
  delay = 350
): void {
  let i = 0
  function next() {
    if (i >= lines.length) return
    const line = lines[i]

    const div = document.createElement('div')
    div.className = 'terminal-line'
    div.style.color = line.color || '#888'
    div.textContent = line.text || '\u00A0'

    container.appendChild(div)

    // Trigger animation
    requestAnimationFrame(() => {
      div.classList.add('visible')
    })

    i++
    setTimeout(next, line.text ? delay : 120)
  }
  next()
}
