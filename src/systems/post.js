import * as THREE from 'three';
import { EffectComposer } from '../../vendor/examples/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/examples/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/examples/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../../vendor/examples/postprocessing/ShaderPass.js';
import { OutputPass } from '../../vendor/examples/postprocessing/OutputPass.js';
import { clamp } from '../core/utils.js';


/**
 * Rete di sicurezza prima del bloom.
 *
 * Un solo pixel non finito (NaN o infinito) uscito da uno shader viene
 * sfocato dal bloom su mezzo fotogramma, e quel mezzo fotogramma diventa
 * nero. Qui i pixel malati si sostituiscono col nero e le alte luci si
 * limitano a un valore che il mezzo float regge: costa un passaggio a
 * schermo pieno e rende il resto della catena a prova di guasto.
 */
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // il confronto con se stesso e' falso solo per NaN
      c = mix(vec4(0.0, 0.0, 0.0, 1.0), c, vec4(equal(c, c)));
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 4096.0), c.a);
    }`,
};

/** Correzione colore finale: vignettatura, saturazione e un filo di grana. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 1.0 },
    vignette: { value: 0.9 },
    saturation: { value: 1.22 },
    warmth: { value: 0.025 },
    contrast: { value: 1.08 },
    lift: { value: 0.0 },
    time: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float vignette, saturation, warmth, contrast, lift, time;
    varying vec2 vUv;

    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      /*
       * NB: qui i colori sono ancora lineari e in alto dinamico. La curva
       * filmica la applica il renderer alla fine (OutputPass): rifarla qui
       * significherebbe schiacciare due volte l'immagine. Quindi ci si limita
       * a correggere colore e contrasto, senza tagliare le alte luci.
       */
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));

      // separazione di tinta: ombre verso il blu, luci verso l'ambra
      vec3 shadowTint = vec3(0.94, 0.98, 1.09);
      vec3 lightTint  = vec3(1.07, 1.02, 0.93);
      c.rgb *= mix(shadowTint, lightTint, smoothstep(0.02, 0.35, l));

      // contrasto attorno al grigio medio lineare (0.18, non 0.5)
      c.rgb = max(vec3(0.0), (c.rgb - 0.18) * contrast + 0.18 + lift);

      c.rgb = mix(vec3(dot(c.rgb, vec3(0.2126, 0.7152, 0.0722))), c.rgb, saturation);
      c.rgb *= vec3(1.0 + warmth, 1.0, 1.0 - warmth * 0.8);

      // vignettatura morbida, non un cerchio netto
      vec2 d = vUv - 0.5;
      float v = 1.0 - smoothstep(0.30, 0.80, length(d)) * 0.36;
      c.rgb *= mix(1.0, v, vignette);

      // grana appena percettibile
      float n = fract(sin(dot(vUv * (time + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (n - 0.5) * 0.012;

      gl_FragColor = vec4(max(c.rgb, 0.0), c.a);
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
    this.composer.addPass(new ShaderPass(SanitizeShader));
    /*
     * Il bloom c'e' sempre nella catena e non si disattiva mai: in questa
     * versione di three, spegnere un passaggio intermedio scombina lo scambio
     * dei buffer e lo schermo diventa nero. Per "spegnerlo" si azzera la
     * forza, che e' innocuo.
     */
    this.bloom = new UnrealBloomPass(size, 0.42, 0.85, 0.92);
    this.bloomOn = !!quality.bloom;
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  /** Di notte il bloom sale: neon e fari devono "bruciare" un po'. */
  /** Accende o spegne il bloom senza toccare la catena dei passaggi. */
  setBloom(on) { this.bloomOn = on; }

  setNight(k) {
    const n = clamp(k, 0, 1);
    if (this.bloom) this.bloom.strength = this.bloomOn ? 0.3 + n * 0.75 : 0;
    if (!this.grade) return;
    const u = this.grade.uniforms;
    u.warmth.value = 0.03 - n * 0.055;
    // di notte piu' contrasto e meno colore: le luci risaltano sul buio
    u.contrast.value = 1.08 + n * 0.1;
    u.saturation.value = 1.24 - n * 0.2;
    u.lift.value = n * 0.012;
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
