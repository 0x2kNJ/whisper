import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'

const DRACO_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/'

export async function loadModel(url: string): Promise<THREE.Group> {
  const loader = new GLTFLoader()

  const draco = new DRACOLoader()
  draco.setDecoderPath(DRACO_PATH)
  loader.setDRACOLoader(draco)

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene

        // Center and normalize the model
        const box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        const scale = 2.0 / maxDim
        model.scale.setScalar(scale)
        model.position.sub(center.multiplyScalar(scale))

        // Position slightly left of center for text space on right
        model.position.x -= 0.3

        // Tweak materials for cinematic look
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true
            child.receiveShadow = true
            if (child.material) {
              const m = child.material as THREE.MeshStandardMaterial
              if (m.roughness !== undefined) {
                m.roughness = Math.max(m.roughness, 0.5)
                m.metalness = Math.min(m.metalness ?? 0.1, 0.3)
              }
            }
          }
        })

        resolve(model)
      },
      undefined,
      reject
    )
  })
}

export function createFallbackSphere(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(0.5, 64, 64)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x444444,
    roughness: 0.5,
    metalness: 0.1,
  })
  const sphere = new THREE.Mesh(geo, mat)
  sphere.position.set(-0.3, 0.2, 0)
  return sphere
}
