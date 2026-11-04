import * as THREE from 'three';
import { WX } from './wx.js';

// Pioggia (come nei giochi di F1): gocce che cadono attorno alla telecamera e si allungano con la velocità,
// schizzi che rimbalzano sull'asfalto, nuvole d'acqua dietro le vetture, luce rossa lampeggiante sul retro.

function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Rain {
  constructor(scene, track, { quality = 'high' } = {}) {
    this.track = track;
    const low = quality === 'low', ultra = quality === 'ultra';
    const I = WX.rain;
    // ---- gocce: righe sottili in una scatola che segue la telecamera (si ripetono all'infinito)
    const N = Math.round((low ? 7000 : ultra ? 30000 : 18000) * (0.35 + 0.65 * I));
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
    quad.setIndex([0, 1, 2, 1, 3, 2]);
    const seeds = new Float32Array(N * 4), r = rand(77);
    for (let i = 0; i < N; i++) { seeds[i * 4] = r(); seeds[i * 4 + 1] = r(); seeds[i * 4 + 2] = r(); seeds[i * 4 + 3] = r(); }
    quad.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4));
    quad.instanceCount = N;
    this.u = {
      uCam: { value: new THREE.Vector3() }, uCamVel: { value: new THREE.Vector3() }, uTime: { value: 0 },
      uBox: { value: new THREE.Vector3(56, 26, 56) }, uFall: { value: new THREE.Vector3(1.6, -10.5 - 2 * I, 0.8) },
      uAlpha: { value: (low ? 0.46 : 0.26) * (0.6 + 0.4 * I) }, uColor: { value: new THREE.Color(0.78, 0.82, 0.88) }, uWidth: { value: low ? 1.6 : 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      vertexShader: `
        attribute vec4 seed;
        uniform vec3 uCam, uCamVel, uBox, uFall; uniform float uTime, uWidth;
        varying float vA; varying float vX;
        void main(){
          float sp = 0.8 + 0.45 * seed.w;
          vec3 c = seed.xyz * uBox + uFall * sp * uTime;
          vec3 p = mod(c - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
          // la riga è lunga quanto lo spazio percorso dalla goccia (rispetto alla telecamera) in 1/40 di secondo
          vec3 rel = uFall * sp - uCamVel;
          float L = clamp(length(rel) * 0.026, 0.35, 2.6);
          vec3 dir = normalize(rel);
          vec3 toCam = normalize(uCam - p);
          vec3 side = normalize(cross(dir, toCam));
          float d = distance(p, uCam);
          float w = (0.006 + d * 0.0009) * uWidth;               // lontano un filo più grosse (non spariscono a pixel)
          vec3 wp = p - dir * L * position.y + side * w * position.x;
          vX = position.x;
          // niente gocce attaccate all'obiettivo, e sfumano verso il bordo della scatola
          vA = smoothstep(0.7, 2.5, d) * (1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, d)) * (0.55 + 0.45 * seed.w);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: `
        uniform float uAlpha; uniform vec3 uColor; varying float vA; varying float vX;
        void main(){ float e = 1.0 - abs(vX); gl_FragColor = vec4(uColor, uAlpha * vA * e * e); }`,
    });
    this.drops = new THREE.Mesh(quad, mat);
    this.drops.frustumCulled = false;
    this.drops.renderOrder = 5;
    scene.add(this.drops);

    // ---- schizzi sull'asfalto: anellini che si allargano dove cade una goccia (vicino alla vettura)
    const M = low ? 160 : 420;
    const sg = new THREE.InstancedBufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, -1, 0, 1, 1, 0, 1], 3));
    sg.setIndex([0, 2, 1, 1, 2, 3]);
    this.sPos = new Float32Array(M * 4);              // x, y, z, tempo di nascita
    for (let i = 0; i < M; i++) this.sPos[i * 4 + 3] = -99;
    this.sAttr = new THREE.InstancedBufferAttribute(this.sPos, 4).setUsage(THREE.DynamicDrawUsage);
    sg.setAttribute('spl', this.sAttr);
    sg.instanceCount = M;
    this.uS = { uTime: this.u.uTime, uAlpha: { value: 0.5 * (0.5 + 0.5 * I) } };
    const smat = new THREE.ShaderMaterial({
      uniforms: this.uS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      vertexShader: `
        attribute vec4 spl; uniform float uTime; varying vec2 vUv; varying float vT;
        void main(){
          float t = (uTime - spl.w) / 0.38;
          vT = t; vUv = position.xz;
          float s = 0.03 + 0.11 * clamp(t, 0.0, 1.0);
          vec3 wp = spl.xyz + vec3(position.x * s, 0.02, position.z * s);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: `
        uniform float uAlpha; varying vec2 vUv; varying float vT;
        void main(){
          if (vT < 0.0 || vT > 1.0) discard;
          float r = length(vUv);
          float ring = smoothstep(0.62, 0.85, r) * (1.0 - smoothstep(0.85, 1.0, r));
          float dot0 = (1.0 - smoothstep(0.0, 0.35, r)) * (1.0 - smoothstep(0.0, 0.25, vT));
          gl_FragColor = vec4(vec3(0.86, 0.9, 0.95), uAlpha * (ring * (1.0 - vT) + dot0));
        }`,
    });
    this.splash = new THREE.Mesh(sg, smat);
    this.splash.frustumCulled = false;
    scene.add(this.splash);
    this.M = M; this.sNext = 0; this.sAcc = 0;
    this.rate = (low ? 260 : 650) * (0.4 + 0.6 * I);   // schizzi al secondo
    this.prev = new THREE.Vector3(); this.hasPrev = false;
    this.camVel = new THREE.Vector3();
    this.rnd = rand(5);
  }

  // focus: { i: indice del campione di pista più vicino } (la vettura seguita)
  update(dt, camera, focusI) {
    const u = this.u;
    u.uTime.value += dt;
    const cp = camera.position;
    if (this.hasPrev && dt > 0) {
      const v = cp.clone().sub(this.prev).divideScalar(Math.max(dt, 1e-3));
      if (v.length() > 160) v.set(0, 0, 0);          // stacco di telecamera: niente righe infinite
      this.camVel.lerp(v, Math.min(1, dt * 10));
    }
    this.prev.copy(cp); this.hasPrev = true;
    u.uCam.value.copy(cp); u.uCamVel.value.copy(this.camVel);
    // nuovi schizzi sulla pista attorno alla vettura seguita
    if (focusI == null || dt <= 0) return;
    const S = this.track.samples, n = this.track.count, r = this.rnd;
    this.sAcc += dt * this.rate;
    let k = Math.floor(this.sAcc); this.sAcc -= k;
    k = Math.min(k, 80);
    let changed = false;
    while (k-- > 0) {
      const i = (focusI + Math.floor((r() - 0.3) * 22) + n) % n, s = S[i], s2 = S[(i + 1) % n];
      const f = r(), d = (r() * 2 - 1) * (s.hw + 0.6);
      const x = s.x + (s2.x - s.x) * f + s.nx * d, z = s.z + (s2.z - s.z) * f + s.nz * d, y = s.y + (s2.y - s.y) * f;
      const j = this.sNext; this.sNext = (this.sNext + 1) % this.M;
      this.sPos[j * 4] = x; this.sPos[j * 4 + 1] = y; this.sPos[j * 4 + 2] = z; this.sPos[j * 4 + 3] = u.uTime.value - r() * 0.05;
      changed = true;
    }
    if (changed) this.sAttr.needsUpdate = true;
  }

  setVisible(v) { this.drops.visible = v; this.splash.visible = v; }
}

