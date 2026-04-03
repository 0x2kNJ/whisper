import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'

export function createLighting(scene: THREE.Scene): void {
  RectAreaLightUniformsLib.init()

  // Primary rim light — behind and above, white-blue
  const rimLight = new THREE.RectAreaLight(0xc8d8ff, 15, 2, 3)
  rimLight.position.set(0, 1.5, -1.5)
  rimLight.lookAt(0, 0, 0)
  scene.add(rimLight)

  // Secondary rim — from below-right for edge definition
  const rimLight2 = new THREE.SpotLight(0xc8d8ff, 3)
  rimLight2.position.set(1.5, -0.5, -1)
  rimLight2.target.position.set(0, 0.2, 0)
  rimLight2.angle = Math.PI / 4
  rimLight2.penumbra = 0.8
  scene.add(rimLight2)
  scene.add(rimLight2.target)

  // Very faint ambient — just enough to hint at the figure
  const ambient = new THREE.AmbientLight(0x111111, 0.5)
  scene.add(ambient)
}
