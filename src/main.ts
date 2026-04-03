import './style.css'
import * as THREE from 'three'
import {
  createScene,
  createCamera,
  createRenderer,
  createLighting,
  createPostProcessing,
  createSmoke,
  updateSmoke,
  createParticles,
  updateParticles,
  CameraController,
} from './scene'
import { createScrollSections } from './ui/scrollSections'
import { initScrollAnimations } from './ui/scrollAnimations'
import { initSmoothScroll } from './ui/scrollController'

// ============================================
// HERO IMAGE — always visible, sits at the bottom of the stack
// ============================================
const heroImage = document.createElement('div')
heroImage.id = 'hero-image'
heroImage.style.cssText = `
  position: fixed; top: -2%; left: -2%; width: 104%; height: 104%;
  z-index: 0;
  background: url('/hero.png') center 35%/cover no-repeat;
  will-change: transform;
`
document.body.prepend(heroImage)

// ============================================
// THREE.JS CANVAS
// ============================================
const canvas = document.getElementById('hero-canvas') as HTMLCanvasElement
canvas.style.cssText = `
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  z-index: 1; pointer-events: none; background: transparent;
`
const renderer = createRenderer(canvas)
const scene = createScene()
const camera = createCamera()
createLighting(scene)
const smokePlanes = createSmoke(scene)
const particles = createParticles(scene)
const { composer, update: updatePostProcessing } = createPostProcessing(renderer, scene, camera)
const cameraController = new CameraController(camera)
cameraController.setHeroImage(heroImage)
const clock = new THREE.Clock()

function animate() {
  requestAnimationFrame(animate)
  const elapsed = clock.getElapsedTime()
  cameraController.update(elapsed)
  updateSmoke(smokePlanes, elapsed)
  updateParticles(particles, elapsed)
  updatePostProcessing(elapsed)
  renderer.clear()
  composer.render()
}
animate()

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer.setSize(window.innerWidth, window.innerHeight)
})

// ============================================
// INTRO OVERLAY — white rectangle on TOP of everything
// Contains black "Whisper" text + Enter button
// On click: this white rectangle fades opacity to 0
// revealing the dark hero.png that was always behind it
// Text color transitions black→white simultaneously
// ============================================
const introOverlay = document.createElement('div')
introOverlay.id = 'intro-overlay'

const title = document.createElement('h1')
title.id = 'main-title'
title.textContent = 'Whisper'

const tagline = document.createElement('p')
tagline.id = 'main-tagline'
tagline.textContent = 'Your treasury has a voice. Nobody else needs to hear it.'

const enterBtn = document.createElement('button')
enterBtn.id = 'enter-btn'
enterBtn.textContent = 'Enter'

introOverlay.appendChild(tagline)
introOverlay.appendChild(enterBtn)
document.body.appendChild(introOverlay)

// ============================================
// PERSISTENT WHITE TEXT — sits behind intro overlay
// Same position as intro text but white colored
// Visible after intro overlay fades out
// ============================================
const heroText = document.createElement('div')
heroText.id = 'hero-text'

const heroTitle = document.createElement('h1')
heroTitle.className = 'hero-title-text'
heroTitle.textContent = 'Whisper'

heroText.appendChild(heroTitle)
document.body.appendChild(heroText)

// ============================================
// SCROLL SECTIONS
// ============================================
document.body.appendChild(createScrollSections())
requestAnimationFrame(() => initScrollAnimations())

const lenis = initSmoothScroll()
function raf(time: number) {
  lenis.raf(time)
  requestAnimationFrame(raf)
}
requestAnimationFrame(raf)

// Lock scroll
document.body.style.overflow = 'hidden'

// Fade hero text + hero image on scroll
window.addEventListener('scroll', () => {
  const progress = Math.min(window.scrollY / (window.innerHeight * 0.6), 1)
  heroText.style.opacity = String(1 - progress)
  canvas.style.opacity = String(1 - progress)

  const imgFadeStart = window.innerHeight * 3
  const imgFadeEnd = window.innerHeight * 6
  const imgProgress = Math.max(0, Math.min((window.scrollY - imgFadeStart) / (imgFadeEnd - imgFadeStart), 1))
  heroImage.style.opacity = String(1 - imgProgress)
  heroImage.style.transform = `translateY(${window.scrollY * 0.1}px) scale(1.05)`
}, { passive: true })

// ============================================
// CLICK ENTER — fade out the white intro overlay
// The dark hero + white text are already behind it
// ============================================
enterBtn.addEventListener('click', () => {
  // Fade out intro overlay — reveals dark hero + white Whisper
  introOverlay.style.opacity = '0'

  setTimeout(() => {
    introOverlay.remove()
  }, 3000)

  // Enable scroll after transition completes — user scrolls manually
  setTimeout(() => {
    document.body.style.overflow = ''
  }, 3000)
})
