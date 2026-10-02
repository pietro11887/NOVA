import * as THREE from 'three';
import { ROAD_HALF_WIDTH as H } from './trackData.js';
import { CAR } from './physics.js';
import { ARCADE } from './driveMode.js';

// Linea ideale: traiettoria a curvatura minima entro i bordi pista e profilo di velocità.
// Il colore di ogni tratto dipende dalla velocità attuale della vettura:
// verde = puoi accelerare, giallo = alza il piede, rosso = frena.

const G = 9.81;
const K_AERO = 0.5 * 1.225 * CAR.ClA / CAR.mass;  // accelerazione da carico aerodinamico per v² (come la fisica)

export class RacingLine {
  constructor(track, margin = 1.6) {
    this.track = track;
    const S = track.samples, n = track.count;
    const lim = i => Math.max(0.6, S[i].hw - margin);   // per campione: la larghezza cambia
    // nei tornanti la linea non scende sotto un raggio minimo: si resta larghi invece di
    // chiudere sul punto di corda con un raggio di pochi metri (curv > 0 = svolta a destra,
    // interno a destra = offset negativo)
    const R_MIN = 14;
    const lo = new Float64Array(n), hi = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      // bordi per lato (piste da modello) oppure simmetrici
      const LL = Math.max(0.6, (S[i].hwL ?? S[i].hw) - margin), LR = Math.max(0.6, (S[i].hwR ?? S[i].hw) - margin);
      const room = 1 / Math.max(1e-4, Math.abs(S[i].curv)) - R_MIN;
      lo[i] = -LR; hi[i] = LL;
      if (S[i].curv > 0) lo[i] = Math.min(LL, Math.max(-LR, -room));
      else if (S[i].curv < 0) hi[i] = Math.max(-LR, Math.min(LL, room));
    }

    // 1) offset laterali: rilassamento verso il punto medio dei vicini (riduce la curvatura)
    const off = new Float64Array(n);
    const px = i => S[i].x + S[i].nx * off[i];
    const pz = i => S[i].z + S[i].nz * off[i];
    for (const span of [24, 14, 8, 4]) {
      for (let it = 0; it < 120; it++) {
        for (let i = 0; i < n; i++) {
          const a = (i - span + n) % n, b = (i + span) % n;
          const mx = (px(a) + px(b)) / 2, mz = (pz(a) + pz(b)) / 2;
          const d = (mx - S[i].x) * S[i].nx + (mz - S[i].z) * S[i].nz;
          off[i] += (d - off[i]) * 0.5;
          off[i] = Math.max(lo[i], Math.min(hi[i], off[i]));
        }
      }
    }
    // leggera levigatura finale
    const sm = Float64Array.from(off, (_, i) => { let s = 0; for (let j = -3; j <= 3; j++) s += off[(i + j + n) % n]; return s / 7; });
    this.off = sm;

