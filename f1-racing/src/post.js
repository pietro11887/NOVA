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

// raggi di sole che filtrano tra i palazzi: si "trascinano" le parti più luminose verso il sole
const RaysShader = {
  uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uStr: { value: 0 }, uAspect: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uStr, uAspect; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      if (uStr <= 0.001) { gl_FragColor = base; return; }
      vec2 d = (uSun - vUv) / 40.0;
      vec2 uv = vUv + d * h(vUv * 731.0);
      float w = 1.0, acc = 0.0;
      for (int i = 0; i < 40; i++) {
        vec3 c = texture2D(tDiffuse, uv).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        acc += smoothstep(0.95, 2.2, l) * w;
        w *= 0.955; uv += d;
      }
      float r = length((vUv - uSun) * vec2(uAspect, 1.0));
      vec3 rays = vec3(1.0, 0.78, 0.5) * acc / 40.0 * uStr * 2.6 / (1.0 + r * 1.5);
      gl_FragColor = vec4(base.rgb + rays, base.a);
    }`,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uSpeed: { value: 0 },
    uWarm: { value: 0 },
    uAspect: { value: 1 },
    uLens: { value: 0 },
    uHaze: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uSpeed, uWarm, uAspect, uLens; uniform vec4 uHaze[3]; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 base = vUv;
      // obiettivo TV: leggera distorsione a barile
      vec2 c0 = base - 0.5;
      base = 0.5 + c0 * (1.0 - uLens * 0.045 * dot(c0 * vec2(uAspect, 1.0), c0 * vec2(uAspect, 1.0)) - uLens * 0.012);
      // aria calda dello scarico: l'immagine tremola sopra e dietro la vettura
      for (int i = 0; i < 3; i++) {
        vec4 H = uHaze[i];
        if (H.w <= 0.0) continue;
        vec2 q = (base - H.xy) * vec2(uAspect, 1.0) / H.z;
        q.y -= 0.6;                                     // sale verso l'alto
        float f = exp(-dot(q * vec2(1.0, 0.7), q * vec2(1.0, 0.7)) * 1.6) * H.w;
        base += vec2(sin(base.y * 260.0 - uTime * 28.0 + base.x * 40.0), cos(base.x * 210.0 + uTime * 23.0)) * 0.0016 * f;
      }
      vec2 c = base - 0.5;
      float r = length(c * vec2(uAspect, 1.0));
      // sfocatura radiale in velocità: solo verso i bordi, il centro resta nitido
      vec3 col = vec3(0.0);
      float k = uSpeed * smoothstep(0.25, 0.9, r) * 0.035;
      for (int i = 0; i < 6; i++) {
        float t = float(i) / 5.0;
        vec2 uv = base - c * k * t;
        // aberrazione cromatica ai bordi (più forte con l'obiettivo TV)
        vec2 ca = c * (0.0022 + uLens * 0.004) * smoothstep(0.3, 1.0, r);
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
      col *= 1.0 - (0.32 + uLens * 0.12) * smoothstep(0.45, 1.05, r);
      col += (h(vUv * 1000.0 + uTime) - 0.5) * 0.018;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();

export class Post {
  constructor(renderer, scene, camera, opts = {}) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.render = new RenderPass(scene, camera);
    this.composer.addPass(this.render);
    this.rays = new ShaderPass(RaysShader);
    this.rays.enabled = !!opts.rays;
    this.composer.addPass(this.rays);
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
    this.rays.uniforms.uAspect.value = w / h;
  }
  // speed: 0..1 (quanto si vede la sfocatura in velocità)
  // fx: { sunDir, lens 0..1, haze: [[x, y, z, forza], ...] posizioni nel mondo degli scarichi }
  draw(dt, camera, speed = 0, fx = {}) {
    this.render.camera = camera;
    const g = this.grade.uniforms;
    g.uLens.value += ((fx.lens || 0) - g.uLens.value) * Math.min(1, dt * 4);
    const hz = fx.haze || [];
    for (let i = 0; i < 3; i++) {
      const H = g.uHaze.value[i], e = hz[i];
      H.w = 0;
      if (!e) continue;
      _v.set(e[0], e[1], e[2]).project(camera);
      const dist = camera.position.distanceTo(_w.set(e[0], e[1], e[2]));
      if (_v.z > 1 || Math.abs(_v.x) > 1.2 || Math.abs(_v.y) > 1.2 || dist > 60) continue;
      H.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5, Math.min(0.25, 1.1 / Math.max(2, dist)), e[3] * Math.min(1, (60 - dist) / 20));
    }
    if (this.rays.enabled && fx.sunDir) {
      _w.copy(fx.sunDir).multiplyScalar(3000).add(camera.position);
      _v.copy(_w).project(camera);
      camera.getWorldDirection(_d);
      const facing = _d.dot(fx.sunDir);
      const off = Math.max(Math.abs(_v.x), Math.abs(_v.y));
      const str = facing > 0 ? Math.max(0, Math.min(1, facing * 3)) * Math.max(0, Math.min(1, (1.6 - off) / 0.6)) : 0;
      this.rays.uniforms.uSun.value.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5);
      this.rays.uniforms.uStr.value = str;
    }
    this.speed += (speed - this.speed) * Math.min(1, dt * 3);
    this.grade.uniforms.uSpeed.value = this.speed;
    this.grade.uniforms.uTime.value = (this.grade.uniforms.uTime.value + dt) % 100;
    this.composer.render(dt);
  }
}
