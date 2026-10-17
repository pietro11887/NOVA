import * as THREE from 'three';
import { ROAD_HALF_WIDTH as H } from './trackData.js';
import { CAR, CarPhysics } from './physics.js';
import { GEOM } from './carModel.js';
import { ARCADE } from './driveMode.js';

// Linea ideale: traiettoria a curvatura minima entro i bordi pista e profilo di velocità.
// Il colore di ogni tratto dipende dalla velocità attuale della vettura:
// verde = puoi accelerare, giallo = alza il piede, rosso = frena.

const G = 9.81;
const K_AERO = 0.5 * 1.225 * CAR.ClA / CAR.mass;  // accelerazione da carico aerodinamico per v² (come la fisica)
// sensibilità al carico: con tanto carico aerodinamico la gomma rende meno per ogni kg in più
// (nella fisica: -7% per ogni "peso statico" in più sulla ruota, più il trasferimento in curva)
const LOAD_SENS = 0.13;
// nei tornanti il limite è lo sterzo (passo lungo): curvatura massima che si riesce a tenere
// a fine corsa, con un po' di aiuto dall'imbardata del retrotreno
const WB = GEOM.axleF - GEOM.axleR, STEER_C = CAR.ClA > 2 ? 1.0 : 0.8;
const steerK = (v, arc) => STEER_C * CarPhysics.prototype.maxSteer.call({ arcade: arc }, v) / WB;
// quanto pesa la curva sulla frenata (la F1 con tanto carico frena forte anche in appoggio)
const FRIC = CAR.ClA > 2 ? 0.5 : 0.75;
const loadMu = v => Math.max(0.62, 1 - LOAD_SENS * K_AERO * v * v / G);

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

    // bordi lisci: i dati dei bordi pista hanno piccoli scalini; una linea appoggiata a bordi
    // seghettati diventa seghettata e il calcolo della velocità vede "curve" che non esistono
    const smoothBound = (arr, tighter) => {
      const W = 14, m = new Float64Array(n), out = new Float64Array(n);
      for (let i = 0; i < n; i++) { let v = arr[i]; for (let k = -W; k <= W; k++) { const x = arr[(i + k + n) % n]; v = tighter(v, x); } m[i] = v; }
      for (let i = 0; i < n; i++) { let s = 0; for (let k = -W; k <= W; k++) s += m[(i + k + n) % n]; out[i] = s / (2 * W + 1); }
      return out;
    };
    const loS = smoothBound(lo, Math.max), hiS = smoothBound(hi, Math.min);
    for (let i = 0; i < n; i++) if (loS[i] > hiS[i]) { const c = (loS[i] + hiS[i]) / 2; loS[i] = hiS[i] = c; }

    // 1) offset laterali: rilassamento verso il punto medio dei vicini (riduce la curvatura),
    // da tratti lunghi (forma della curva) a corti (dettaglio)
    const off = new Float64Array(n);
    const px = i => S[i].x + S[i].nx * off[i];
    const pz = i => S[i].z + S[i].nz * off[i];
    // curvatura minima (non strada più corta): ogni punto va verso dove la "piegatura" della linea è
    // minima (stencil del quarto ordine), così le curve si prendono larghe-strette-larghe
    // e il raggio è il più grande possibile
    for (const [span, its] of [[24, 150], [14, 200], [8, 250], [4, 300], [2, 300]]) {
      for (let it = 0; it < its; it++) {
        for (let i = 0; i < n; i++) {
          const a2 = (i - 2 * span + n) % n, a1 = (i - span + n) % n, b1 = (i + span) % n, b2 = (i + 2 * span) % n;
          const mx = (-px(a2) + 4 * px(a1) + 4 * px(b1) - px(b2)) / 6, mz = (-pz(a2) + 4 * pz(a1) + 4 * pz(b1) - pz(b2)) / 6;
          const d = (mx - S[i].x) * S[i].nx + (mz - S[i].z) * S[i].nz;
          off[i] += (d - off[i]) * 0.35;
          off[i] = Math.max(loS[i], Math.min(hiS[i], off[i]));
        }
      }
    }
    // levigatura finale (i bordi sono lisci, quindi resta liscia anche dopo il controllo dei limiti)
    let sm = Float64Array.from(off);
    for (let pass = 0; pass < 3; pass++) {
      const t = Float64Array.from(sm, (_, i) => { let s = 0; for (let j = -3; j <= 3; j++) s += sm[(i + j + n) % n]; return s / 7; });
      for (let i = 0; i < n; i++) t[i] = Math.max(loS[i], Math.min(hiS[i], t[i]));
      sm = t;
    }
    this.off = sm;

    // 2) punti, distanze e curvatura della linea (cerchio per tre punti a ±6 campioni, poi media)
    const P = [];
    for (let i = 0; i < n; i++) P.push([S[i].x + S[i].nx * sm[i], S[i].y, S[i].z + S[i].nz * sm[i]]);
    this.points = P;
    const ds = new Float64Array(n), raw = new Float64Array(n);
    for (let i = 0; i < n; i++) { const q = P[(i + 1) % n]; ds[i] = Math.hypot(q[0] - P[i][0], q[2] - P[i][2]); }
    const K = 6;
    for (let i = 0; i < n; i++) {
      const a = P[(i - K + n) % n], b = P[i], c = P[(i + K) % n];
      const abx = b[0] - a[0], abz = b[2] - a[2], bcx = c[0] - b[0], bcz = c[2] - b[2], cax = a[0] - c[0], caz = a[2] - c[2];
      const cross = abx * bcz - abz * bcx;
      const la = Math.hypot(abx, abz), lb = Math.hypot(bcx, bcz), lc = Math.hypot(cax, caz);
      raw[i] = Math.abs(2 * cross) / Math.max(1e-6, la * lb * lc);
    }
    const curv = Float64Array.from(raw, (_, i) => { let s = 0; for (let j = -2; j <= 2; j++) s += raw[(i + j + n) % n]; return s / 5; });

    this.curv = curv; this.ds = ds;
    // aderenza "imparata" punto per punto: dove le vetture sottosterzano la linea consiglia meno velocità
    this.gripMap = new Float64Array(n).fill(1);
    this.version = 0;
    // 3) profilo di velocità (prudente, pensato per chi guida col telefono o la tastiera)
    this.speed = this.speedProfile(1.3 * CAR.mu / 1.8, 0.72);
  }

  // profilo di velocità massima: mu = aderenza usata in curva, brakeFac = frazione della frenata massima
  // dislivelli: pendenza (in discesa si frena in più spazio) e curvatura verticale
  // (su un dosso la vettura si alleggerisce e ha meno aderenza, in compressione ne ha di più)
  elevation() {
    if (this._elev) return this._elev;
    const S = this.track.samples, n = this.track.count, st = this.track.step, h = Math.max(1, Math.round(12 / st));
    const kv = new Float64Array(n), sl = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = S[(i - h + n) % n].y, b = S[i].y, c = S[(i + h) % n].y;
      kv[i] = Math.max(-0.02, Math.min(0.02, (a - 2 * b + c) / ((h * st) ** 2)));
      sl[i] = Math.max(-0.25, Math.min(0.25, (c - a) / (2 * h * st)));
    }
    return (this._elev = { kv, sl });
  }

  speedProfile(mu, brakeFac, vmax = 95) {
    const n = this.track.count, curv = this.curv, ds = this.ds;
    const { kv, sl } = this.elevation();
    const v = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      // la velocità in curva dipende dall'aderenza, che dipende dalla velocità: qualche iterazione
      const k = curv[i], g = this.gripMap ? this.gripMap[i] : 1;
      let vi = vmax;
      for (let it = 0; it < 6; it++) {
        // in discesa il carico va sull'avantreno e il retrotreno si alleggerisce: la curva si fa più piano
        const m = mu * g * loadMu(vi) * (1 + 1.5 * Math.min(0, sl[i])), kk = m * (K_AERO + Math.min(0, kv[i]));
        vi = k > kk ? Math.min(vmax, Math.sqrt(m * G / (k - kk))) : vmax;
      }
      // limite dello sterzo: la velocità più alta a cui la curva si tiene ancora col volante a fondo
      if (k > steerK(vi, this.arcadeOn)) {
        let lo = 2, hi = vi;
        for (let it = 0; it < 18; it++) { const mid = (lo + hi) / 2; if (k > steerK(mid, this.arcadeOn)) hi = mid; else lo = mid; }
        vi = lo;
      }
      v[i] = vi;
    }
    // in avanti: la velocità non può salire più di quanto la vettura accelera davvero
    // (senza questo, un breve tratto meno curvo in mezzo a una curva lunga diceva "gas" e subito dopo "frena")
    const ACC = 25;
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j <= 2 * n; j++) {
        const i = j % n, nx = (i + 1) % n;
        v[nx] = Math.min(v[nx], Math.sqrt(v[i] * v[i] + 2 * Math.max(5, ACC - G * sl[i]) * ds[i]));
      }
    }
    // frenata all'indietro: v_i² <= v_{i+1}² + 2·a·ds
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 2 * n; j >= 0; j--) {
        const i = j % n, nx = (i + 1) % n;
        // cerchio di aderenza: se si sta già curvando, per frenare resta meno
        const aMax = mu * (this.gripMap ? this.gripMap[nx] : 1) * loadMu(v[nx]) * (G + (K_AERO + Math.min(0, kv[nx])) * v[nx] * v[nx]);
        const aLat = v[nx] * v[nx] * curv[nx];
        const dec = Math.max(2, brakeFac * aMax * Math.sqrt(Math.max(0.2, 1 - (FRIC * aLat / aMax) ** 2)) + G * sl[nx]);
        v[i] = Math.min(v[i], Math.sqrt(v[nx] * v[nx] + 2 * dec * ds[i]));
      }
    }
    return v;
  }

  // una vettura col volante a fondo scivola verso l'esterno in questo punto: la curva va presa più piano.
  // Vale per tutti (bot e colori della linea), un po' alla volta, fino a un minimo
  learn(i, t) {
    const n = this.track.count, gm = this.gripMap;
    if (this.lastLearn != null && t - this.lastLearn < 0.5 && t >= this.lastLearn) return false;
    this.lastLearn = t;
    let changed = false;
    for (let k = -45; k <= 25; k++) {
      const j = (i + k + n) % n, w = k < 0 ? 1 + k / 60 : 1 - k / 35;   // di più verso l'ingresso
      const nv = Math.max(0.8, gm[j] * (1 - 0.025 * w));
      if (nv < gm[j]) { gm[j] = nv; changed = true; }
    }
    if (changed) {
      this.version++;
      this.speed = this.speedProfile(1.3 * CAR.mu / 1.8 * (this.arcadeOn ? ARCADE.grip : 1), 0.72 * (this.arcadeOn ? ARCADE.brake : 1));
    }
    return changed;
  }

  // ...e dove si passa al limite senza problemi la velocità consigliata torna su piano piano
  relax(i) {
    const gm = this.gripMap;
    if (gm[i] < 1) gm[i] = Math.min(1, gm[i] + 0.0004);
  }

  // colori della linea per la guida arcade (più aderenza, frenate più corte) o realistica
  setArcade(on) {
    if (this.arcadeOn === on) return;
    this.arcadeOn = on;
    this.speed = this.speedProfile(1.3 * CAR.mu / 1.8 * (on ? ARCADE.grip : 1), 0.72 * (on ? ARCADE.brake : 1));
  }

  // velocità consigliata (m/s) e offset laterale in un punto (indice campione)
  target(i) { return this.speed[i]; }

  // gomma sull'asfalto: la traiettoria è più scura (più gommata) e lo è di più nelle staccate
  buildRubber() {
    const S = this.track.samples, n = this.track.count, P = this.points, V = this.speed;
    const w = 1.05;
    const pos = new Float32Array((n + 1) * 2 * 3), uv = new Float32Array((n + 1) * 2 * 2), col = new Float32Array((n + 1) * 2 * 4);
    const idx = [], sf = {};
    for (let k = 0; k <= n; k++) {
      const i = k % n, p = P[i];
      const yA = p[1] + this.track.surface({ i, i0: i, f: 0, d: this.off[i] - w, s: S[i].s }, sf).h + 0.012;
      const yB = p[1] + this.track.surface({ i, i0: i, f: 0, d: this.off[i] + w, s: S[i].s }, sf).h + 0.012;
      pos.set([p[0] - S[i].nx * w, yA, p[2] - S[i].nz * w, p[0] + S[i].nx * w, yB, p[2] + S[i].nz * w], k * 6);
      const vv = k * this.track.step / 9;
      uv.set([0, vv, 1, vv], k * 4);
      // staccata: la velocità consigliata scende nei prossimi 60 m
      const ahead = V[(i + 30) % n], brake = Math.max(0, Math.min(1, (V[i] - ahead) / 25));
      const a = 0.42 + 0.45 * brake;
      col.set([0, 0, 0, a, 0, 0, 0, a], k * 8);
      if (k < n) { const q = k * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    geo.setIndex(idx);
    // trama: bordi sfumati e striature lungo la direzione di marcia
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
    const g = cv.getContext('2d'), img = g.createImageData(64, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 64; x++) {
      const u = x / 63, edge = Math.sin(Math.PI * u), streak = 0.75 + 0.25 * Math.sin(u * 47 + Math.sin(y * 0.05) * 3) * Math.sin(u * 13.7);
      const noise = 0.8 + 0.2 * Math.sin(x * 12.9898 + y * 78.233) * Math.sin(y * 0.31 + x);
      const v = Math.max(0, Math.min(1, Math.pow(edge, 1.6) * streak * noise));
      const o = (y * 64 + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = v * 255;
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv); tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, map: tex, alphaMap: null, vertexColors: true, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, opacity: 0.55 });
    // il canale alfa della trama fa da maschera
    mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = vec3(0.0); diffuseColor.a *= sampledDiffuseColor.a;'); };
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false; m.renderOrder = 0;
    return m;
  }

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
