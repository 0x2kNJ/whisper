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

}
