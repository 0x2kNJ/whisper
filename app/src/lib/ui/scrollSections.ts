/**
 * Creates all scroll sections below the hero fold.
 * Based on Stitch-generated design, rebuilt as DOM elements.
 */
export function createScrollSections(): HTMLElement {
  const container = document.createElement('div')
  container.id = 'scroll-sections'
  container.style.position = 'relative'
  container.style.zIndex = '5'

  // Hero spacer
  const spacer = document.createElement('div')
  spacer.style.height = '150vh'
  container.appendChild(spacer)

  // Section A: The Problem
  const sectionA = createSection('problem')
  const ruleA = document.createElement('div')
  ruleA.className = 'section-rule'
  ruleA.style.cssText = 'width:60px;height:1px;background:rgba(200,216,255,0.3);margin-bottom:3rem;'

  const headlineA = document.createElement('h2')
  headlineA.className = 'section-headline'
  headlineA.style.cssText = 'font-size:clamp(2rem,5vw,3.5rem);font-weight:400;color:rgba(255,255,255,0.95);line-height:1.1;letter-spacing:-0.02em;margin-bottom:2rem;'
  headlineA.textContent = 'Your treasury is a glass box.'

  const bodyA = document.createElement('div')
  bodyA.className = 'section-body'
  bodyA.style.cssText = 'max-width:600px;'

  const p1 = document.createElement('p')
  p1.style.cssText = 'color:rgba(255,255,255,0.6);font-size:clamp(1rem,1.5vw,1.15rem);font-weight:300;line-height:1.7;margin-bottom:1rem;'
  p1.textContent = 'Every swap, every payroll batch, every rebalance — broadcast to the entire network the moment it hits the mempool. Competitors front-run your trades. Analysts map your strategy. MEV bots extract value before your transaction confirms.'

  const p2 = document.createElement('p')
  p2.style.cssText = 'color:rgba(255,255,255,0.6);font-size:clamp(1rem,1.5vw,1.15rem);font-weight:300;line-height:1.7;'
  p2.textContent = 'On-chain transparency was supposed to build trust. Instead, it built a surveillance layer.'

  bodyA.appendChild(p1)
  bodyA.appendChild(p2)

  const innerA = sectionA.querySelector('.section-inner')!
  innerA.appendChild(ruleA)
  innerA.appendChild(headlineA)
  innerA.appendChild(bodyA)
  container.appendChild(sectionA)

  // Section B: How It Works
  const sectionB = createSection('how-it-works')
  const headlineB = document.createElement('h2')
  headlineB.className = 'section-headline'
  headlineB.style.cssText = 'text-align:center;font-size:clamp(1.5rem,3vw,2rem);font-weight:300;color:white;margin-bottom:2.5rem;letter-spacing:-0.01em;'
  headlineB.textContent = 'One agent. Six capabilities.'

  const grid = document.createElement('div')
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:2.5rem 2rem;max-width:900px;margin:0 auto;'
  grid.className = 'steps-grid-container'

  const steps = [
    { icon: 'chat', title: 'AI Treasury Agent', desc: '"Pay Alice 0.2 USDC, swap the rest to ETH." Claude interprets intent and executes multi-step operations autonomously.' },
    { icon: 'swap_horiz', title: 'Uniswap V3', desc: 'Swaps, liquidity, and price quotes routed on-chain. The agent finds optimal paths and handles slippage automatically.' },
    { icon: 'language', title: 'Cross-Chain via CCTP', desc: 'Move USDC across chains through Circle CCTP. Arc and Base connected — the agent picks the cheapest route.' },
    { icon: 'visibility_off', title: 'Private via Unlink', desc: 'Every transfer routes through Unlink. On-chain proof exists — but your strategy, amounts, and counterparties stay hidden.' },
    { icon: 'badge', title: 'ENS Resolution', desc: 'Send to alice.eth instead of raw addresses. The agent resolves ENS names on-chain before executing transfers.' },
    { icon: 'verified_user', title: 'Private Income Proofs', desc: 'Generate ZK-backed income verification from your on-chain history — prove earnings without revealing balances or counterparties.' },
  ]

  for (const step of steps) {
    const card = document.createElement('div')
    card.className = 'step-card'
    card.style.cssText = 'text-align:center;display:flex;flex-direction:column;align-items:center;gap:0.75rem;'

    const iconWrap = document.createElement('div')
    iconWrap.style.cssText = 'width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:50%;border:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);'

    const iconEl = document.createElement('span')
    iconEl.className = 'material-symbols-outlined'
    iconEl.style.cssText = 'color:#c8d8ff;font-size:1.25rem;'
    iconEl.textContent = step.icon

    iconWrap.appendChild(iconEl)

    const titleEl = document.createElement('h3')
    titleEl.style.cssText = 'color:white;font-weight:400;font-size:0.95rem;'
    titleEl.textContent = step.title

    const descEl = document.createElement('p')
    descEl.style.cssText = 'color:rgba(255,255,255,0.6);font-weight:300;font-size:0.75rem;line-height:1.5;'
    descEl.textContent = step.desc

    card.appendChild(iconWrap)
    card.appendChild(titleEl)
    card.appendChild(descEl)
    grid.appendChild(card)
  }

  const innerB = sectionB.querySelector('.section-inner') as HTMLElement
  innerB.appendChild(headlineB)
  innerB.appendChild(grid)
  container.appendChild(sectionB)

  // Section C: Dashboard Preview
  const sectionC = createSection('demo')
  const headlineC = document.createElement('h2')
  headlineC.className = 'section-headline'
  headlineC.style.cssText = 'font-size:clamp(1.5rem,3vw,2rem);font-weight:300;color:white;margin-bottom:0.5rem;letter-spacing:-0.01em;'
  headlineC.textContent = 'See it deliver.'

  const subtitleC = document.createElement('p')
  subtitleC.style.cssText = 'font-size:0.85rem;color:#666;margin-bottom:2rem;max-width:500px;'
  subtitleC.textContent = 'Real balances. Real payrolls. Real ZK proofs. All shielded via Unlink on Base Sepolia.'

  const dashboardFrame = document.createElement('div')
  dashboardFrame.className = 'demo-terminal terminal-glow'
  dashboardFrame.style.cssText = 'background:#0a0a0a;border:1px solid #222;border-radius:12px;overflow:hidden;'

  // Browser chrome header
  const browserHeader = document.createElement('div')
  browserHeader.style.cssText = 'display:flex;align-items:center;gap:6px;padding:10px 16px;background:#111;border-bottom:1px solid #222;'

  const colors = ['#ff5f56', '#ffbd2e', '#27c93f']
  for (const c of colors) {
    const dot = document.createElement('div')
    dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${c};opacity:0.5;`
    browserHeader.appendChild(dot)
  }

  const urlBar = document.createElement('div')
  urlBar.style.cssText = 'flex:1;margin:0 12px;padding:4px 12px;background:#0a0a0a;border:1px solid #222;border-radius:6px;font-size:0.65rem;color:#555;font-family:monospace;'
  urlBar.textContent = 'whisper.app/dashboard'
  browserHeader.appendChild(urlBar)

  // Dashboard screenshot
  const dashImg = document.createElement('img')
  dashImg.src = '/dashboard-preview.png'
  dashImg.alt = 'Whisper Dashboard — Private Treasury Manager'
  dashImg.style.cssText = 'width:100%;display:block;'
  dashImg.loading = 'lazy'

  dashboardFrame.appendChild(browserHeader)
  dashboardFrame.appendChild(dashImg)

  const innerC = sectionC.querySelector('.section-inner')!
  innerC.appendChild(headlineC)
  innerC.appendChild(subtitleC)
  innerC.appendChild(dashboardFrame)
  container.appendChild(sectionC)

  // Section D: Built With
  const sectionD = createSection('partners')
  sectionD.style.minHeight = '40vh'
  const headlineD = document.createElement('h2')
  headlineD.className = 'section-headline'
  headlineD.style.cssText = 'text-align:center;font-size:0.75rem;font-weight:300;color:#555;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:3rem;'
  headlineD.textContent = 'Built with'

  const logoRow = document.createElement('div')
  logoRow.className = 'logo-row'
  logoRow.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:3rem;flex-wrap:wrap;'

  const logos: { name: string; color: string; svg: string }[] = [
    { name: 'Uniswap', color: '#FF007A', svg: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.5 14.5c-1.5 0-2.7-.8-3.5-2-.8 1.2-2 2-3.5 2-2.5 0-4-2.5-3-5 .7-1.7 2-3 3.5-3.5.5-.2 1-.2 1.5 0 .3.1.5.3.7.5l.8 1 .8-1c.2-.2.4-.4.7-.5.5-.2 1-.2 1.5 0 1.5.5 2.8 1.8 3.5 3.5 1 2.5-.5 5-3 5z' },
    { name: 'Unlink', color: '#c8d8ff', svg: 'M17 7h-4v2h4c1.65 0 3 1.35 3 3s-1.35 3-3 3h-4v2h4c2.76 0 5-2.24 5-5s-2.24-5-5-5zm-6 8H7c-1.65 0-3-1.35-3-3s1.35-3 3-3h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-2z' },
    { name: 'Arc', color: '#ffffff', svg: 'M12 2L2 22h20L12 2zm0 4l7 14H5l7-14z' },
    { name: 'Claude', color: '#DA7756', svg: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3l1.5 4.5L18 11l-4.5 1.5L12 17l-1.5-4.5L6 11l4.5-1.5L12 5z' },
    { name: 'Base', color: '#0052FF', svg: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14v-2h6v-4h-6V8h-1c-2.76 0-5 2.24-5 5s2.24 5 5 5h1z' },
    { name: 'ENS', color: '#0080BC', svg: 'M5.5 3L2 12l3.5 9h2L4 12l3.5-9h-2zm7 0L9 12l3.5 9h2L11 12l3.5-9h-2zm7 0L16 12l3.5 9h2L18 12l3.5-9h-2z' },
  ]

  for (const l of logos) {
    const item = document.createElement('div')
    item.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:0.5rem;cursor:default;transition:opacity 0.3s;opacity:0.5;'
    item.addEventListener('mouseenter', () => { item.style.opacity = '1' })
    item.addEventListener('mouseleave', () => { item.style.opacity = '0.5' })

    const svgNS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(svgNS, 'svg')
    svg.setAttribute('width', '32')
    svg.setAttribute('height', '32')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('fill', l.color)
    const path = document.createElementNS(svgNS, 'path')
    path.setAttribute('d', l.svg)
    svg.appendChild(path)
    item.appendChild(svg)

    const label = document.createElement('span')
    label.style.cssText = 'font-size:0.7rem;font-weight:400;color:#555;letter-spacing:0.05em;'
    label.textContent = l.name
    item.appendChild(label)

    logoRow.appendChild(item)
  }

  const innerD = sectionD.querySelector('.section-inner')!
  innerD.appendChild(headlineD)
  innerD.appendChild(logoRow)
  container.appendChild(sectionD)

  // Section: Launch App CTA
  const sectionCTA = createSection('launch-cta')
  sectionCTA.style.minHeight = '60vh'
  sectionCTA.style.background = 'rgba(0,0,0,0.85)'

  const ctaInner = sectionCTA.querySelector('.section-inner') as HTMLElement
  ctaInner.style.cssText = 'max-width:900px;width:100%;display:flex;flex-direction:column;align-items:center;text-align:center;gap:2rem;'

  const ctaRule = document.createElement('div')
  ctaRule.className = 'section-rule'
  ctaRule.style.cssText = 'width:40px;height:1px;background:rgba(200,216,255,0.3);'

  const ctaHeadline = document.createElement('h2')
  ctaHeadline.className = 'section-headline'
  ctaHeadline.style.cssText = 'font-size:clamp(1.5rem,4vw,2.5rem);font-weight:300;color:rgba(255,255,255,0.95);line-height:1.2;letter-spacing:-0.02em;'
  ctaHeadline.textContent = 'Ready to whisper?'

  const ctaSub = document.createElement('p')
  ctaSub.className = 'section-body'
  ctaSub.style.cssText = 'color:rgba(255,255,255,0.55);font-size:clamp(0.9rem,1.2vw,1.05rem);font-weight:300;line-height:1.7;max-width:440px;'
  ctaSub.textContent = 'Step into the treasury agent. Speak plainly, move privately.'

  const ctaBtn = document.createElement('a')
  ctaBtn.href = '/dashboard'
  ctaBtn.className = 'section-body'
  ctaBtn.style.cssText = `
    display:inline-flex;align-items:center;gap:0.75rem;
    padding:1rem 2.5rem;
    background:rgba(200,216,255,0.08);
    border:1px solid rgba(200,216,255,0.15);
    border-radius:9999px;
    color:#c8d8ff;
    font-family:'Space Grotesk',sans-serif;
    font-size:0.95rem;font-weight:400;letter-spacing:0.05em;
    text-decoration:none;
    cursor:pointer;
    transition:all 0.4s ease;
    backdrop-filter:blur(8px);
  `
  ctaBtn.textContent = 'Launch App'

  const ctaArrow = document.createElement('span')
  ctaArrow.textContent = '→'
  ctaArrow.style.cssText = 'transition:transform 0.3s ease;display:inline-block;'
  ctaBtn.appendChild(ctaArrow)

  ctaBtn.addEventListener('mouseenter', () => {
    ctaBtn.style.background = 'rgba(200,216,255,0.15)'
    ctaBtn.style.borderColor = 'rgba(200,216,255,0.35)'
    ctaBtn.style.boxShadow = '0 0 30px rgba(200,216,255,0.1)'
    ctaArrow.style.transform = 'translateX(4px)'
  })
  ctaBtn.addEventListener('mouseleave', () => {
    ctaBtn.style.background = 'rgba(200,216,255,0.08)'
    ctaBtn.style.borderColor = 'rgba(200,216,255,0.15)'
    ctaBtn.style.boxShadow = 'none'
    ctaArrow.style.transform = 'translateX(0)'
  })

  ctaInner.appendChild(ctaRule)
  ctaInner.appendChild(ctaHeadline)
  ctaInner.appendChild(ctaSub)
  ctaInner.appendChild(ctaBtn)
  container.appendChild(sectionCTA)

  // Section F: Footer
  const footer = document.createElement('footer')
  footer.style.cssText = 'width:100%;padding:3rem 1.5rem;border-top:1px solid rgba(255,255,255,0.05);'
  footer.setAttribute('data-animate', '')

  const footerInner = document.createElement('div')
  footerInner.className = 'footer-inner'
  footerInner.style.cssText = 'max-width:900px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;'

  const footerText = document.createElement('span')
  footerText.style.cssText = 'color:#444;font-size:0.85rem;font-weight:300;'
  footerText.textContent = 'Built at ETHGlobal Cannes 2026'

  const footerLinks = document.createElement('div')
  footerLinks.style.cssText = 'display:flex;gap:2rem;'

  const footerLinkData = [
    { label: 'GitHub', href: 'https://github.com/0x2kNJ/whisper' },
    { label: 'Documentation', href: 'https://github.com/0x2kNJ/whisper#readme' },
  ]
  for (const { label, href } of footerLinkData) {
    const a = document.createElement('a')
    a.href = href
    a.target = '_blank'
    a.rel = 'noopener'
    a.style.cssText = 'color:#555;font-size:0.85rem;text-decoration:none;transition:color 0.3s;'
    a.textContent = label
    a.addEventListener('mouseenter', () => { a.style.color = '#c8d8ff' })
    a.addEventListener('mouseleave', () => { a.style.color = '#555' })
    footerLinks.appendChild(a)
  }

  footerInner.appendChild(footerText)
  footerInner.appendChild(footerLinks)
  footer.appendChild(footerInner)
  container.appendChild(footer)

  return container
}

function createSection(id: string): HTMLElement {
  const section = document.createElement('section')
  section.className = 'scroll-section'
  section.id = id
  section.setAttribute('data-animate', '')

  const inner = document.createElement('div')
  inner.className = 'section-inner'
  inner.style.cssText = 'max-width:900px;width:100%;'

  section.appendChild(inner)
  return section
}
