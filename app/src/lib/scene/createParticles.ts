import * as THREE from 'three'

/**
 * Creates floating luminous point particles that drift upward
 * through the scene like dust in a beam of light.
 */
export function createParticles(scene: THREE.Scene, count = 200): THREE.Points {
  const positions = new Float32Array(count * 3)
  const opacities = new Float32Array(count)
  const sizes = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 6
    positions[i * 3 + 1] = (Math.random() - 0.5) * 4
    positions[i * 3 + 2] = (Math.random() - 0.5) * 3
    opacities[i] = Math.random()
    sizes[i] = 0.5 + Math.random() * 1.5
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xfff8f0) },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: `
      attribute float aOpacity;
      attribute float aSize;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vOpacity;

      void main() {
        vec3 pos = position;

        // Gentle upward drift
        pos.y += uTime * 0.015;
        // Sine-based horizontal wandering
        pos.x += sin(uTime * 0.2 + position.z * 2.0) * 0.08;
        pos.z += cos(uTime * 0.15 + position.x * 1.5) * 0.04;

        // Wrap vertically
        pos.y = mod(pos.y + 2.0, 4.0) - 2.0;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = aSize * uPixelRatio * (1.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;

        // Opacity fluctuates gently
        vOpacity = aOpacity * (0.15 + 0.15 * sin(uTime * 0.8 + aOpacity * 6.28));
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vOpacity;

      void main() {
        // Soft glowing circle
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float alpha = smoothstep(0.5, 0.0, d) * vOpacity;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const points = new THREE.Points(geometry, material)
  scene.add(points)
  return points
}

export function updateParticles(points: THREE.Points, time: number): void {
  const mat = points.material as THREE.ShaderMaterial
  mat.uniforms.uTime.value = time
}
