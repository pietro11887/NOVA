import * as THREE from 'three';
import { Scenery, ENV } from './scenery.js';
import { PIT, TRACK } from './trackData.js';
import { setAniso, triplanar, meadow } from './pbr.js';
import { buildTrees } from './trees.js';

// Circuit de Spa-Francorchamps ricostruito da dati pubblici (OpenStreetMap + modello del terreno EU-DEM):
// colline vere delle Ardenne, boschi di abeti dove ci sono davvero, prati, strade e case del posto
// (muri chiari o in pietra, tetti di ardesia), box lungo la corsia vera, tribune alle curve.

function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(), E = new THREE.Euler();
const mat4 = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => { E.set(rx, ry, rz, 'YXZ'); Q.setFromEuler(E); return new THREE.Matrix4().compose(V.set(x, y, z), Q, SC.set(sx, sy, sz)); };
void M4;
function pip(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) c = !c;
  }
  return c;
}
function bbox(p) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return { x0, x1, z0, z1 }; }

export class SpaScenery extends Scenery {
  constructor(scene, track, renderer, quality) {
    super(scene, track, renderer, quality);
    this.data = TRACK.data;
    const G = this.data.grid;
    this.dem = G;
    this.terrainBox = { x0: G.x0 + 60, x1: G.x0 + (G.nx - 1) * G.step - 60, z0: G.z0 + 60, z1: G.z0 + (G.nz - 1) * G.step - 60 };
    this.floorY = Math.min(...G.h) - 20;
    this.forests = this.data.forest.map(p => ({ p, b: bbox(p) }));
    this.meadows = this.data.meadow.map(p => ({ p, b: bbox(p) }));
    this.brand = { stand: 'SPA-FRANCORCHAMPS', standBg: ['#1a1a1a', '#e2001a'] };
  }

  setupLake() { this.lake = null; }

  // niente oggetti sull'asfalto: un punto libero deve stare anche oltre i muri di ogni tratto di pista
  // (nel tornante della Source e alla Bus Stop il "fuori" di un tratto è la pista dell'altro)
  free(x, z, r) { return this.clearance(x, z).d > r + 0.5 && super.free(x, z, r); }

  // tribune: come nella scenografia base, ma solo dove c'è spazio vero (mai sopra la pista)
  place(obj, i, side, extra) {
    for (let k = 0; k < 6; k++) {
      const s = this.track.samples[(i + this.track.count) % this.track.count];
      const wall = side > 0 ? (s.wallLVis ?? s.wallL) : (s.wallRVis ?? s.wallR);
      const d = (wall + extra + k * 12) * side, x = s.x + s.nx * d, z = s.z + s.nz * d;
      const R = (obj.userData.radius || 30) * 0.8;
      let ok = true;
      for (let a = 0; a < 8 && ok; a++) { const px = x + Math.cos(a * 0.785) * R * 0.7, pz = z + Math.sin(a * 0.785) * R * 0.7; if (this.clearance(px, pz).d < 3) ok = false; }
      if (ok && this.clearance(x, z).d > 3) return super.place(obj, i, side, extra + k * 12);
    }
    obj.visible = false; obj.userData.flags = []; return obj;
  }

