import Lenis from 'lenis'

export function initSmoothScroll(): Lenis {
  const lenis = new Lenis({
    duration: 1.2,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  })
  return lenis
}

/**
 * Fades out the hero canvas + overlay as user scrolls down.
 * Also applies parallax to the hero image.
 */
export function initHeroFade(
  canvas: HTMLCanvasElement,
  overlay: HTMLElement,
  heroImage: HTMLElement
): void {
  const handleScroll = () => {
    const scrollY = window.scrollY
    const vh = window.innerHeight

    // Text overlay + canvas effects fade quickly (within first 60vh)
    const textProgress = Math.min(scrollY / (vh * 0.6), 1)
    canvas.style.opacity = String(1 - textProgress)
    overlay.style.opacity = String(1 - textProgress)

    // Hero image persists almost the entire page — doesn't start fading
    // until 3 full viewports of scroll, then fades over the next 3vh
    const imgFadeStart = vh * 3.0
    const imgFadeEnd = vh * 6.0
    const imgProgress = Math.max(0, Math.min((scrollY - imgFadeStart) / (imgFadeEnd - imgFadeStart), 1))
    heroImage.style.opacity = String(1 - imgProgress)

    // Very slow parallax so image stays centered longer
    const translateY = scrollY * 0.1
    heroImage.style.transform = `translateY(${translateY}px) scale(1.05)`
  }

  window.addEventListener('scroll', handleScroll, { passive: true })
}