    // 2) punti, distanze e curvatura della linea
    const P = [];
    for (let i = 0; i < n; i++) P.push([S[i].x + S[i].nx * sm[i], S[i].y, S[i].z + S[i].nz * sm[i]]);
    this.points = P;
    const ds = new Float64Array(n), curv = new Float64Array(n);
    for (let i = 0; i < n; i++) { const q = P[(i + 1) % n]; ds[i] = Math.hypot(q[0] - P[i][0], q[2] - P[i][2]); }
    for (let i = 0; i < n; i++) {
      const a = P[(i - 4 + n) % n], b = P[i], c = P[(i + 4) % n];
      const h1 = Math.atan2(b[2] - a[2], b[0] - a[0]), h2 = Math.atan2(c[2] - b[2], c[0] - b[0]);
      let dh = h2 - h1; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]) + Math.hypot(c[0] - b[0], c[2] - b[2]);
      curv[i] = Math.abs(dh) / Math.max(1e-3, len / 2);
    }

    this.curv = curv; this.ds = ds;
    // 3) profilo di velocità (prudente, pensato per chi guida col telefono o la tastiera)
    this.speed = this.speedProfile(1.3 * CAR.mu / 1.8, 0.72);
  }

  // profilo di velocità massima: mu = aderenza usata in curva, brakeFac = frazione della frenata massima
  speedProfile(mu, brakeFac, vmax = 95) {
    const n = this.track.count, curv = this.curv, ds = this.ds;
    const v = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const k = curv[i], kk = mu * K_AERO;
      v[i] = k > kk ? Math.min(vmax, Math.sqrt(mu * G / (k - kk))) : vmax;
    }
    // in avanti: la velocità non può salire più di quanto la vettura accelera davvero
    // (senza questo, un breve tratto meno curvo in mezzo a una curva lunga diceva "gas" e subito dopo "frena")
    const ACC = 16;
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j <= 2 * n; j++) {
        const i = j % n, nx = (i + 1) % n;
        v[nx] = Math.min(v[nx], Math.sqrt(v[i] * v[i] + 2 * ACC * ds[i]));
      }
    }
    // frenata all'indietro: v_i² <= v_{i+1}² + 2·a·ds
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 2 * n; j >= 0; j--) {
        const i = j % n, nx = (i + 1) % n;
        const dec = brakeFac * mu * (G + K_AERO * v[nx] * v[nx]);
        v[i] = Math.min(v[i], Math.sqrt(v[nx] * v[nx] + 2 * dec * ds[i]));
      }
    }
    return v;
  }

  // colori della linea per la guida arcade (più aderenza, frenate più corte) o realistica
  setArcade(on) {
    if (this.arcadeOn === on) return;
    this.arcadeOn = on;
    this.speed = this.speedProfile(1.3 * CAR.mu / 1.8 * (on ? ARCADE.grip : 1), 0.72 * (on ? ARCADE.brake : 1));
  }

  // velocità consigliata (m/s) e offset laterale in un punto (indice campione)
  target(i) { return this.speed[i]; }

  build() {
    const S = this.track.samples, n = this.track.count, P = this.points;
    const w = 0.55;
    const pos = new Float32Array((n + 1) * 2 * 3), uv = new Float32Array((n + 1) * 2 * 2);
    this.colors = new Float32Array((n + 1) * 2 * 4);
    const idx = [], sf = {};
    for (let k = 0; k <= n; k++) {
      const i = k % n, p = P[i];
      const x = p[0], z = p[2];
      // quota della superficie ai due bordi della striscia (piste da modello: pendenza laterale vera)
      const yA = p[1] + this.track.surface({ i, i0: i, f: 0, d: this.off[i] - w, s: S[i].s }, sf).h + 0.045;
      const yB = p[1] + this.track.surface({ i, i0: i, f: 0, d: this.off[i] + w, s: S[i].s }, sf).h + 0.045;
      pos.set([x - S[i].nx * w, yA, z - S[i].nz * w, x + S[i].nx * w, yB, z + S[i].nz * w], k * 6);
      const vv = k * this.track.step / 2.6;
      uv.set([0, vv, 1, vv], k * 4);
      if (k < n) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    this.geo = geo;
    const mat = new THREE.MeshBasicMaterial({
      map: chevronTexture(), vertexColors: true, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: true, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    return this.mesh;
  }

  // mode: 'full' | 'brake' | 'off'
  update(carIndex, carSpeed, mode) {
    this.mesh.visible = mode !== 'off';
    if (!this.mesh.visible) return;
    const n = this.track.count, C = this.colors;
    C.fill(0);
    const ahead = Math.round(320 / this.track.step), behind = 4;
    for (let j = -behind; j <= ahead; j++) {
      const i = (carIndex + j + n) % n;
      const excess = carSpeed - this.speed[i];      // m/s oltre la velocità consigliata
      let r, g, b;
      if (excess > 1.5) { r = 0.95; g = 0.06; b = 0.05; }          // frena
      else if (excess > -3) { r = 1; g = 0.7; b = 0.0; }      // alza il piede
      else { r = 0.1; g = 0.85; b = 0.25; }                   // accelera
      let a = 0.85;
      if (mode === 'brake' && excess <= -3) a = 0;
      // dissolvenza alle estremità
      if (j < 0) a *= 0.3;
      if (j > ahead - 40) a *= (ahead - j) / 40;
      C.set([r, g, b, a, r, g, b, a], i * 8);
      if (i === 0) C.set([r, g, b, a, r, g, b, a], n * 8);
    }
    this.geo.attributes.color.needsUpdate = true;
  }
}

function chevronTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#ffffff';
  g.beginPath();                       // freccia orientata nel senso di marcia (v crescente)
  g.moveTo(6, 42); g.lineTo(32, 16); g.lineTo(58, 42); g.lineTo(58, 28); g.lineTo(32, 2); g.lineTo(6, 28);
  g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