  demAt(x, z) {
    const G = this.dem;
    const fx = Math.max(0, Math.min(G.nx - 1.001, (x - G.x0) / G.step)), fz = Math.max(0, Math.min(G.nz - 1.001, (z - G.z0) / G.step));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, H = G.h, W = G.nx;
    const a = H[j * W + i], b = H[j * W + i + 1], c = H[(j + 1) * W + i], d = H[(j + 1) * W + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  // quota: vicino alla pista quella della pista, più in là il terreno vero (modello del terreno)
  baseHeight(x, z) {
    const nr = this.nearest(x, z, 6);
    const s = this.track.samples[nr.i];
    const wall = Math.max(s.wallLVis ?? s.wallL, s.wallRVis ?? s.wallR);
    const t = smooth(wall + 4, wall + 60, nr.d);
    const dem = this.demAt(x, z);
    return (s.y - 0.5) * (1 - t) + dem * t;
  }

  inForest(x, z) { for (const f of this.forests) if (x > f.b.x0 && x < f.b.x1 && z > f.b.z0 && z < f.b.z1 && pip(f.p, x, z)) return true; return false; }
  inMeadow(x, z) { for (const f of this.meadows) if (x > f.b.x0 && x < f.b.x1 && z > f.b.z0 && z < f.b.z1 && pip(f.p, x, z)) return true; return false; }

  build() {
    setAniso(this.aniso);
    if (!this.low) triplanar(this.colored, 'concrete', { scale: 3, strength: 0.45, normal: 0.6 });
    const steps = ['sky', 'terrain', 'roads', 'pitGarages', 'grandstands', 'gantry', 'billboards', 'bigScreen', 'trackside', 'brakeBoards',
      'spectators', 'houses', 'forestTrees', 'bushes'];
    for (const s of steps) { const t0 = performance.now(); this[s](); if (window.__perfLog) console.log('PERF', s, Math.round(performance.now() - t0)); }
    this.batch.flush(this.group);
  }

  // terreno vero (modello del terreno a 50 m) intorno alla pista; oltre i dati, colline boscose
  // delle Ardenne fino all'orizzonte (la griglia si allarga verso l'esterno, senza cuciture)
  terrain() {
    const tb = this.terrainBox, step = this.low ? 16 : 10;
    const axis = (a0, a1) => {
      const out = [], n = Math.ceil((a1 - a0) / step);
      for (let k = 12; k >= 1; k--) out.push(a0 - 60 * (Math.pow(1.38, k) - 1));
      for (let i = 0; i <= n; i++) out.push(a0 + (a1 - a0) * i / n);
      for (let k = 1; k <= 12; k++) out.push(a1 + 60 * (Math.pow(1.38, k) - 1));
      return out;
    };
    const XS = axis(tb.x0, tb.x1), ZS = axis(tb.z0, tb.z1), nx = XS.length - 1, nz = ZS.length - 1;
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3), col = new Float32Array((nx + 1) * (nz + 1) * 3);
    const c = new THREE.Color(), r = rand(5);
    const GRASS = new THREE.Color(0x6a8f4a), FOREST = new THREE.Color(0x3c4e2c), MEADOW = new THREE.Color(0x7a9a52), FAR = new THREE.Color(0x34482c);
    const hills = (x, z) => 70 + 60 * Math.sin(x * 0.0011 + 0.7) * Math.cos(z * 0.0009 + 1.1) + 35 * Math.sin(x * 0.0031 + z * 0.0024) + 12 * Math.sin(x * 0.009 - z * 0.007);
    let k = 0;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++, k++) {
      const x = XS[i], z = ZS[j];
      const cx = Math.max(tb.x0, Math.min(tb.x1, x)), cz = Math.max(tb.z0, Math.min(tb.z1, z)), e = Math.hypot(x - cx, z - cz);
      let y;
      if (e > 0) {
        const t = smooth(0, 1800, e);
        y = this.demAt(cx, cz) * (1 - t) + hills(x, z) * t;
        c.copy(FAR);
      } else {
        y = this.heightAt(x, z);
        if (this.inForest(x, z)) c.copy(FOREST); else if (this.inMeadow(x, z)) c.copy(MEADOW); else c.copy(GRASS);
      }
      const n = Math.sin(x * 0.05) * Math.cos(z * 0.04) * 0.5 + 0.5;
      c.offsetHSL((n - 0.5) * 0.03, 0, (r() - 0.5) * 0.05);
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    // il terreno resta sotto ogni tratto di pista e della corsia box
    const sx = (tb.x1 - tb.x0) / Math.ceil((tb.x1 - tb.x0) / step), sz = (tb.z1 - tb.z0) / Math.ceil((tb.z1 - tb.z0) / step);
    const stepXZ = Math.max(sx, sz), I0 = 12;
    const lower = (px, pz, R, top) => {
      const i0 = Math.max(0, Math.floor((px - R - tb.x0) / sx + I0)), i1 = Math.min(nx, Math.ceil((px + R - tb.x0) / sx + I0));
      const j0 = Math.max(0, Math.floor((pz - R - tb.z0) / sz + I0)), j1 = Math.min(nz, Math.ceil((pz + R - tb.z0) / sz + I0));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const q = j * (nx + 1) + i;
        if (pos[q * 3 + 1] > top && (XS[i] - px) ** 2 + (ZS[j] - pz) ** 2 < R * R) pos[q * 3 + 1] = top;
      }
    };
    for (const sm of this.track.samples) lower(sm.x, sm.z, Math.max(sm.wallL, sm.wallR) + stepXZ * 1.6, sm.y - 0.35);
    for (const p of this.track.pit.pts) lower(p.x, p.z, PIT.halfW + 2 + stepXZ * 1.6, p.y - 0.35);
    const idx = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b2 = a + 1, c2 = a + nx + 1, d = c2 + 1;
      idx.push(a, c2, b2, b2, c2, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const tm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: this.low });
    if (!this.low) meadow(tm);
    const mesh = new THREE.Mesh(geo, tm); mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  // strade del posto (asfalto), appena sopra il terreno
  roads() {
    const pos = [], ASPH = new THREE.Color(0x55575b), col = [];
    for (const rd of this.data.roads) {
      for (let k = 1; k < rd.p.length; k++) {
        const a = rd.p[k - 1], b = rd.p[k], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const ns = Math.max(1, Math.ceil(len / 10));
        for (let q = 0; q < ns; q++) {
          const ax = a[0] + (b[0] - a[0]) * q / ns, az = a[1] + (b[1] - a[1]) * q / ns, bx = a[0] + (b[0] - a[0]) * (q + 1) / ns, bz = a[1] + (b[1] - a[1]) * (q + 1) / ns;
          if (this.clearance(ax, az).d < 1 || this.clearance(bx, bz).d < 1) continue;
          if (ax < this.terrainBox.x0 || ax > this.terrainBox.x1 || az < this.terrainBox.z0 || az > this.terrainBox.z1) continue;
          const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, w = rd.w / 2, nx = -dz / l * w, nz = dx / l * w;
          const ya = this.heightAt(ax, az) + 0.12, yb = this.heightAt(bx, bz) + 0.12;
          pos.push(ax + nx, ya, az + nz, bx + nx, yb, bz + nz, bx - nx, yb, bz - nz, ax + nx, ya, az + nz, bx - nx, yb, bz - nz, ax - nx, ya, az - nz);
          for (let t = 0; t < 6; t++) col.push(ASPH.r, ASPH.g, ASPH.b);
        }
      }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.receiveShadow = true;
    this.group.add(m);
  }

  // box lungo la corsia vera: garage delle squadre, piano superiore vetrato e terrazza
  pitGarages() {
    const pts = this.track.pit.pts, sd = PIT.side;
    if (!pts || !pts.length) return;
    const at = ss => { let lo = 0, hi = pts.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].ss < ss) lo = m; else hi = m; } return pts[lo]; };
    const teams = [0xff8a1c, 0xd8231f, 0x2a62c9, 0x1f9a4a, 0xf5c518, 0x6a2cd8, 0x111111, 0xf2f2f2, 0x27c3ea, 0xe0457b];
    const gw = PIT.boxGap;
    for (let k = -2; k <= 22; k++) {
      const p = at(PIT.boxFrom + k * gw);
      const off = PIT.halfW + 1.2 + 8;
      const x = p.x + p.nx * sd * off, z = p.z + p.nz * sd * off;
      const ry = Math.atan2(-p.nx * sd, -p.nz * sd);
      const fx = Math.sin(ry), fz = Math.cos(ry), y = p.y;
      const team = k < 0 || k > 19 ? 0xe9eaec : teams[k % teams.length];
      this.batch.add(new THREE.BoxGeometry(gw, 7, 16), this.colored, mat4(x, y + 3.5, z, ry), 0xe9ebee);
      this.batch.add(new THREE.BoxGeometry(gw - 2.4, 5, 0.2), this.colored, mat4(x + fx * 8.0, y + 2.5, z + fz * 8.0, ry), k < 0 || k > 19 ? 0x8a9099 : 0x22252b);
      this.batch.add(new THREE.BoxGeometry(gw, 1.0, 0.3), this.colored, mat4(x + fx * 8.05, y + 6.2, z + fz * 8.05, ry), team);
      this.batch.add(new THREE.BoxGeometry(gw, 4.2, 12), this.colored, mat4(x - fx * 2, y + 9.1, z - fz * 2, ry), 0x5f7486);
      this.batch.add(new THREE.BoxGeometry(gw, 0.5, 16.6), this.colored, mat4(x, y + 11.45, z, ry), 0x1b1d22);
      this.occupied.push([x, z, 13]);
    }
  }

  // case delle Ardenne (OpenStreetMap): muri chiari o in pietra, tetti a due falde di ardesia scura
  houses() {
    const r = rand(77);
    const WALLS = [0xe9e6df, 0xd9d4ca, 0xc9c3b8, 0xb9b2a6, 0xece8e0, 0x9b9184].map(h => new THREE.Color(h));
    const SLATE = new THREE.Color(0x3a3d44);
    const pos = [], col = [];
    const tri = (a, b, c, cc) => { pos.push(...a, ...b, ...c); for (let q = 0; q < 3; q++) col.push(cc.r, cc.g, cc.b); };
    for (const b of this.data.buildings) {
      const p = b.p;
      let ok = true;
      for (const [x, z] of p) if (this.clearance(x, z).d < 2) { ok = false; break; }
      if (!ok) continue;
      let gmin = Infinity; for (const [x, z] of p) gmin = Math.min(gmin, this.heightAt(x, z));
      const big = b.k === 'grandstand' || b.k === 'commercial' || b.k === 'industrial' || b.h > 11;
      const h = Math.min(b.h, 22), base = gmin - 1.5, top = gmin + h;
      const wc = big ? new THREE.Color(0xdfe2e6) : WALLS[Math.floor(r() * WALLS.length)];
      // muri
      let A = 0; for (let i = 0; i < p.length; i++) { const a = p[i], c = p[(i + 1) % p.length]; A += a[0] * c[1] - c[0] * a[1]; }
      const pts = A > 0 ? p.slice().reverse() : p;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], c = pts[(i + 1) % pts.length];
        tri([a[0], base, a[1]], [c[0], base, c[1]], [c[0], top, c[1]], wc);
        tri([a[0], base, a[1]], [c[0], top, c[1]], [a[0], top, a[1]], wc);
      }
      // tetto: a due falde per le case quasi rettangolari, piatto per i capannoni
      if (!big && pts.length >= 4 && pts.length <= 6) {
        let best = 0, ax = 0, az = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length], l = Math.hypot(c[0] - a[0], c[1] - a[1]); if (l > best) { best = l; ax = (c[0] - a[0]) / l; az = (c[1] - a[1]) / l; } }
        const cx = pts.reduce((s2, q) => s2 + q[0], 0) / pts.length, cz = pts.reduce((s2, q) => s2 + q[1], 0) / pts.length;
        let wmax = 0; for (const q of pts) wmax = Math.max(wmax, Math.abs((q[0] - cx) * -az + (q[1] - cz) * ax));
        const ridgeH = top + Math.min(5, wmax * 0.75);
        // ogni lato: dal bordo al colmo (proiezione dei vertici sulla linea di colmo)
        const ridge = q => { const t = (q[0] - cx) * ax + (q[1] - cz) * az; return [cx + ax * t, ridgeH, cz + az * t]; };
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], c = pts[(i + 1) % pts.length];
          const ra = ridge(a), rc = ridge(c);
          tri([a[0], top, a[1]], [c[0], top, c[1]], rc, SLATE);
          tri([a[0], top, a[1]], rc, ra, SLATE);
        }
      } else {
        const tr = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
        const rc = big ? new THREE.Color(0x8d9096) : SLATE;
        for (const [i0, i1, i2] of tr) {
          const p0 = pts[i0], p1 = pts[i1], p2 = pts[i2];
          const ny = (p1[1] - p0[1]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[1] - p0[1]);
          const o = ny >= 0 ? [p0, p1, p2] : [p0, p2, p1];
          tri([o[0][0], top, o[0][1]], [o[1][0], top, o[1][1]], [o[2][0], top, o[2][1]], rc);
        }
      }
      const cx = p.reduce((s2, q) => s2 + q[0], 0) / p.length, cz = p.reduce((s2, q) => s2 + q[1], 0) / p.length;
      this.occupied.push([cx, cz, Math.sqrt(Math.abs(A) / 2) * 0.6 + 2]);
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.colored); m.castShadow = true; m.receiveShadow = true;
    this.group.add(m);
  }

  // i boschi veri delle Ardenne: vicino alla pista abeti fitti (con qualche faggio), più in là
  // la volta compatta delle chiome (una superficie a gobbe sopra i boschi) come si vede dalla pista
  forestTrees() {
    const r = rand(42);
    const max = this.low ? 3500 : this.quality === 'high' ? 14000 : 8000;
    const L = { pine: [[], []], broad: [[], []] };
    let count = 0;
    const tint = sp => sp === 'broad' ? new THREE.Color().setHSL(0.24 + r() * 0.05, 0.3, 0.55 + r() * 0.15) : new THREE.Color().setHSL(0.31 + r() * 0.04, 0.22, 0.36 + r() * 0.12);
    const put = (x, z, cl, sp) => {
      const s1 = sp === 'pine' ? 1.5 + r() * 0.9 : 1.0 + r() * 0.6;
      L[sp][cl < 90 ? 0 : 1].push([mat4(x, this.heightAt(x, z) - 0.3, z, r() * 6.28, s1 * (0.9 + r() * 0.2), s1 * (1 + r() * 0.35), s1), tint(sp)]);
      count++;
    };
    const tb = this.terrainBox;
    // fascia lungo la pista: un albero ogni ~5-6 m dove c'è il bosco, più rado verso l'interno
    for (const band of [[8, 70, 5.5], [70, 190, 9]]) {
      const [d0, d1, sp] = band;
      for (let x = tb.x0; x < tb.x1 && count < max; x += sp) for (let z = tb.z0; z < tb.z1 && count < max; z += sp) {
        const px = x + (r() - 0.5) * sp * 0.9, pz = z + (r() - 0.5) * sp * 0.9;
        const cl = this.clearance(px, pz).d;
        if (cl < d0 || cl > d1 || !this.inForest(px, pz) || !this.free(px, pz, 2)) continue;
        put(px, pz, cl, r() < 0.8 ? 'pine' : 'broad');
      }
    }
    // alberi sparsi nei prati e lungo le strade
    for (let t = 0; t < 2500 && count < max; t++) {
      const x = tb.x0 + r() * (tb.x1 - tb.x0), z = tb.z0 + r() * (tb.z1 - tb.z0);
      const cl = this.clearance(x, z).d;
      if (cl < 12 || cl > 500 || this.inForest(x, z) || !this.free(x, z, 3) || r() > 0.3) continue;
      put(x, z, cl, r() < 0.4 ? 'pine' : 'broad');
    }
    for (const near of [0, 1]) {
      const T = buildTrees(this.group, { pine: L.pine[near], broad: L.broad[near] }, { shadows: near === 0 && !this.low });
      if (near === 0) this.animated.push(t => T.update(t));
    }
    this.canopy();
  }

  canopy() {
    const tb = this.terrainBox, st = 12;
    const nx = Math.ceil((tb.x1 - tb.x0) / st), nz = Math.ceil((tb.z1 - tb.z0) / st);
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3), col = new Float32Array((nx + 1) * (nz + 1) * 3);
    const r = rand(9), c = new THREE.Color();
    let k = 0;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++, k++) {
      const x = tb.x0 + i * st, z = tb.z0 + j * st;
      const g = this.heightAt(x, z);
      const inF = this.inForest(x, z) && this.clearance(x, z).d > 150;
      const y = inF ? g + 15 + r() * 6 + 3 * Math.sin(x * 0.07) * Math.cos(z * 0.06) : g - 8;
      c.setHSL(0.3 + r() * 0.05, 0.3, 0.13 + r() * 0.07);
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    const idx = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c2 = a + nx + 1, d = c2 + 1;
      // solo i quadrati che hanno almeno un vertice nel bosco
      if (Math.max(pos[a * 3 + 1] - this.heightAt(pos[a * 3], pos[a * 3 + 2]), pos[b * 3 + 1] - this.heightAt(pos[b * 3], pos[b * 3 + 2]),
        pos[c2 * 3 + 1] - this.heightAt(pos[c2 * 3], pos[c2 * 3 + 2]), pos[d * 3 + 1] - this.heightAt(pos[d * 3], pos[d * 3 + 2])) < 0) continue;
      idx.push(a, c2, b, b, c2, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    if (!this.low) triplanar(m, 'grass', { scale: 9, strength: 0.6, normal: 1.4 });
    const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  // niente lago, campeggio, pale eoliche o mongolfiere: a Spa c'è il bosco
  campsite() {}
  village() {}
  windFarm() {}
  balloons() {}
}

void ENV;
