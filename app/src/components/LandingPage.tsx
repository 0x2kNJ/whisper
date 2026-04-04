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

  const init = useCallback(async () => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    // Dynamic imports — keeps Three.js out of SSR bundle
    const THREE = await import('three')
    const scene = await import('@/lib/scene')
    const { createScrollSections } = await import('@/lib/ui/scrollSections')
    const { initScrollAnimations } = await import('@/lib/ui/scrollAnimations')
    const { initSmoothScroll } = await import('@/lib/ui/scrollController')

    // ── HERO IMAGE ──
    const heroImage = document.createElement('div')
    heroImage.id = 'hero-image'
    heroImage.style.cssText = `
      position: fixed; top: -2%; left: -2%; width: 104%; height: 104%;
      z-index: 0;
      background: url('/hero.png') center 35%/cover no-repeat;
      will-change: transform;
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
    cameraController.setHeroImage(heroImage)
    const clock = new THREE.Clock()

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
    tagline.textContent = 'Your treasury has a voice. Nobody else needs to hear it.'

    const enterBtn = document.createElement('button')
    enterBtn.id = 'enter-btn'
    enterBtn.textContent = 'Enter'

    introOverlay.appendChild(tagline)
    introOverlay.appendChild(enterBtn)
    container.appendChild(introOverlay)

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

    // Lock scroll initially
    document.body.style.overflow = 'hidden'

    // Scroll fade handler
    const handleScroll = () => {
      const progress = Math.min(window.scrollY / (window.innerHeight * 0.6), 1)
      heroText.style.opacity = String(1 - progress)
      canvas.style.opacity = String(1 - progress)

      const imgFadeStart = window.innerHeight * 3
      const imgFadeEnd = window.innerHeight * 6
      const imgProgress = Math.max(0, Math.min((window.scrollY - imgFadeStart) / (imgFadeEnd - imgFadeStart), 1))
      heroImage.style.opacity = String(1 - imgProgress)
      heroImage.style.transform = `translateY(${window.scrollY * 0.1}px) scale(1.05)`
    }
    window.addEventListener('scroll', handleScroll, { passive: true })

    // ── ENTER BUTTON ──
    const handleEnter = () => {
      introOverlay.style.opacity = '0'
      setTimeout(() => introOverlay.remove(), 3000)
      setTimeout(() => { document.body.style.overflow = '' }, 3000)
    }
    enterBtn.addEventListener('click', handleEnter)

    // ── CLEANUP ──
    cleanupRef.current = () => {
      cancelAnimationFrame(animFrameId)
      cancelAnimationFrame(lenisFrameId)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll)
      lenis.destroy()
      renderer.dispose()
      document.body.style.overflow = ''

      // Remove DOM elements we created
      heroImage.remove()
      introOverlay.remove()
      heroText.remove()
      scrollSections.remove()
    }
  }, [])

  useEffect(() => {
    init()
    return () => {
      cleanupRef.current?.()
    }
  }, [init])

  return (
    <div ref={containerRef} className="landing-root">
      <canvas ref={canvasRef} id="hero-canvas" />
    </div>
  )
}
