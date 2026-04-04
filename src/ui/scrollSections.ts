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

  // Section: Launch App CTA
  const sectionCTA = createSection('launch-cta')
  sectionCTA.style.minHeight = '60vh'
  sectionCTA.style.background = 'transparent'

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
  ctaSub.style.cssText = 'color:#666;font-size:clamp(0.9rem,1.2vw,1.05rem);font-weight:300;line-height:1.7;max-width:440px;'
  ctaSub.textContent = 'Step into the treasury agent. Speak plainly, move privately.'

  const ctaBtn = document.createElement('a')
  ctaBtn.href = 'http://localhost:3000/chat'
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

  // Section E: Transaction Proof
  const sectionE = createSection('proof')
  sectionE.style.minHeight = '50vh'
  const headlineE = document.createElement('h2')
  headlineE.className = 'section-headline'
  headlineE.style.cssText = 'text-align:center;font-size:0.75rem;font-weight:300;color:#555;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:2rem;'
  headlineE.textContent = 'Verified on-chain'

  const txTable = document.createElement('div')
  txTable.style.cssText = 'display:flex;flex-direction:column;gap:1rem;max-width:700px;margin:0 auto;'

  const txs = [
    { op: 'WhisperEscrow Deploy', chain: 'Arc', hash: '0x456920...', url: 'https://testnet.arcscan.app/tx/0x456920048561473645ab154bff913a19a0b6385717e0de4434810948ef98ff13' },
    { op: 'Payroll Escrow Created', chain: 'Arc', hash: '0x4919ff...', url: 'https://testnet.arcscan.app/tx/0x4919ffe66f56814cae1b9ebb6720d75a0d7cad58d501da6d6ce06ed38342b8b0' },
    { op: 'Encrypted Message', chain: 'Base Sepolia', hash: '0x012b69...', url: 'https://sepolia.basescan.org/tx/0x012b697a55077aadcf983147f7da4c496ee8b2d607f95c84b3c89474fa81d920' },
    { op: 'Uniswap Pool + Liquidity', chain: 'Base Sepolia', hash: '0xca5371...', url: 'https://sepolia.basescan.org/tx/0xca537191bbc62f1ed638df8e90a8a860fdad038febabf45814bbc909db020e85' },
    { op: 'WhisperVault Deploy', chain: 'Base Sepolia', hash: '0xe5a482...', url: 'https://sepolia.basescan.org/tx/0xe5a482bfc4ac30cd3ac2991b1de001efdf52081d2c34a11f3cdf8be1fba38197' },
  ]

  for (const tx of txs) {
    const row = document.createElement('a')
    row.href = tx.url
    row.target = '_blank'
    row.rel = 'noopener'
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:0.75rem 1rem;background:#0a0a0a;border:1px solid #222;border-radius:8px;text-decoration:none;transition:border-color 0.3s;cursor:pointer;'
    row.addEventListener('mouseenter', () => { row.style.borderColor = '#c8d8ff' })
    row.addEventListener('mouseleave', () => { row.style.borderColor = '#222' })

    const left = document.createElement('div')
    left.style.cssText = 'display:flex;flex-direction:column;gap:0.25rem;'

    const opName = document.createElement('span')
    opName.style.cssText = 'color:rgba(255,255,255,0.9);font-size:0.85rem;font-weight:400;'
    opName.textContent = tx.op

    const chainBadge = document.createElement('span')
    chainBadge.style.cssText = 'color:#666;font-size:0.7rem;'
    chainBadge.textContent = tx.chain

    left.appendChild(opName)
    left.appendChild(chainBadge)

    const hashEl = document.createElement('span')
    hashEl.style.cssText = 'color:#c8d8ff;font-family:monospace;font-size:0.75rem;'
    hashEl.textContent = tx.hash + ' →'

    row.appendChild(left)
    row.appendChild(hashEl)
    txTable.appendChild(row)
  }

  const innerE = sectionE.querySelector('.section-inner')!
  innerE.appendChild(headlineE)
  innerE.appendChild(txTable)
  container.appendChild(sectionE)

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
