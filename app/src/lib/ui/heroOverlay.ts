/**
 * Creates the hero overlay with title, tagline, and scroll indicator.
 * Positioned on top of the hero image + Three.js canvas.
 */
export function createHeroOverlay(): HTMLElement {
  const overlay = document.createElement('div')
  overlay.id = 'hero-overlay'

  const content = document.createElement('div')
  content.className = 'hero-content'

  const badge = document.createElement('div')
  badge.className = 'hero-badge'
  badge.textContent = 'Stealth Mode Activated'

  const title = document.createElement('h1')
  title.className = 'hero-title'
  title.textContent = 'Whisper'

  const tagline = document.createElement('p')
  tagline.className = 'hero-tagline'
  tagline.textContent = 'Your treasury has a voice. Nobody else needs to hear it.'

  content.appendChild(badge)
  content.appendChild(title)
  content.appendChild(tagline)
  overlay.appendChild(content)

  // Scroll indicator
  const scrollDiv = document.createElement('div')
  scrollDiv.className = 'scroll-indicator'

  const scrollText = document.createElement('span')
  scrollText.className = 'scroll-text'
  scrollText.textContent = 'scroll'

  const chevronDiv = document.createElement('div')
  chevronDiv.className = 'scroll-chevron'
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '24')
  svg.setAttribute('height', '24')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.5')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M6 9l6 6 6-6')
  svg.appendChild(path)
  chevronDiv.appendChild(svg)

  scrollDiv.appendChild(scrollText)
  scrollDiv.appendChild(chevronDiv)
  overlay.appendChild(scrollDiv)

  return overlay
}
