'use client'

import { useEffect, useRef, useCallback } from 'react'

/**
 * LandingPage — wraps the entire Vite landing experience as a React component.
 * All Three.js + DOM manipulation runs client-side inside useEffect.
 * Uses dynamic imports to avoid SSR issues with Three.js / Lenis.
 */
export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const init = useCallback(async (signal: { aborted: boolean }) => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    // Force scroll to top on load (browser preserves position on refresh)
    window.scrollTo(0, 0)
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }

    // Dynamic imports — keeps Three.js out of SSR bundle
    const THREE = await import('three')
    const scene = await import('@/lib/scene')
    const { createScrollSections } = await import('@/lib/ui/scrollSections')
    const { initScrollAnimations } = await import('@/lib/ui/scrollAnimations')
    const { initSmoothScroll } = await import('@/lib/ui/scrollController')

    // ── HERO IMAGE (static, no parallax) ──
    const heroImage = document.createElement('div')
    heroImage.id = 'hero-image'
    heroImage.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      z-index: 0;
      background: url('/hero.png') center 35%/cover no-repeat;
    `
    container.prepend(heroImage)

    // ── THREE.JS CANVAS ──
    canvas.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      z-index: 1; pointer-events: none; background: transparent;
    `
    const renderer = scene.createRenderer(canvas)
    const threeScene = scene.createScene()
    const camera = scene.createCamera()
    scene.createLighting(threeScene)
    const smokePlanes = scene.createSmoke(threeScene)
    const particles = scene.createParticles(threeScene)
    const { composer, update: updatePostProcessing } = scene.createPostProcessing(renderer, threeScene, camera)
    const cameraController = new scene.CameraController(camera)
    const clock = new THREE.Clock()

    // Abort if strict mode unmounted us during async init
    if (signal.aborted) return

    let animFrameId: number
    function animate() {
      animFrameId = requestAnimationFrame(animate)
      const elapsed = clock.getElapsedTime()
      cameraController.update(elapsed)
      scene.updateSmoke(smokePlanes, elapsed)
      scene.updateParticles(particles, elapsed)
      updatePostProcessing(elapsed)
      renderer.clear()
      composer.render()
    }
    animate()

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
      composer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', handleResize)

    // ── INTRO OVERLAY ──
    const introOverlay = document.createElement('div')
    introOverlay.id = 'intro-overlay'

    const tagline = document.createElement('p')
    tagline.id = 'main-tagline'
    tagline.textContent = ''

    const enterBtn = document.createElement('button')
    enterBtn.id = 'enter-btn'
    enterBtn.textContent = 'Enter'
    enterBtn.style.opacity = '0'
    enterBtn.style.transition = 'opacity 0.5s ease'

    introOverlay.appendChild(tagline)
    introOverlay.appendChild(enterBtn)
    container.appendChild(introOverlay)

    // Typewriter animation — fast letter roll-in
    const taglineText = 'Move capital with a whisper.'
    let charIndex = 0
    const typeInterval = setInterval(() => {
      tagline.textContent = taglineText.slice(0, ++charIndex)
      if (charIndex >= taglineText.length) {
        clearInterval(typeInterval)
        // Show enter button after typewriter completes
        setTimeout(() => { enterBtn.style.opacity = '1' }, 300)
      }
    }, 40)

    // ── PERSISTENT HERO TEXT ──
    const heroText = document.createElement('div')
    heroText.id = 'hero-text'

    const heroTitle = document.createElement('h1')
    heroTitle.className = 'hero-title-text'
    heroTitle.textContent = 'Whisper'

    heroText.appendChild(heroTitle)
    container.appendChild(heroText)

    // ── SCROLL SECTIONS ──
    const scrollSections = createScrollSections()
    container.appendChild(scrollSections)
    requestAnimationFrame(() => initScrollAnimations())

    const lenis = initSmoothScroll()
    let lenisFrameId: number
    function raf(time: number) {
      lenis.raf(time)
      lenisFrameId = requestAnimationFrame(raf)
    }
    lenisFrameId = requestAnimationFrame(raf)

    // Lock scroll initially (may be unlocked by skip-intro below)
    document.body.style.overflow = 'hidden'

    // Scroll fade handler
    const handleScroll = () => {
      const progress = Math.min(window.scrollY / (window.innerHeight * 0.6), 1)
      heroText.style.opacity = String(1 - progress)
      // Hide scroll indicator only at the very bottom (footer)
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      if (window.scrollY > maxScroll - 100) {
        scrollIndicator.style.opacity = '0'
      } else if (scrollIndicator.style.opacity === '0' && window.scrollY < maxScroll - 100) {
        scrollIndicator.style.opacity = '1'
      }
      canvas.style.opacity = String(1 - progress)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })

    // ── FLOATING NAV — appears after intro fades ──
    const floatingNav = document.createElement('nav')
    floatingNav.id = 'floating-nav'
    floatingNav.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0;
      z-index: 100;
      display: flex; align-items: center; justify-content: space-between;
      padding: 1.25rem 2rem;
      opacity: 0;
      transform: translateY(-10px);
      transition: opacity 0.6s ease, transform 0.6s ease, background 0.4s ease;
      pointer-events: none;
      background: transparent;
    `

    const navLeft = document.createElement('div')
    navLeft.style.cssText = 'display:flex;align-items:center;gap:0.6rem;'

    const navLogo = document.createElement('div')
    navLogo.style.cssText = `
      width:28px;height:28px;border-radius:50%;
      border:1px solid rgba(200,216,255,0.15);
      background:rgba(10,10,15,0.6);
      display:flex;align-items:center;justify-content:center;
      font-size:10px;font-weight:700;color:#c8d8ff;
      letter-spacing:0.1em;font-family:'Space Grotesk',sans-serif;
    `
    navLogo.textContent = 'W'

    const navTitle = document.createElement('span')
    navTitle.style.cssText = 'font-size:0.85rem;font-weight:500;color:white;font-family:"Space Grotesk",sans-serif;letter-spacing:0.02em;'
    navTitle.textContent = 'Whisper'

    navLeft.appendChild(navLogo)
    navLeft.appendChild(navTitle)

    const navRight = document.createElement('div')
    navRight.style.cssText = 'display:flex;align-items:center;gap:1rem;'

    const navCta = document.createElement('a')
    navCta.href = '/chat'
    navCta.style.cssText = `
      display:inline-flex;align-items:center;gap:0.5rem;
      padding:0.5rem 1.25rem;
      background:rgba(200,216,255,0.08);
      border:1px solid rgba(200,216,255,0.15);
      border-radius:9999px;
      color:#c8d8ff;
      font-family:'Space Grotesk',sans-serif;
      font-size:0.8rem;font-weight:400;letter-spacing:0.05em;
      text-decoration:none;
      cursor:pointer;
      transition:all 0.3s ease;
    `
    navCta.textContent = 'Launch App'

    const navArrow = document.createElement('span')
    navArrow.textContent = '→'
    navArrow.style.cssText = 'transition:transform 0.3s;display:inline-block;font-size:0.85rem;'
    navCta.appendChild(navArrow)

    navCta.addEventListener('mouseenter', () => {
      navCta.style.background = 'rgba(200,216,255,0.15)'
      navCta.style.borderColor = 'rgba(200,216,255,0.35)'
      navCta.style.boxShadow = '0 0 20px rgba(200,216,255,0.08)'
      navArrow.style.transform = 'translateX(3px)'
    })
    navCta.addEventListener('mouseleave', () => {
      navCta.style.background = 'rgba(200,216,255,0.08)'
      navCta.style.borderColor = 'rgba(200,216,255,0.15)'
      navCta.style.boxShadow = 'none'
      navArrow.style.transform = 'translateX(0)'
    })

    navRight.appendChild(navCta)
    floatingNav.appendChild(navLeft)
    floatingNav.appendChild(navRight)
    container.appendChild(floatingNav)

    // ── SCROLL INDICATOR ──
    const scrollIndicator = document.createElement('div')
    scrollIndicator.id = 'scroll-indicator'
    const svgNS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(svgNS, 'svg')
    svg.setAttribute('width', '36')
    svg.setAttribute('height', '36')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'rgba(255,255,255,0.85)')
    svg.setAttribute('stroke-width', '2')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    const polyline = document.createElementNS(svgNS, 'polyline')
    polyline.setAttribute('points', '6 9 12 15 18 9')
    svg.appendChild(polyline)
    scrollIndicator.appendChild(svg)
    scrollIndicator.style.cssText = `
      position: fixed; bottom: 1.1rem; left: 50%;
      transform: translateX(-50%);
      z-index: 10; opacity: 0; cursor: pointer;
      animation: scrollBounce 2s ease-in-out infinite;
      transition: opacity 0.6s ease;
    `
    scrollIndicator.addEventListener('click', () => {
      // Unlock scroll in case it's still locked from intro
      document.body.style.overflow = ''
      // Find all scroll sections and determine which one to scroll to next
      const sections = container.querySelectorAll('.scroll-section')
      const currentScroll = window.scrollY + window.innerHeight
      for (const section of Array.from(sections)) {
        const rect = (section as HTMLElement).getBoundingClientRect()
        const sectionTop = rect.top + window.scrollY
        if (sectionTop > currentScroll - 100) {
          window.scrollTo({ top: sectionTop, behavior: 'smooth' })
          return
        }
      }
      // Fallback: scroll one viewport
      window.scrollTo({ top: window.scrollY + window.innerHeight, behavior: 'smooth' })
    })
    container.appendChild(scrollIndicator)

    // ── ENTER BUTTON ──
    const handleEnter = () => {
      // Instantly hide tagline and button
      tagline.style.display = 'none'
      enterBtn.style.display = 'none'

      // White background fades out normally
      introOverlay.style.opacity = '0'

      // Show scroll indicator after reveal
      setTimeout(() => {
        scrollIndicator.style.opacity = '1'
      }, 1000)

      // Show floating nav after intro fades
      setTimeout(() => {
        floatingNav.style.opacity = '1'
        floatingNav.style.transform = 'translateY(0)'
        floatingNav.style.pointerEvents = 'auto'
      }, 1500)

      setTimeout(() => introOverlay.remove(), 3000)
      setTimeout(() => { document.body.style.overflow = '' }, 1000)
    }
    enterBtn.addEventListener('click', handleEnter)

    // Add glass background to nav when scrolled
    const handleNavScroll = () => {
      if (window.scrollY > 50) {
        floatingNav.style.background = 'rgba(0,0,0,0.6)'
        floatingNav.style.backdropFilter = 'blur(20px)'
        ;(floatingNav.style as unknown as Record<string, string>).webkitBackdropFilter = 'blur(20px)'
        floatingNav.style.borderBottom = '1px solid rgba(255,255,255,0.04)'
      } else {
        floatingNav.style.background = 'transparent'
        floatingNav.style.backdropFilter = 'none'
        ;(floatingNav.style as unknown as Record<string, string>).webkitBackdropFilter = 'none'
        floatingNav.style.borderBottom = 'none'
      }
    }
    window.addEventListener('scroll', handleNavScroll, { passive: true })

    // Skip intro if coming from chat (via ?skip-intro)
    if (window.location.search.includes('skip-intro')) {
      introOverlay.remove()
      clearInterval(typeInterval)
      document.body.style.overflow = ''
      floatingNav.style.opacity = '1'
      floatingNav.style.transform = 'translateY(0)'
      floatingNav.style.pointerEvents = 'auto'
      scrollIndicator.style.opacity = '1'
      window.history.replaceState({}, '', '/')
    }

    // ── CLEANUP ──
    cleanupRef.current = () => {
      cancelAnimationFrame(animFrameId)
      cancelAnimationFrame(lenisFrameId)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('scroll', handleNavScroll)
      lenis.destroy()
      renderer.dispose()
      document.body.style.overflow = ''

      // Remove DOM elements we created
      heroImage.remove()
      scrollIndicator.remove()
      introOverlay.remove()
      heroText.remove()
      scrollSections.remove()
      floatingNav.remove()
    }
  }, [])

  useEffect(() => {
    const signal = { aborted: false }
    init(signal)
    return () => {
      signal.aborted = true
      cleanupRef.current?.()
    }
  }, [init])

  return (
    <div ref={containerRef} className="landing-root">
      <canvas ref={canvasRef} id="hero-canvas" />
    </div>
  )
}
