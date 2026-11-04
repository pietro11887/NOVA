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
    const heavy = I > 0.7;
    this.heavy = heavy;
    const N = Math.round((low ? 9000 : ultra ? 42000 : 26000) * (heavy ? 1.25 : 0.45));
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
    quad.setIndex([0, 1, 2, 1, 3, 2]);
    const seeds = new Float32Array(N * 4), r = rand(77);
    for (let i = 0; i < N; i++) { seeds[i * 4] = r(); seeds[i * 4 + 1] = r(); seeds[i * 4 + 2] = r(); seeds[i * 4 + 3] = r(); }
    quad.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4));
    quad.instanceCount = N;
    this.u = {
      uCam: { value: new THREE.Vector3() }, uCamVel: { value: new THREE.Vector3() }, uTime: { value: 0 },
      uBox: { value: new THREE.Vector3(56, 26, 56) }, uFall: { value: new THREE.Vector3(heavy ? 3.2 : 1.6, -10.5 - 3 * I, heavy ? 1.6 : 0.8) },
      uAlpha: { value: heavy ? (low ? 0.62 : 0.42) : (low ? 0.4 : 0.26) }, uColor: { value: new THREE.Color(0.84, 0.87, 0.92) }, uWidth: { value: (low ? 1.6 : 1) * (heavy ? 1.35 : 1) },
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
          float L = clamp(length(rel) * 0.03, 0.4, 2.8);
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

    // ---- cortine di pioggia in lontananza: veli grigi che scendono e si muovono col vento
    //      (due cilindri attorno alla telecamera, a 60 e 140 m): danno la sensazione di diluvio
    this.curtains = [];
    const cMat = (alpha, scale) => new THREE.ShaderMaterial({
      uniforms: { uTime: this.u.uTime, uA: { value: alpha }, uS: { value: scale } },
      transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
      vertexShader: 'varying vec2 vUv; varying float vY; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vY = position.y; gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: `
        uniform float uTime, uA, uS; varying vec2 vUv; varying float vY;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main(){
          vec2 q = vec2(vUv.x * uS, vUv.y * 3.0 + uTime * 2.2);
          float streak = n(vec2(q.x * 40.0, q.y * 1.5)) * 0.6 + n(vec2(q.x * 90.0, q.y * 3.0 + 4.0)) * 0.4;
          float sheet = n(vec2(vUv.x * uS * 0.6 + uTime * 0.05, uTime * 0.12)) ;            // folate più fitte
          float a = uA * (0.55 + 0.45 * streak) * (0.5 + 0.8 * sheet);
          a *= smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
          gl_FragColor = vec4(vec3(0.62, 0.65, 0.7), a);
        }`,
    });
    for (const [R, a, sc] of [[60, heavy ? 0.16 : 0.07, 18], [140, heavy ? 0.24 : 0.1, 30]]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 70, 48, 1, true), cMat(a, sc));
      m.frustumCulled = false; m.renderOrder = 4;
      scene.add(m); this.curtains.push(m);
    }

    // ---- gocce sull'obiettivo della telecamera (sopra il gioco, sotto i comandi)
    this.lens = new LensDrops(heavy ? 1 : 0.45);
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
    for (const c of this.curtains) c.position.set(cp.x, cp.y + 18, cp.z);
    if (this.lens) this.lens.update(dt, this.camVel.length(), this.lensOn !== false);
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

  setVisible(v) { this.drops.visible = v; this.splash.visible = v; for (const c of this.curtains) c.visible = v; }
}

// nuvola d'acqua sollevata dalle ruote (come in TV: dietro le vetture veloci non si vede quasi niente)
export function sprayFor(p, spray, dt, near = 1) {
  if (p.speed < 8 || p.inPit) return;
  const k = Math.min(1, (p.speed - 8) / 55) * WX.wet * near;
  const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
  for (let i = 2; i < 4; i++) {
    const w = p.wheels[i];
    if (w.sf.type > 1 || !(w.fz > 0)) continue;
    let m = dt * (18 + 22 * WX.rain) * k;
    while (m > 0) {
      if (m < 1 && Math.random() > m) break;
      m -= 1;
      const back = 0.4 + Math.random() * 0.8;
      const wx = p.x + cy * (w.x - back) - sy * w.y, wz = p.z + sy * (w.x - back) + cy * w.y;
      const lat = (Math.random() - 0.5) * 2.2;
      spray.emit(wx, w.ground + 0.25 + Math.random() * 0.3, wz, {
        color: [0.74, 0.77, 0.8], size: 0.9 + Math.random() * 0.7, grow: 5 + 4 * k * WX.rain, life: 0.7 + Math.random() * 0.8 * WX.rain, alpha: (0.1 + 0.16 * k) * (0.7 + 0.5 * WX.rain),
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

// Gocce sull'obiettivo (come le telecamere TV sotto la pioggia): compaiono, restano un po',
// scivolano via; più veloce vai, più corrono verso i bordi. Disegnate su una tela leggera sopra il gioco.
class LensDrops {
  constructor(amount) {
    const c = document.createElement('canvas');
    c.id = 'lensDrops';
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;';
    const game = document.getElementById('game');
    if (game && game.parentNode) game.parentNode.insertBefore(c, game.nextSibling); else document.body.appendChild(c);
    this.c = c; this.g = c.getContext('2d');
    this.amount = amount; this.drops = []; this.acc = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() { this.w = this.c.width = Math.round(innerWidth / 2); this.h = this.c.height = Math.round(innerHeight / 2); }
  update(dt, speed, on) {
    const g = this.g, W = this.w, H = this.h;
    g.clearRect(0, 0, W, H);
    this.c.style.display = on ? '' : 'none';
    if (!on || dt <= 0) return;
    // nuove gocce: di più da fermi o piano (in velocità l'aria le spazza via)
    this.acc += dt * this.amount * (14 - Math.min(10, speed * 0.12));
    while (this.acc > 1 && this.drops.length < 70) {
      this.acc -= 1;
      const r = (1.5 + Math.random() * 5.5) * (W / 640);
      this.drops.push({ x: Math.random() * W, y: Math.random() * H, r, life: 2 + Math.random() * 5, t: 0, vy: 0 });
    }
    const cx = W / 2, cy = H * 0.45, push = Math.min(1, speed / 60);
    this.drops = this.drops.filter(d => {
      d.t += dt;
      if (d.t > d.life) return false;
      // le grosse scivolano in basso, in velocità tutte vanno verso i bordi
      if (d.r > 4 * (W / 640)) d.vy += dt * 6;
      d.y += d.vy * dt * 10 + (d.y - cy) * push * dt * 1.6;
      d.x += (d.x - cx) * push * dt * 1.6;
      if (d.x < -10 || d.x > W + 10 || d.y > H + 10 || d.y < -10) return false;
      const a = Math.min(1, d.t * 6) * Math.min(1, (d.life - d.t) * 1.5);
      const r = d.r, sx = 1, sy = 1 + Math.min(1.5, d.vy * 0.15 + push * 0.6);
      g.save(); g.translate(d.x, d.y); g.scale(sx, sy);
      // goccia: bordo scuro, centro chiaro e un riflesso in alto (sembra una lente d'acqua)
      const gr = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
      gr.addColorStop(0, `rgba(255,255,255,${0.5 * a})`);
      gr.addColorStop(0.45, `rgba(200,210,220,${0.16 * a})`);
      gr.addColorStop(0.85, `rgba(40,45,55,${0.22 * a})`);
      gr.addColorStop(1, 'rgba(40,45,55,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.fill();
      g.restore();
      // scia d'acqua dietro le gocce che scivolano
      if (d.vy > 1) { g.strokeStyle = `rgba(210,220,230,${0.12 * a})`; g.lineWidth = r * 0.6; g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x, d.y - d.vy * 3); g.stroke(); }
      return true;
    });
  }
}

// lampo: il cielo si illumina un attimo (due-tre bagliori), poi arriva il tuono
export class Lightning {
  constructor() { this.next = 12 + Math.random() * 20; this.t = -1; this.flash = 0; }
  update(dt) {
    this.next -= dt;
    let thunder = null;
    if (this.next <= 0) { this.next = 25 + Math.random() * 40; this.t = 0; this.dist = Math.random(); thunder = { delay: 0.6 + this.dist * 3.5, power: 1 - this.dist * 0.6 }; }
    if (this.t >= 0) {
      this.t += dt;
      const t = this.t;
      this.flash = (t < 0.08 ? 1 : t < 0.16 ? 0.15 : t < 0.24 ? 0.8 : t < 0.5 ? Math.max(0, 0.6 - (t - 0.24) * 2.4) : 0) * (1 - this.dist * 0.5);
      if (t > 0.6) { this.t = -1; this.flash = 0; }
    }
    return thunder;
  }
}

// Tutto bagnato (muri, barriere, cordoli, prati, marciapiedi, edifici): più scuro e più lucido,
// pozzanghere sulle superfici piane, rivoli d'acqua che scendono su quelle verticali.
// Si aggiunge allo shader dei materiali esistenti (nessun oggetto in più da disegnare).
export function wetifyMaterials(roots, uTime) {
  const U = { uWetK: { value: WX.wet }, uWetT: uTime };
  const seen = new Set();
  for (const root of roots) {
    if (!root) continue;
    root.traverse(o => {
      const m = o.isMesh && o.material;
      if (!m || Array.isArray(m) || seen.has(m)) return;
      seen.add(m);
      if (!m.isMeshStandardMaterial || m.transparent || m.alphaTest > 0 || m.userData.noWet || o.isBatchedMesh) return;
      const base = m.onBeforeCompile, key = m.customProgramCacheKey();
      m.onBeforeCompile = (sh, r) => {
        base.call(m, sh, r);
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWetP; varying vec3 vWetN;')
          .replace('#include <project_vertex>', `#include <project_vertex>
            { vec4 wwp = vec4(transformed, 1.0); vec3 wwn = objectNormal;
              #ifdef USE_INSTANCING
              wwp = instanceMatrix * wwp; wwn = mat3(instanceMatrix) * wwn;
              #endif
              wwp = modelMatrix * wwp; vWetP = wwp.xyz; vWetN = mat3(modelMatrix) * wwn; }`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
            uniform float uWetK, uWetT; varying vec3 vWetP; varying vec3 vWetN;
            float wH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float wN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
              return mix(mix(wH(i), wH(i + vec2(1.0, 0.0)), f.x), mix(wH(i + vec2(0.0, 1.0)), wH(i + vec2(1.0, 1.0)), f.x), f.y); }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
            vec3 wNn = normalize(vWetN);
            float wUp = smoothstep(0.75, 0.95, wNn.y);
            float wSide = 1.0 - smoothstep(0.2, 0.55, abs(wNn.y));
            // chiazze d'acqua per terra
            float wPd = smoothstep(0.56, 0.68, wN(vWetP.xz * 0.12) * 0.65 + wN(vWetP.xz * 0.5 + 3.1) * 0.35) * wUp * uWetK;
            // rivoli che colano sui muri (scendono piano)
            float wU = vWetP.x * wNn.z - vWetP.z * wNn.x;
            float wSt = smoothstep(0.55, 0.85, wN(vec2(wU * 6.0, vWetP.y * 0.7 + uWetT * 1.3))) * wSide * uWetK;
            diffuseColor.rgb *= 1.0 - uWetK * 0.3 - wPd * 0.25 - wSt * 0.2;`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
            roughnessFactor = mix(roughnessFactor, max(roughnessFactor * 0.5, 0.34), uWetK);
            roughnessFactor = mix(roughnessFactor, 0.06, wPd);
            roughnessFactor = mix(roughnessFactor, 0.14, wSt);`)
          // nelle pozzanghere l'acqua è ferma e liscia: niente rilievi (e niente puntini che luccicano sull'erba)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            normal = normalize(mix(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), wPd));`);
      };
      m.customProgramCacheKey = () => key + '|wet';
      m.needsUpdate = true;
    });
  }
}
