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
  headlineA.textContent = 'Every on-chain payment is a public confession.'

  const bodyA = document.createElement('div')
  bodyA.className = 'section-body'
  bodyA.style.cssText = 'max-width:600px;'

  const p1 = document.createElement('p')
  p1.style.cssText = 'color:#888;font-size:clamp(1rem,1.5vw,1.15rem);font-weight:300;line-height:1.7;margin-bottom:1rem;'
  p1.textContent = 'Treasury operations today are a structural liability. Every payroll run, vendor payment, and asset rebalancing is visible, trackable, and front-runnable by anyone with a block explorer.'

  const p2 = document.createElement('p')
  p2.style.cssText = 'color:#888;font-size:clamp(1rem,1.5vw,1.15rem);font-weight:300;line-height:1.7;'
  p2.textContent = 'Your strategy is public domain. Until now.'

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
  headlineB.style.cssText = 'text-align:center;font-size:clamp(1.5rem,3vw,2rem);font-weight:300;color:white;margin-bottom:4rem;letter-spacing:-0.01em;'
  headlineB.textContent = 'How it works'

  const grid = document.createElement('div')
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:3rem;'
  grid.className = 'steps-grid-container'

  const steps = [
    { icon: 'waves', title: 'Speak', desc: 'Tell Whisper what you need in plain English. AI handles the complexity.' },
    { icon: 'hub', title: 'Route', desc: 'AI finds optimal paths across chains and DEXes to minimize slippage.' },
    { icon: 'blur_on', title: 'Vanish', desc: 'Payments execute privately through Unlink. No public trace of your moves.' },
  ]

  for (const step of steps) {
    const card = document.createElement('div')
    card.className = 'step-card'
    card.style.cssText = 'text-align:center;display:flex;flex-direction:column;align-items:center;gap:1.5rem;'

    const iconWrap = document.createElement('div')
    iconWrap.style.cssText = 'width:64px;height:64px;display:flex;align-items:center;justify-content:center;border-radius:50%;border:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);'

    const iconEl = document.createElement('span')
    iconEl.className = 'material-symbols-outlined'
    iconEl.style.cssText = 'color:#c8d8ff;font-size:1.75rem;'
    iconEl.textContent = step.icon

    iconWrap.appendChild(iconEl)

    const titleEl = document.createElement('h3')
    titleEl.style.cssText = 'color:white;font-weight:400;font-size:1.15rem;'
    titleEl.textContent = step.title

    const descEl = document.createElement('p')
    descEl.style.cssText = 'color:#666;font-weight:300;font-size:0.9rem;line-height:1.6;max-width:220px;'
    descEl.textContent = step.desc

    card.appendChild(iconWrap)
    card.appendChild(titleEl)
    card.appendChild(descEl)
    grid.appendChild(card)
  }

  const innerB = sectionB.querySelector('.section-inner')!
  innerB.appendChild(headlineB)
  innerB.appendChild(grid)
  container.appendChild(sectionB)

  // Section C: Agent Demo
  const sectionC = createSection('demo')
  const headlineC = document.createElement('h2')
  headlineC.className = 'section-headline'
  headlineC.style.cssText = 'font-size:clamp(1.5rem,3vw,2rem);font-weight:300;color:white;margin-bottom:2rem;letter-spacing:-0.01em;'
  headlineC.textContent = 'See it think.'

  const terminal = document.createElement('div')
  terminal.className = 'demo-terminal terminal-glow'
  terminal.style.cssText = 'background:#0a0a0a;border:1px solid #222;border-radius:12px;overflow:hidden;'

  // Terminal header
  const termHeader = document.createElement('div')
  termHeader.style.cssText = 'display:flex;align-items:center;gap:6px;padding:12px 16px;background:#111;border-bottom:1px solid #222;'

  const colors = ['#ff5f56', '#ffbd2e', '#27c93f']
  for (const c of colors) {
    const dot = document.createElement('div')
    dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${c};opacity:0.5;`
    termHeader.appendChild(dot)
  }

  const termTitle = document.createElement('span')
  termTitle.style.cssText = 'font-size:0.625rem;color:#555;margin-left:auto;margin-right:auto;font-family:monospace;letter-spacing:0.15em;text-transform:uppercase;'
  termTitle.textContent = 'Whisper-Terminal-v1.0.4'
  termHeader.appendChild(termTitle)

  // Terminal body
  const termBody = document.createElement('div')
  termBody.id = 'demo-terminal-body'
  termBody.style.cssText = 'padding:1.5rem;font-family:"SF Mono","Fira Code",monospace;font-size:0.8rem;line-height:2;min-height:220px;'

  terminal.appendChild(termHeader)
  terminal.appendChild(termBody)

  const innerC = sectionC.querySelector('.section-inner')!
  innerC.appendChild(headlineC)
  innerC.appendChild(terminal)
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
  logoRow.style.cssText = 'display:flex;justify-content:center;gap:3rem;flex-wrap:wrap;'

  for (const name of ['Uniswap', 'Unlink', 'Arc', 'Claude', 'Base']) {
    const logo = document.createElement('span')
    logo.style.cssText = 'font-size:1.25rem;font-weight:500;color:#444;cursor:default;transition:color 0.3s;'
    logo.textContent = name
    logo.addEventListener('mouseenter', () => { logo.style.color = '#888' })
    logo.addEventListener('mouseleave', () => { logo.style.color = '#444' })
    logoRow.appendChild(logo)
  }

  const innerD = sectionD.querySelector('.section-inner')!
  innerD.appendChild(headlineD)
  innerD.appendChild(logoRow)
  container.appendChild(sectionD)

  // Section E: Footer
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

  for (const label of ['GitHub', 'Documentation', 'Twitter']) {
    const a = document.createElement('a')
    a.href = '#'
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
