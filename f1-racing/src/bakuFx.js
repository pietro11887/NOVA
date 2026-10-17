import * as THREE from 'three';
import { Particles } from './effects.js';

// Effetti di Baku (si possono poi portare sulle altre piste):
// - segni neri di frenata nelle staccate forti e detriti di gomma fuori traiettoria (crescono durante la gara)
// - scie d'aria dagli alettoni nelle curve veloci (umidità del Caspio)
// - polvere sollevata dalle vetture e foglie nelle stradine della città vecchia
// - elicottero della TV che segue la gara, gabbiani sul lungomare
// - partenza: fumo delle gomme e flash dei fotografi; arrivo: coriandoli e fuochi d'artificio

function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// striscia morbida ai bordi (per i segni di frenata)
function streakTexture() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 128;
  const g = c.getContext('2d'), img = g.createImageData(32, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 32; x++) {
    const u = x / 31, e = Math.pow(Math.sin(Math.PI * u), 0.8);
    const n = 0.7 + 0.3 * Math.sin(x * 2.1 + Math.sin(y * 0.2) * 2) * Math.sin(y * 0.37 + x);
    const o = (y * 32 + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = Math.max(0, Math.min(1, e * n)) * 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class BakuFx {
  constructor(scene, track, line, scenery, opts = {}) {
    this.scene = scene; this.track = track; this.line = line; this.scenery = scenery;
    this.high = !!opts.high;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mist = new Particles(scene, this.high ? 2600 : 1000);                      // scie, polvere, fumo, foglie, coriandoli
    this.fire = new Particles(scene, this.high ? 1800 : 700, { additive: true });  // flash e fuochi d'artificio
    this.time = 0;
    this.prev = new Map();          // posizioni precedenti delle punte degli alettoni
    this.startT = -1; this.finishT = -1;
    this.rockets = [];
    this.brakeMarks();
    this.marbles();
    this.helicopter();
    this.gulls();
  }

  setScale(h) { this.mist.setScale(h); this.fire.setScale(h); }
  clear() { this.mist.clear(); this.fire.clear(); this.prev.clear(); this.rockets = []; this.startT = this.finishT = -1; }
  start() { this.startT = this.time; }
  finish() { if (this.finishT < 0) this.finishT = this.time; }

  // ------------------------------------------------------------------ segni di frenata
  // nelle staccate forti la gomma resta sull'asfalto: tante strisce sovrapposte, una per ruota e per frenata
  brakeMarks() {
    const S = this.track.samples, n = this.track.count, st = this.track.step, V = this.line.speed, off = this.line.off;
    const r = rand(7), sf = {};
    const pos = [], uv = [], col = [], idx = [];
    const zones = [];
    for (let i = 0; i < n; i++) {
      const drop = V[i] - V[(i + Math.round(40 / st)) % n];
      if (drop > 14 && V[i] > 35 && !zones.some(z => Math.min(Math.abs(z - i), n - Math.abs(z - i)) < 60 / st)) zones.push(i);
    }
    const strip = (i0, len, lat, w, a0) => {
      const steps = Math.max(2, Math.round(len / st));
      const base = pos.length / 3;
      for (let k = 0; k <= steps; k++) {
        const i = (i0 + k) % n, s = S[i], t = k / steps;
        const d = off[i] + lat + Math.sin(k * 0.3 + lat * 9) * 0.05;
        const h = this.track.surface({ i, i0: i, f: 0, d, s: s.s }, sf).h;
        for (const e of [-w / 2, w / 2]) {
          pos.push(s.x + s.nx * (d + e), s.y + h + 0.016, s.z + s.nz * (d + e));
          uv.push(e < 0 ? 0 : 1, k * st / 6);
          // più scure all'inizio della staccata (ruote bloccate), poi sfumano
          const a = a0 * Math.min(1, t * 8) * Math.pow(1 - t, 0.7);
          col.push(0, 0, 0, a);
        }
        if (k < steps) { const q = base + k * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      }
    };
    for (const z of zones) {
      const passes = 10 + Math.floor(r() * 8);
      for (let p = 0; p < passes; p++) {
        const shift = Math.round((r() - 0.3) * 18 / st), len = 14 + r() * 38, spread = (r() - 0.5) * 0.9;
        const a = 0.12 + r() * 0.35;
        // ruota sinistra e destra della stessa vettura
        for (const side of [-0.8, 0.8]) strip((z + shift + n) % n, len, side + spread, 0.26 + r() * 0.1, a);
      }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, map: streakTexture(), vertexColors: true, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, opacity: 0.75 });
    mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = vec3(0.0); diffuseColor.a *= sampledDiffuseColor.a;'); };
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 1;
    this.group.add(m);
  }

  // ------------------------------------------------------------------ detriti di gomma (marbles)
  // pallini neri fuori traiettoria nelle curve: all'inizio pochi, a fine gara tanti
  marbles() {
    const S = this.track.samples, n = this.track.count, off = this.line.off;
    const r = rand(11), sf = {};
    const pos = [], col = [], idx = [];
    const N = this.high ? 9000 : 4000;
    let tries = 0;
    while (pos.length / 12 < N && tries++ < N * 6) {
      const i = Math.floor(r() * n), s = S[i];
      if (Math.abs(s.curv) < 0.008 && r() > 0.12) continue;
      const hwL = s.hwL ?? s.hw, hwR = s.hwR ?? s.hw;
      // lontano dalla traiettoria, verso i bordi
      const side = r() < 0.6 ? Math.sign(s.curv || 1) : -Math.sign(s.curv || 1);
      const edge = side > 0 ? hwL : -hwR;
      const from = off[i] + side * 2.2;
      const d = from + (edge - side * 0.4 - from) * Math.pow(r(), 0.5);
      if (side > 0 ? d < from : d > from) continue;
      const along = (r() - 0.5) * this.track.step;
      const x = s.x + s.nx * d + s.tx * along, z = s.z + s.nz * d + s.tz * along;
      const y = s.y + this.track.surface({ i, i0: i, f: 0, d, s: s.s }, sf).h + 0.02;
      const sz = 0.03 + r() * 0.07, a = r() * 6.28;
      const ca = Math.cos(a) * sz, sa = Math.sin(a) * sz;
      const b = pos.length / 3;
      pos.push(x - ca, y, z - sa, x - sa, y, z + ca, x + ca, y, z + sa, x + sa, y, z - ca);
      // ordine di comparsa: ogni pallino ha la sua "soglia" di gara
      const th = r();
      for (let q = 0; q < 4; q++) col.push(th, th, th);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const uP = { value: 0.25 };
    const mat = new THREE.MeshBasicMaterial({ color: 0x0c0b0a, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uP = uP;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uP;')
        .replace('#include <color_fragment>', 'float th = vColor.r; diffuseColor.rgb = vec3(0.045, 0.04, 0.035); diffuseColor.a = 0.9 * step(th, uP);');
    };
    this.marbleP = uP;
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 1;
    this.group.add(m);
  }

  // ------------------------------------------------------------------ elicottero TV
  helicopter() {
    const h = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xeef1f4, roughness: 0.35, metalness: 0.2 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x1d4f9c, roughness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.05, metalness: 0.6 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), white); body.scale.set(2.1, 1, 1); h.add(body);
    const cab = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass); cab.scale.set(1.5, 0.9, 0.95); cab.position.set(1.3, 0.15, 0); cab.rotation.z = -0.5; h.add(cab);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.25, 2.62), blue); stripe.position.y = -0.2; stripe.scale.set(1, 1, 1); h.add(stripe);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.35, 5.5, 8), white); boom.rotation.z = Math.PI / 2; boom.position.set(-4.6, 0.35, 0); h.add(boom);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(1, 1.6, 0.12), blue); fin.position.set(-7.1, 1.0, 0); fin.rotation.z = -0.35; h.add(fin);
    for (const s of [-1, 1]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 0.1), dark); sk.position.set(0.2, -1.45, s * 0.9); h.add(sk); }
    // telecamera sotto il muso
    const camBall = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), dark); camBall.position.set(2.3, -0.9, 0); h.add(camBall);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 6), dark); mast.position.set(0, 1.4, 0); h.add(mast);
    // rotore: pale + disco sfocato
    const rotor = new THREE.Group(); rotor.position.set(0, 1.72, 0);
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.04, 0.28), dark); b.position.x = 2.7; const p = new THREE.Group(); p.rotation.y = k * Math.PI / 2; p.add(b); rotor.add(p); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.4, 32), new THREE.MeshBasicMaterial({ color: 0x20242a, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2; rotor.add(disc);
    h.add(rotor);
    const tail = new THREE.Group(); tail.position.set(-7.2, 1.0, 0.18);
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.04), dark); tail.add(tb);
    h.add(tail);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.2, 0.1), toneMapped: false }));
    beacon.position.set(-1, 1.25, 0); h.add(beacon);
    h.scale.setScalar(0.9);
    this.heli = { root: h, rotor, tail, beacon, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, init: false, orbit: 0 };
    this.group.add(h);
  }

  updateHeli(dt, focus) {
    const H = this.heli;
    if (!focus) return;
    H.orbit += dt * 0.05;
    // davanti e di lato alla vettura inquadrata, a 55-70 m d'altezza
    const fx = Math.cos(focus.yaw), fz = Math.sin(focus.yaw);
    const a = Math.sin(H.orbit) * 0.9;
    const tx = focus.x + fx * 45 * Math.cos(a) - fz * 55 * Math.sin(a + 0.6);
    const tz = focus.z + fz * 45 * Math.cos(a) + fx * 55 * Math.sin(a + 0.6);
    const ty = focus.y + 58 + Math.sin(this.time * 0.3) * 4;
    if (!H.init || H.pos.distanceToSquared(_t.set(tx, ty, tz)) > 600 * 600) { H.pos.set(tx, ty, tz); H.vel.set(0, 0, 0); H.init = true; }
    // segue con inerzia (come un pilota vero)
    _t.set(tx, ty, tz).sub(H.pos);
    H.vel.addScaledVector(_t, dt * 0.9).multiplyScalar(Math.exp(-dt * 1.4));
    const sp = H.vel.length(); if (sp > 95) H.vel.multiplyScalar(95 / sp);
    H.pos.addScaledVector(H.vel, dt);
    const yaw = H.vel.lengthSq() > 4 ? Math.atan2(H.vel.z, H.vel.x) : H.yaw;
    let dy = yaw - H.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    H.yaw += dy * Math.min(1, dt * 1.5);
    const R = H.root;
    R.position.copy(H.pos);
    R.rotation.set(0, -H.yaw, 0);
    R.rotateZ(-Math.min(0.3, sp / 250));              // muso giù in avanzamento
    R.rotateX(Math.max(-0.35, Math.min(0.35, -dy * 0.8)));
    H.rotor.rotation.y += dt * 42; H.tail.rotation.z += dt * 70;
    H.beacon.visible = (this.time % 1.2) < 0.12;
  }

  // ------------------------------------------------------------------ gabbiani
  gulls() {
    const sc = this.scenery, r = rand(5);
    const segs = sc.coastSeg || [];
    const c = sc.center || { x: 0, z: 0 };
    const near = segs.filter(([a]) => Math.hypot(a[0] - c.x, a[1] - c.z) < 1400);
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.25, 0, 0.9, 0.35, 0, 0.25, 0, 0, 0, 0.35, 0, 0.25, -0.15, 0, 0.0], 3));
    wing.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.8, side: THREE.DoubleSide });
    const bodyG = new THREE.SphereGeometry(0.16, 6, 4).scale(2.6, 0.8, 0.8);
    this.birds = [];
    const N = near.length ? 16 : 0;
    for (let k = 0; k < N; k++) {
      const [a, b] = near[Math.floor(r() * near.length)];
      const t = r();
      const g = new THREE.Group();
      g.add(new THREE.Mesh(bodyG, mat));
      const L = new THREE.Mesh(wing, mat), Rw = new THREE.Mesh(wing, mat);
      Rw.scale.z = -1;
      g.add(L, Rw);
      g.scale.setScalar(1.6);
      this.group.add(g);
      this.birds.push({ g, L, R: Rw, cx: a[0] + (b[0] - a[0]) * t, cz: a[1] + (b[1] - a[1]) * t, cy: 18 + r() * 30, rad: 25 + r() * 60, w: (0.15 + r() * 0.2) * (r() < 0.5 ? -1 : 1), ph: r() * 6.28, fl: 5 + r() * 3 });
    }
  }

  updateGulls(dt) {
    for (const b of this.birds) {
      b.ph += b.w * dt;
      const x = b.cx + Math.cos(b.ph) * b.rad, z = b.cz + Math.sin(b.ph) * b.rad;
      b.g.position.set(x, b.cy + Math.sin(b.ph * 3) * 2, z);
      b.g.rotation.set(0, -(b.ph + Math.sign(b.w) * Math.PI / 2), Math.sign(b.w) * 0.25);
      // battito d'ali alternato a planate
      const glide = Math.sin(this.time * 0.5 + b.ph * 2) > 0.2;
      const f = glide ? 0.12 : Math.sin(this.time * b.fl + b.ph * 10) * 0.6;
      b.L.rotation.x = f; b.R.rotation.x = -f;
    }
  }

  // ------------------------------------------------------------------ per frame
  // ctx: { cars: [{ p (fisica), f1, player }], focus, progress 0..1, started, finished, stands }
  update(dt, ctx) {
    this.time += dt;
    if (this.marbleP) this.marbleP.value = 0.22 + 0.78 * Math.min(1, ctx.progress || 0);
    this.updateHeli(dt, ctx.focus);
    this.updateGulls(dt);
    if (ctx.finished) this.finish();
    if (dt > 0) {
      for (const c of ctx.cars) this.carFx(dt, c);
      this.spectacle(dt, ctx);
    }
    this.mist.update(dt);
    this.fire.update(dt);
  }

  carFx(dt, c) {
    const p = c.p, cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    const key = c.key;
    const prev = this.prev.get(key);
    const yawRate = prev ? angDiff(p.yaw, prev.yaw) / Math.max(1e-3, dt) : 0;
    const lat = Math.abs(yawRate * p.speed);
    // scie d'aria dalle punte degli alettoni: in curva veloce (carico alto) si condensa l'umidità
    // (solo le punte dell'alettone posteriore, solo in curva davvero veloce: una scia sottile, non una nuvola)
    const tips = c.f1 ? [[-2.55, 0.95, 0.5], [-2.55, 0.95, -0.5]] : [[-2.25, 1.15, 0.85], [-2.25, 1.15, -0.85]];
    const k = Math.max(0, Math.min(1, (p.speed - 55) / 25)) * Math.max(0, Math.min(1, (lat - 14) / 18)) * (c.key === 'me' ? 1 : 0.5);
    const now = tips.map(([b, h, l]) => [p.x + cy * b - sy * l, p.y + h, p.z + sy * b + cy * l]);
    if (prev && k > 0.02 && dt > 0) {
      now.forEach((q, j) => {
        const o = prev.tips[j];
        const dist = Math.hypot(q[0] - o[0], q[2] - o[2]);
        if (dist > 8) return;
        const cnt = Math.min(3, Math.ceil(dist / 0.9));
        const front = j >= 2;
        for (let s = 0; s < cnt; s++) {
          const t = (s + Math.random()) / cnt;
          this.mist.emit(o[0] + (q[0] - o[0]) * t, o[1] + (q[1] - o[1]) * t, o[2] + (q[2] - o[2]) * t,
            { color: [0.95, 0.96, 0.98], size: front ? 0.07 : 0.09, grow: 0.2, life: 0.25 + Math.random() * 0.2, alpha: k * 0.3, drag: 0.5, vy: 0.05 });
        }
      });
    }
    this.prev.set(key, { yaw: p.yaw, tips: now });
    if (p.speed < 2) return;
    // polvere sollevata dalla scia (più nella città vecchia, stradine strette e sporche)
    const old = this.scenery.isOldTown ? this.scenery.isOldTown(p.x, p.z) : false;
    const dust = Math.min(1, p.speed / 60) * (old ? 2.2 : 0.55);
    if (Math.random() < dust * dt * 14) {
      const b = -2.6 - Math.random(), l = (Math.random() - 0.5) * 1.8;
      this.mist.emit(p.x + cy * b - sy * l, p.y + 0.15, p.z + sy * b + cy * l, { color: [0.78, 0.7, 0.58], size: 1.0 + Math.random(), grow: 2.5, life: 1.2 + Math.random(), alpha: old ? 0.16 : 0.08,
        vx: p.vx * 0.25 + (Math.random() - 0.5) * 2, vy: 0.4 + Math.random() * 0.6, vz: p.vz * 0.25 + (Math.random() - 0.5) * 2, drag: 1.6 });
    }
    // foglie sollevate al passaggio, nella città vecchia
    if (old && p.speed > 25 && Math.random() < dt * 10) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = p.x + -sy * side * 3.5, z = p.z + cy * side * 3.5;
      const leaf = Math.random() < 0.5 ? [0.42, 0.33, 0.12] : [0.36, 0.42, 0.14];
      this.mist.emit(x, p.y + 0.1, z, { color: leaf, size: 0.09, life: 2.5, alpha: 0.95,
        vx: p.vx * 0.35 + (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 3, vz: p.vz * 0.35 + (Math.random() - 0.5) * 4, grav: 2.2, drag: 1.1 });
    }
    // partenza: fumo delle gomme posteriori mentre si scatta da fermi
    // (poco: un velo dietro le ruote motrici, non una nuvola su tutta la griglia)
    if (this.startT >= 0 && this.time - this.startT < 1.6 && p.speed < 20 && (c.key === 'me' || Math.random() < 0.35)) {
      for (const l of [-0.75, 0.75]) if (Math.random() < dt * 6) {
        const b = c.f1 ? -1.7 : -1.4;
        this.mist.emit(p.x + cy * b - sy * l, p.y + 0.25, p.z + sy * b + cy * l, { color: [0.88, 0.88, 0.9], size: 0.8, grow: 2.5, life: 1.4, alpha: 0.14,
          vx: -cy * 3 + (Math.random() - 0.5) * 2, vy: 0.6, vz: -sy * 3 + (Math.random() - 0.5) * 2, drag: 1.2 });
      }
    }
  }

  // flash dei fotografi, coriandoli e fuochi d'artificio
  spectacle(dt, ctx) {
    const stands = ctx.stands || [];
    const st = this.startT >= 0 ? this.time - this.startT : 1e9, fin = this.finishT >= 0 ? this.time - this.finishT : 1e9;
    const flashRate = (ctx.countdown ? 6 : 0) + (st < 6 ? 14 : 0) + (fin < 30 ? 10 : 0);
    if (flashRate && stands.length) {
      let n = flashRate * dt;
      while (n > 0 && (n >= 1 || Math.random() < n)) {
        n -= 1;
        const s = stands[Math.floor(Math.random() * stands.length)];
        this.fire.emit(s.x + (Math.random() - 0.5) * 40, s.y + 2 + Math.random() * 9, s.z + (Math.random() - 0.5) * 40, { color: [7, 7, 7.5], size: 0.7, life: 0.07, alpha: 1 });
      }
    }
    const f = ctx.focus;
    if (!f) return;
    // coriandoli sopra la vettura appena arrivata
    if (fin < 7 && Math.random() < dt * 60) {
      const cols = [[0.1, 0.45, 0.85], [0.85, 0.12, 0.2], [0.15, 0.65, 0.3], [1, 0.85, 0.2], [1, 1, 1]];
      const a = Math.random() * 6.28, d = Math.random() * 14;
      this.mist.emit(f.x + Math.cos(a) * d + f.vx * 0.8, f.y + 9 + Math.random() * 5, f.z + Math.sin(a) * d + f.vz * 0.8, { color: cols[Math.floor(Math.random() * cols.length)], size: 0.12, life: 3.5, alpha: 1,
        vx: (Math.random() - 0.5) * 3, vy: -1, vz: (Math.random() - 0.5) * 3, grav: 0.6, drag: 1.5 });
    }
    // fuochi d'artificio sopra la città (davanti a chi guarda)
    if (fin < 35 && Math.random() < dt * 1.6) {
      const dir = ctx.camDir || { x: Math.cos(f.yaw), z: Math.sin(f.yaw) };
      const a = Math.atan2(dir.z, dir.x) + (Math.random() - 0.5) * 1.2, d = 140 + Math.random() * 160;
      this.rockets.push({ x: f.x + Math.cos(a) * d, y: f.y, z: f.z + Math.sin(a) * d, vy: 38 + Math.random() * 12, t: 1.4 + Math.random() * 0.6,
        col: [[3, 0.6, 0.3], [0.4, 1.2, 3.2], [0.5, 3, 0.8], [3, 2.4, 0.6], [2.6, 0.6, 2.6], [3, 3, 3]][Math.floor(Math.random() * 6)] });
    }
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const R = this.rockets[i];
      R.t -= dt; R.y += R.vy * dt; R.vy -= 9.8 * dt * 0.6;
      this.fire.emit(R.x, R.y, R.z, { color: [2.2, 1.4, 0.6], size: 0.5, life: 0.5, alpha: 0.6, vy: -2, drag: 2 });
      if (R.t <= 0) {
        this.rockets.splice(i, 1);
        const N = this.high ? 140 : 70;
        for (let k = 0; k < N; k++) {
          const u = Math.random() * 2 - 1, th = Math.random() * 6.28, s = Math.sqrt(1 - u * u), v = 22 + Math.random() * 4;
          this.fire.emit(R.x, R.y, R.z, { color: R.col, size: 1.4, life: 1.6 + Math.random() * 0.8, alpha: 1,
            vx: s * Math.cos(th) * v, vy: u * v, vz: s * Math.sin(th) * v, grav: 4, drag: 1.3 });
        }
      }
    }
  }
}

const _t = new THREE.Vector3();
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
