import * as THREE from 'three'

/**
 * Creates animated smoke/fog planes that drift across the scene.
 * Uses procedural gradient textures with additive blending
 * to create volumetric-looking fog that moves over the hero image.
 */
export function createSmoke(scene: THREE.Scene): THREE.Mesh[] {
  const planes: THREE.Mesh[] = []

  // Procedural smoke texture via canvas
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  // Soft radial gradient — blue-white center fading to transparent
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  gradient.addColorStop(0, 'rgba(200, 216, 255, 0.18)')
  gradient.addColorStop(0.4, 'rgba(200, 216, 255, 0.08)')
  gradient.addColorStop(0.7, 'rgba(150, 180, 220, 0.03)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 256, 256)

  const texture = new THREE.CanvasTexture(canvas)

  // 8 smoke planes at varying depths and positions
  const configs = [
    { x: -1.5, y: 0.3, z: -0.5, scale: 4, opacity: 0.10, speed: 0.008 },
    { x: 1.2, y: -0.2, z: -0.8, scale: 3.5, opacity: 0.08, speed: 0.012 },
    { x: 0, y: 0.5, z: -0.3, scale: 5, opacity: 0.06, speed: 0.006 },
    { x: -0.8, y: -0.5, z: -1.0, scale: 3, opacity: 0.12, speed: 0.015 },
    { x: 2.0, y: 0.1, z: -0.6, scale: 4.5, opacity: 0.07, speed: 0.010 },
    { x: -2.0, y: 0.8, z: -0.4, scale: 3.8, opacity: 0.09, speed: 0.009 },
    { x: 0.5, y: -0.8, z: -1.2, scale: 3.2, opacity: 0.11, speed: 0.013 },
    { x: -0.3, y: 0.0, z: -0.2, scale: 6, opacity: 0.05, speed: 0.005 },
  ]

  for (const cfg of configs) {
    const geo = new THREE.PlaneGeometry(cfg.scale, cfg.scale * 0.6)
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: cfg.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(cfg.x, cfg.y, cfg.z)
    mesh.rotation.z = Math.random() * Math.PI * 2
    mesh.userData = {
      speed: cfg.speed,
      baseX: cfg.x,
      baseY: cfg.y,
      baseOpacity: cfg.opacity,
      phaseX: Math.random() * Math.PI * 2,
      phaseY: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.003,
    }
    scene.add(mesh)
    planes.push(mesh)
  }

  return planes
}

export function updateSmoke(planes: THREE.Mesh[], time: number): void {
  for (const plane of planes) {
    const { speed, baseX, baseY, baseOpacity, phaseX, phaseY, rotSpeed } = plane.userData

    // Slow drift — figure-eight-ish movement
    plane.position.x = baseX + Math.sin(time * speed * 3 + phaseX) * 0.8
    plane.position.y = baseY + Math.cos(time * speed * 2 + phaseY) * 0.4

    // Slow rotation
    plane.rotation.z += rotSpeed

    // Opacity pulse
    const mat = plane.material as THREE.MeshBasicMaterial
    mat.opacity = baseOpacity + Math.sin(time * speed * 5 + phaseX) * baseOpacity * 0.3
  }
}
