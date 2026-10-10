import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Effetti "da ripresa TV" sull'immagine finale (solo con grafica alta):
// - bagliore sulle luci forti (sole, scintille, freni roventi, led)
// - colori da trasmissione: contrasto, saturazione, ombre fredde e luci calde
// - vignettatura, leggera aberrazione cromatica ai bordi, grana fine
// - sfocatura radiale in velocità (il bordo dello schermo "scorre")
// L'immagine viene disegnata in HDR con antialiasing (MSAA) e poi convertita.

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uSpeed: { value: 0 },
    uWarm: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uSpeed, uWarm, uAspect; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r = length(c * vec2(uAspect, 1.0));
      // sfocatura radiale in velocità: solo verso i bordi, il centro resta nitido
      vec3 col = vec3(0.0);
      float k = uSpeed * smoothstep(0.25, 0.9, r) * 0.035;
      for (int i = 0; i < 6; i++) {
        float t = float(i) / 5.0;
        vec2 uv = vUv - c * k * t;
        // aberrazione cromatica ai bordi
        vec2 ca = c * 0.0022 * smoothstep(0.3, 1.0, r);
        col += vec3(texture2D(tDiffuse, uv + ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - ca).b);
      }
      col /= 6.0;
      // colori da trasmissione
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.12);                                    // saturazione
      col = (col - 0.5) * 1.06 + 0.5;                                  // contrasto
      vec3 shadowT = mix(vec3(0.96, 1.0, 1.05), vec3(0.98, 1.0, 1.04), uWarm);
      vec3 lightT = mix(vec3(1.03, 1.0, 0.97), vec3(1.07, 1.0, 0.92), uWarm);
      col *= mix(shadowT, lightT, smoothstep(0.1, 0.8, l));
      // vignettatura e grana
      col *= 1.0 - 0.32 * smoothstep(0.45, 1.05, r);
      col += (h(vUv * 1000.0 + uTime) - 0.5) * 0.018;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera, opts = {}) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.render = new RenderPass(scene, camera);
    this.composer.addPass(this.render);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), opts.bloom ?? 0.32, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uWarm.value = opts.warm ?? 0;
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.speed = 0;
  }
  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.grade.uniforms.uAspect.value = w / h;
  }
  // speed: 0..1 (quanto si vede la sfocatura in velocità)
  draw(dt, camera, speed = 0) {
    this.render.camera = camera;
    this.speed += (speed - this.speed) * Math.min(1, dt * 3);
    this.grade.uniforms.uSpeed.value = this.speed;
    this.grade.uniforms.uTime.value = (this.grade.uniforms.uTime.value + dt) % 100;
    this.composer.render(dt);
  }
}
