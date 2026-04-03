import * as THREE from 'three'

/**
 * Handles mouse parallax on both the Three.js camera
 * and the hero background image for a layered depth effect.
 */
export class CameraController {
  private camera: THREE.PerspectiveCamera
  private mouse = new THREE.Vector2(0, 0)
  private smoothMouse = new THREE.Vector2(0, 0)
  private heroImage: HTMLElement | null = null

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera

    window.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
    })

    // Mobile gyroscope
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', (e) => {
        if (e.gamma !== null && e.beta !== null) {
          this.mouse.x = THREE.MathUtils.clamp(e.gamma / 30, -1, 1)
          this.mouse.y = THREE.MathUtils.clamp((e.beta - 60) / 30, -1, 1)
        }
      })
    }
  }

  setHeroImage(el: HTMLElement) {
    this.heroImage = el
  }

  update(_time: number): void {
    // Smooth follow
    this.smoothMouse.x += (this.mouse.x - this.smoothMouse.x) * 0.05
    this.smoothMouse.y += (this.mouse.y - this.smoothMouse.y) * 0.05

    // Camera parallax (particles/smoke shift)
    this.camera.position.x = this.smoothMouse.x * 0.15
    this.camera.position.y = 0.2 + this.smoothMouse.y * 0.1
    this.camera.lookAt(0, 0.2, 0)

    // Hero image parallax (moves opposite direction, subtler)
    if (this.heroImage) {
      const imgX = -this.smoothMouse.x * 15
      const imgY = this.smoothMouse.y * 10
      this.heroImage.style.transform = `translate(${imgX}px, ${imgY}px) scale(1.05)`
    }
  }
}
