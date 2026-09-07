import * as THREE from 'three';
import { EffectComposer } from '../../vendor/examples/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/examples/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/examples/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../../vendor/examples/postprocessing/ShaderPass.js';
import { OutputPass } from '../../vendor/examples/postprocessing/OutputPass.js';
import { clamp } from '../core/utils.js';

/** Correzione colore finale: vignettatura, saturazione e un filo di grana. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 1.0 },
    vignette: { value: 0.9 },
    saturation: { value: 1.12 },
    warmth: { value: 0.025 },
    time: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float vignette, saturation, warmth, time;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // saturazione
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      // dominante calda tipica del sud della California (moltiplicativa:
      // non solleva i neri, che altrimenti diventano marroni)
      c.rgb *= vec3(1.0 + warmth, 1.0, 1.0 - warmth * 0.8);
      // vignettatura
      vec2 d = vUv - 0.5;
      c.rgb *= mix(1.0, 1.0 - dot(d, d) * 1.25, vignette);
      // grana appena percettibile
      float n = fract(sin(dot(vUv * (time + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (n - 0.5) * 0.016;
      gl_FragColor = c;
    }`,
};

export class Post {
  constructor(renderer, scene, camera, quality) {
    this.hasPasses = quality.grade;
    this.enabled = this.hasPasses;
    this.quality = quality;
    if (!this.enabled) return;
    const size = renderer.getSize(new THREE.Vector2());
    const dpr = renderer.getPixelRatio();
    /*
     * Un solo render target, della stessa identica dimensione del canvas.
     * Multicampione e supercampionamento vogliono un target di misura
     * diversa, e in quel caso il composer disegna solo una porzione di
     * schermo: e' il bug del "mezzo schermo nero" visto su alcune schede.
     */
    const rt = new THREE.WebGLRenderTarget(
      Math.max(2, Math.round(size.width * dpr)), Math.max(2, Math.round(size.height * dpr)),
      { type: THREE.HalfFloatType }
    );
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(size.width, size.height);
    this.composer.addPass(new RenderPass(scene, camera));
    // il bloom viene sempre creato ma si accende solo al livello massimo
    this.bloom = new UnrealBloomPass(size, 0.42, 0.85, 0.92);
    this.bloom.enabled = !!quality.bloom;
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  /** Di notte il bloom sale: neon e fari devono "bruciare" un po'. */
  setNight(k) {
    if (this.bloom) this.bloom.strength = 0.3 + clamp(k, 0, 1) * 0.75;
    if (this.grade) this.grade.uniforms.warmth.value = 0.03 - clamp(k, 0, 1) * 0.055;
  }

  setSize(w, h, pixelRatio) {
    if (!this.composer) return;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }

  render(dt) {
    if (this.grade) this.grade.uniforms.time.value += dt;
    this.composer.render(dt);
  }
}