// nuvola d'acqua sollevata dalle ruote (come in TV: dietro le vetture veloci non si vede quasi niente)
export function sprayFor(p, spray, dt, near = 1) {
  if (p.speed < 8 || p.inPit) return;
  const k = Math.min(1, (p.speed - 8) / 55) * WX.wet * near;
  const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
  for (let i = 2; i < 4; i++) {
    const w = p.wheels[i];
    if (w.sf.type > 1 || !(w.fz > 0)) continue;
    let m = dt * 26 * k;
    while (m > 0) {
      if (m < 1 && Math.random() > m) break;
      m -= 1;
      const back = 0.4 + Math.random() * 0.8;
      const wx = p.x + cy * (w.x - back) - sy * w.y, wz = p.z + sy * (w.x - back) + cy * w.y;
      const lat = (Math.random() - 0.5) * 2.2;
      spray.emit(wx, w.ground + 0.25 + Math.random() * 0.3, wz, {
        color: [0.82, 0.85, 0.88], size: 0.9 + Math.random() * 0.6, grow: 5 + 3 * k, life: 0.7 + Math.random() * 0.6, alpha: 0.11 + 0.13 * k,
        vx: p.vx * 0.55 - sy * lat, vy: 0.8 + Math.random() * 1.6 * k, vz: p.vz * 0.55 + cy * lat, drag: 1.6,
      });
    }
  }
}

// luce rossa lampeggiante sul retro (obbligatoria sotto la pioggia)
const lampGeo = new THREE.BoxGeometry(0.06, 0.09, 0.26);
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,120,110,0.55)'); g.addColorStop(1, 'rgba(255,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
export function addRainLight(model, rearX, yLocal) {
  if (!model || !model.root || model.rainLight) return;
  const g = new THREE.Group();
  const lamp = new THREE.Mesh(lampGeo, new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1810, emissiveIntensity: 6 }));
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff3020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  spr.scale.set(1.1, 1.1, 1);
  spr.position.x = -0.05;
  g.add(lamp, spr);
  g.position.set(rearX, yLocal, 0);
  model.root.add(g);
  model.rainLight = g;
  model.rainPhase = Math.random();
}
export function blinkRainLights(models, t) {
  for (const m of models) {
    if (!m || !m.rainLight) continue;
    // lampeggio veloce come le vere luci da pioggia (circa 4 volte al secondo)
    const on = ((t * 4 + m.rainPhase) % 1) < 0.55;
    m.rainLight.visible = on && m.root.visible;
  }
}
