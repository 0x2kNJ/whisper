import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

/** Combined film grain + vignette shader */
const FilmGrainVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grainIntensity: { value: 0.04 },
    vignetteOffset: { value: 0.9 },
    vignetteDarkness: { value: 1.3 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float grainIntensity;
    uniform float vignetteOffset;
    uniform float vignetteDarkness;
    varying vec2 vUv;

    float random(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Film grain
      float grain = random(vUv * time) * grainIntensity;
      color.rgb += grain;

      // Vignette
      vec2 uv = (vUv - vec2(0.5)) * vec2(vignetteOffset);
      float vig = clamp(
        pow(cos(uv.x * 3.14159), vignetteDarkness) *
        pow(cos(uv.y * 3.14159), vignetteDarkness),
        0.0, 1.0
      );
      color.rgb *= vig;

      gl_FragColor = color;
    }
  `,
}

export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera
): { composer: EffectComposer; update: (time: number) => void } {
  // Create render target with alpha so canvas stays transparent
  const renderTarget = new THREE.WebGLRenderTarget(
    window.innerWidth,
    window.innerHeight,
    {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
    }
  )
  const composer = new EffectComposer(renderer, renderTarget)
  composer.renderToScreen = true

  const renderPass = new RenderPass(scene, camera)
  renderPass.clear = true
  renderPass.clearAlpha = 0 // transparent background
  composer.addPass(renderPass)

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.5,  // strength
    0.4,  // radius
    0.85  // threshold
  )
  composer.addPass(bloomPass)

  const filmVignettePass = new ShaderPass(FilmGrainVignetteShader)
  composer.addPass(filmVignettePass)

  const outputPass = new OutputPass()
  composer.addPass(outputPass)

  function update(time: number) {
    filmVignettePass.uniforms.time.value = time
  }

  return { composer, update }
}
