import * as THREE from 'three'

export function createCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  )
  camera.position.set(0, 0.2, 3.5)
  camera.lookAt(0, 0.2, 0)
  return camera
}
